/*
 * Avanzzi — avisos do Ranking de vendas por notificação (Web Push).
 *
 * Chamada a cada 2 minutos pelo pg_cron (supabase/agendar_syscol.sql), com o
 * cabeçalho x-segredo. fn_reservar_avisos_vendas() devolve, uma única vez:
 *   - "lider": alguém assumiu o 1º lugar do mês;
 *   - "meta":  um vendedor bateu a meta do dia.
 * Cada aviso vai para todos os aparelhos inscritos (push_inscricoes) de usuários
 * ativos. Usa as mesmas chaves VAPID dos lembretes de agendamento.
 *
 * Implantar com "Verify JWT" DESLIGADO.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type Aviso = {
  tipo: "lider" | "meta";
  vendedor_id: string;
  nome: string;
  valor: number;
  meta?: number;
};

type Inscricao = { id: number; endpoint: string; p256dh: string; auth: string };

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

function responder(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const mes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" });

function primeiroNome(nome: string) {
  return (nome || "").trim().split(/\s+/)[0] || nome;
}

function mensagem(a: Aviso) {
  if (a.tipo === "lider") {
    return {
      title: "Novo 1º lugar no ranking",
      body: `${primeiroNome(a.nome)} assumiu a liderança de ${mes.format(new Date())} com ${moeda.format(a.valor)}.`,
      tag: "ranking-lider",
      url: "/ranking",
    };
  }
  return {
    title: "Meta do dia batida",
    body: `${primeiroNome(a.nome)} bateu a meta de hoje: ${moeda.format(a.valor)} de ${moeda.format(a.meta ?? 0)}.`,
    tag: `ranking-meta-${a.vendedor_id}`,
    url: "/ranking",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return responder({ error: "Método não permitido." }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", chaveAdmin(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: valido } = await admin.rpc("syscol_validar_token", {
    p_chave: "cron_segredo_sha256",
    p_token: req.headers.get("x-segredo") ?? "",
  });
  if (valido !== true) return responder({ error: "Não autorizado." }, 401);

  const publica = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const privada = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const assunto = Deno.env.get("VAPID_SUBJECT") ?? "";
  if (!publica || !privada || !assunto) return responder({ error: "Chaves VAPID não configuradas." }, 500);
  webpush.setVapidDetails(assunto, publica, privada);

  try {
    const { data, error } = await admin.rpc("fn_reservar_avisos_vendas");
    if (error) throw error;
    const avisos = (data ?? []) as Aviso[];
    if (avisos.length === 0) return responder({ ok: true, avisos: 0, envios: 0 });

    // Aparelhos de usuários ativos (a conta da TV não recebe push).
    const { data: perfis, error: perfisErro } = await admin
      .from("perfis")
      .select("id")
      .eq("ativo", true)
      .neq("papel", "tv");
    if (perfisErro) throw perfisErro;
    const ids = (perfis ?? []).map((p) => p.id as string);
    if (ids.length === 0) return responder({ ok: true, avisos: avisos.length, envios: 0 });

    const { data: inscricoes, error: inscErro } = await admin
      .from("push_inscricoes")
      .select("id, endpoint, p256dh, auth")
      .in("usuario_id", ids);
    if (inscErro) throw inscErro;

    let envios = 0;
    const expiradas = new Set<number>();
    for (const a of avisos) {
      const payload = JSON.stringify(mensagem(a));
      for (const i of (inscricoes ?? []) as Inscricao[]) {
        if (expiradas.has(i.id)) continue;
        try {
          await webpush.sendNotification(
            { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
            payload,
            { TTL: 60 * 60 * 6, urgency: "normal" },
          );
          envios++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) expiradas.add(i.id);
          else console.error("[syscol-avisos] envio", status, (e as Error).message);
        }
      }
    }

    if (expiradas.size) await admin.from("push_inscricoes").delete().in("id", [...expiradas]);
    return responder({ ok: true, avisos: avisos.length, envios, expiradas: expiradas.size });
  } catch (error) {
    console.error("[syscol-avisos]", error instanceof Error ? error.message : error);
    return responder({ error: "Falha ao processar avisos." }, 500);
  }
});
