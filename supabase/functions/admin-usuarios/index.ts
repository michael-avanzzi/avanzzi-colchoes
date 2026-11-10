/*
 * Avanzzi Agendamentos — administração de contas (somente admin).
 *
 * Ações (POST JSON):
 *   { acao: "criar", nome, email, telefone?, papel }
 *   { acao: "redefinir_senha", id }
 *
 * Ambas geram uma senha temporária, devolvida UMA vez para o admin repassar
 * ao usuário. O app exige a troca no primeiro acesso (app_metadata.trocar_senha).
 * Papel, nome, telefone e ativação são alterados pela rpc_admin_atualizar_perfil.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAPEIS = ["vendedor", "gerente", "admin"];

function responder(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function chaveAdmin() {
  const modernas = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modernas) {
    try {
      const parsed = JSON.parse(modernas);
      if (parsed?.default) return parsed.default as string;
    } catch {
      // usa a chave legada abaixo
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function senhaTemporaria() {
  // Sem caracteres ambíguos (0/O, 1/l/I) para facilitar o repasse.
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  const aleatorio = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
  return `Av-${aleatorio}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return responder({ error: "Método não permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const chave = chaveAdmin();
    if (!url || !chave) {
      return responder({ error: "Configuração do servidor incompleta." }, 500);
    }

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return responder({ error: "Sessão não autenticada." }, 401);

    const admin = createClient(url, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return responder({ error: "Sessão inválida." }, 401);

    const { data: chamador } = await admin
      .from("perfis")
      .select("id, papel, ativo")
      .eq("id", user.id)
      .maybeSingle();

    if (!chamador?.ativo || chamador.papel !== "admin") {
      return responder({ error: "Acesso restrito a administradores." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const acao = texto(body?.acao);

    if (acao === "criar") {
      const nome = texto(body?.nome);
      const email = texto(body?.email).toLowerCase();
      const telefone = texto(body?.telefone) || null;
      const papel = texto(body?.papel);

      if (nome.length < 2) return responder({ error: "Informe o nome." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return responder({ error: "E-mail inválido." }, 400);
      }
      if (!PAPEIS.includes(papel)) return responder({ error: "Papel inválido." }, 400);

      const { data: existente } = await admin
        .from("perfis")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (existente) {
        return responder({ error: "Já existe um usuário com este e-mail." }, 409);
      }

      const senha = senhaTemporaria();
      const { data: criado, error: criarError } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        app_metadata: { trocar_senha: true },
        user_metadata: { nome },
      });
      if (criarError || !criado.user) {
        throw criarError ?? new Error("Não foi possível criar a conta.");
      }

      // O trigger já criou o perfil inativo; aqui ele é liberado com o papel escolhido.
      const { error: perfilError } = await admin
        .from("perfis")
        .update({ nome, telefone, papel, ativo: true, atualizado_em: new Date().toISOString() })
        .eq("id", criado.user.id);
      if (perfilError) throw perfilError;

      return responder({ ok: true, id: criado.user.id, email, senha_temporaria: senha });
    }

    if (acao === "redefinir_senha") {
      const id = texto(body?.id);
      const { data: alvo } = await admin
        .from("perfis")
        .select("id, email")
        .eq("id", id)
        .maybeSingle();
      if (!alvo) return responder({ error: "Usuário não encontrado." }, 404);

      const senha = senhaTemporaria();
      const { error: updError } = await admin.auth.admin.updateUserById(alvo.id, {
        password: senha,
        app_metadata: { trocar_senha: true },
      });
      if (updError) throw updError;

      return responder({ ok: true, id: alvo.id, email: alvo.email, senha_temporaria: senha });
    }

    return responder({ error: "Ação inválida." }, 400);
  } catch (error) {
    console.error("[admin-usuarios]", error instanceof Error ? error.message : error);
    return responder(
      { error: error instanceof Error ? error.message : "Erro inesperado." },
      500,
    );
  }
});
