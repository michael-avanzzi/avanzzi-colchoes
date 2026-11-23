/*
 * Avanzzi — receptor do webhook "Pedido de Venda" do Syscol (Fábrica de Sistemas).
 *
 * O Syscol chama esta URL a cada pedido gravado ou alterado:
 *   https://<projeto>.supabase.co/functions/v1/syscol-webhook?token=<TOKEN>
 * O token é conferido no banco (hash em syscol.config, chave webhook_token_sha256).
 * O evento bruto vai para syscol.webhook_eventos e um gatilho grava o pedido.
 *
 * Implantar com "Verify JWT" DESLIGADO (quem chama é o Syscol, autenticado pelo token).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_CORPO = 1_000_000;
const CABECALHOS_OCULTOS = ["authorization", "apikey", "cookie", "x-api-key"];

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
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  url.searchParams.delete("token");

  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    if (!CABECALHOS_OCULTOS.includes(k.toLowerCase())) headers[k.toLowerCase()] = v;
  }

  let corpo = "";
  try {
    corpo = await req.text();
  } catch {
    // sem corpo
  }
  if (corpo.length > MAX_CORPO) return responder({ ok: false, erro: "corpo muito grande" }, 413);

  const contentType = req.headers.get("content-type") ?? "";
  let payload: unknown = null;
  if (corpo) {
    try {
      payload = JSON.parse(corpo);
    } catch {
      if (contentType.includes("application/x-www-form-urlencoded")) {
        payload = Object.fromEntries(new URLSearchParams(corpo).entries());
      }
    }
  }

  const { data, error } = await admin.rpc("syscol_registrar_evento", {
    p_token: token,
    p_metodo: req.method,
    p_content_type: contentType,
    p_query: Object.fromEntries(url.searchParams.entries()),
    p_headers: headers,
    p_corpo: corpo,
    p_payload: payload,
  });

  if (error) {
    const naoAutorizado = error.message?.includes("token invalido");
    if (!naoAutorizado) console.error("[syscol-webhook]", error.message);
    return responder({ ok: false }, naoAutorizado ? 401 : 500);
  }
  return responder({ ok: true, id: data });
});
