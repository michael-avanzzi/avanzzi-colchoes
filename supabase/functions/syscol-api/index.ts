/*
 * Avanzzi — ponte somente leitura para a API do Syscol (Fábrica de Sistemas).
 *
 * Uso para manutenção (investigar tabelas e colunas antes de mudar a
 * sincronização). Chamada pelo SQL Editor com pg_net, com o cabeçalho
 * x-segredo (o mesmo segredo do cron, guardado no Vault):
 *
 *   select net.http_post(
 *     url := 'https://<projeto>.supabase.co/functions/v1/syscol-api',
 *     headers := jsonb_build_object('Content-Type','application/json',
 *       'x-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'syscol_segredo')),
 *     body := '{"action":"columns","tablename":"pedidos"}'::jsonb);
 *
 * Ações: tables | columns {tablename} | query {tablename, columns?, filters?, sort?, pagesize?, pagenumber?}
 * A API do Syscol só lê dados; a chave (SYSCOL_API_KEY) nunca volta na resposta.
 * Implantar com "Verify JWT" DESLIGADO.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BASE = "https://api.fabricasistemas.com.br/api/v1/database";

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

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", chaveAdmin(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function responder(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return responder({ error: "Método não permitido." }, 405);

  const { data: valido } = await admin.rpc("syscol_validar_token", {
    p_chave: "cron_segredo_sha256",
    p_token: req.headers.get("x-segredo") ?? "",
  });
  if (valido !== true) return responder({ error: "Não autorizado." }, 401);

  const apikey = Deno.env.get("SYSCOL_API_KEY") ?? "";
  if (!apikey) return responder({ error: "Segredo SYSCOL_API_KEY não configurado." }, 500);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return responder({ error: "Corpo JSON inválido." }, 400);
  }

  const acao = String(body.action ?? "");
  const payload: Record<string, unknown> = { apikey };
  let caminho: string;
  if (acao === "tables") {
    caminho = "/tables";
  } else if (acao === "columns") {
    caminho = "/tables/columns";
    payload.tablename = String(body.tablename ?? "");
  } else if (acao === "query") {
    caminho = "/tables/queries";
    payload.tablename = String(body.tablename ?? "");
    payload.pagesize = Math.min(Math.max(Number(body.pagesize ?? 100), 1), 1000);
    payload.pagenumber = Math.max(Number(body.pagenumber ?? 1), 1);
    if (Array.isArray(body.filters)) payload.filters = body.filters;
    if (Array.isArray(body.columns)) payload.columns = body.columns;
    if (Array.isArray(body.sort)) payload.sort = body.sort;
  } else {
    return responder({ error: "action deve ser tables, columns ou query." }, 400);
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(BASE + caminho, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const texto = (await r.text()).split(apikey).join("***");
    let dados: unknown = texto;
    try {
      dados = JSON.parse(texto);
    } catch {
      // resposta em texto
    }
    return responder({ ok: r.ok, status_api: r.status, dados });
  } catch (e) {
    return responder({ ok: false, error: "Falha ao chamar a API: " + (e instanceof Error ? e.message : String(e)) }, 502);
  } finally {
    clearTimeout(t);
  }
});
