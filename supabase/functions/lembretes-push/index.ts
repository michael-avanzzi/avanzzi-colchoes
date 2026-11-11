/*
 * Avanzzi Agendamentos — lembretes de "confirmar com o cliente" (Web Push).
 *
 * Chamada a cada 5 minutos pelo pg_cron do próprio Supabase (veja
 * supabase/agendar_lembretes.sql). Para cada agendamento ainda "Agendado"
 * que começa na próxima hora, envia uma notificação para todos os aparelhos
 * do vendedor responsável. Cada agendamento é lembrado uma única vez.
 *
 * Implantar com "Verify JWT" DESLIGADO: quem chama é o cron, autenticado
 * pelo cabeçalho x-segredo (igual ao segredo LEMBRETES_SEGREDO).
 *
 * Segredos (Edge Functions → Secrets):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:contato@empresa.com.br),
 *   LEMBRETES_SEGREDO
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type Lembrete = {
  agendamento_id: string;
  vendedor_id: string;
  cliente_nome: string;
  inicio: string;
};

type Inscricao = {
  id: number;
  usuario_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function responder(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

/** Comparação em tempo constante para o segredo do cron. */
function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return responder({ error: "Método não permitido." }, 405);

  const segredo = Deno.env.get("LEMBRETES_SEGREDO") ?? "";
  const recebido = req.headers.get("x-segredo") ?? "";
  if (!segredo || !iguais(recebido, segredo)) {
    return responder({ error: "Não autorizado." }, 401);
  }

  const publica = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const privada = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const assunto = Deno.env.get("VAPID_SUBJECT") ?? "";
  if (!publica || !privada || !assunto) {
    return responder({ error: "Chaves VAPID não configuradas." }, 500);
  }
  webpush.setVapidDetails(assunto, publica, privada);

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", chaveAdmin(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: lembretes, error } = await admin.rpc("fn_reservar_lembretes", {
      p_antecedencia_min: 60,
    });
    if (error) throw error;

    const lista = (lembretes ?? []) as Lembrete[];
    if (lista.length === 0) return responder({ ok: true, lembretes: 0, envios: 0 });

    const vendedores = [...new Set(lista.map((l) => l.vendedor_id))];
    const { data: inscricoes, error: inscError } = await admin
      .from("push_inscricoes")
      .select("id, usuario_id, endpoint, p256dh, auth")
      .in("usuario_id", vendedores);
    if (inscError) throw inscError;

    let envios = 0;
    const expiradas: number[] = [];

    for (const l of lista) {
      const aparelhos = ((inscricoes ?? []) as Inscricao[]).filter((i) => l.vendedor_id === i.usuario_id);
      const payload = JSON.stringify({
        title: "Confirme o atendimento",
        body: `${l.cliente_nome} às ${hora.format(new Date(l.inicio))}. Ligue ou mande mensagem para confirmar.`,
        tag: `lembrete-${l.agendamento_id}`,
        url: `/?agendamento=${l.agendamento_id}`,
      });

      let enviadosAqui = 0;
      for (const i of aparelhos) {
        try {
          await webpush.sendNotification(
            { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
            payload,
            { TTL: 60 * 60, urgency: "high" },
          );
          enviadosAqui++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // 404/410: o aparelho cancelou a inscrição; remove para não tentar de novo.
          if (status === 404 || status === 410) expiradas.push(i.id);
          else console.error("[lembretes-push] envio", status, (e as Error).message);
        }
      }

      envios += enviadosAqui;
      await admin
        .from("lembretes_enviados")
        .update({ aparelhos: enviadosAqui })
        .eq("agendamento_id", l.agendamento_id);
    }

    if (expiradas.length) await admin.from("push_inscricoes").delete().in("id", expiradas);

    return responder({ ok: true, lembretes: lista.length, envios, expiradas: expiradas.length });
  } catch (error) {
    console.error("[lembretes-push]", error instanceof Error ? error.message : error);
    return responder({ error: "Falha ao processar lembretes." }, 500);
  }
});
