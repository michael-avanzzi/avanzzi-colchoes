/*
 * Avanzzi — sincronização com a API do Syscol (Fábrica de Sistemas).
 *
 * Chamada a cada 10 minutos pelo pg_cron (supabase/agendar_syscol.sql), com o
 * cabeçalho x-segredo. Lê pedidos, itens, funcionários, meta mensal, minutas,
 * cargas, estoque, pedidos de compra e nomes de clientes pela API
 * (https://api.fabricasistemas.com.br), guarda a cópia bruta em syscol.api_linhas
 * e aplica nas tabelas do ranking (syscol_aplicar_api).
 *
 * Segredos (Edge Functions → Secrets): SYSCOL_API_KEY (chave gerada no Syscol em
 * Opções → WebHook/API → API de Integração). A chave nunca volta nas respostas.
 *
 * Implantar com "Verify JWT" DESLIGADO.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.fabricasistemas.com.br/api/v1/database/tables/queries";

// Só as colunas usadas. Do cliente: nome, endereço e telefone de entrega (para a
// logística); documentos ficam de fora.
const TABELAS: Record<string, string[]> = {
  pedidos: ["id", "pedidonumero", "criadoem", "registradoem", "alteradoem", "valortotal", "valorprodutos", "desconto", "frete",
    "status", "statusentrega", "vendedorprincipal", "vendedorsecundario", "principalpercvenda", "secundariopercvenda",
    "canceladoem", "canceladomotivo", "valortotalcancelado", "concluidoem", "empresaid", "clienteid", "orcamentoid", "leeadid",
    "cep", "bairro", "cidade", "estado", "sys_alteradoem",
    // Trocas: crédito de itens devolvidos usado no pedido (não conta como venda nova).
    "pedidocomtroca", "valordevolucao", "vinculodevolucao", "creditogeradovalor",
    // Entregas: data prometida e endereço de entrega.
    "promessa_datastatus", "promessa_data1", "promessa_horastatus", "promessa_hora1", "promessadias",
    "despachado", "datadespacho", "clienteligaentregar", "endereco", "numero", "complemento", "fone1", "fone2"],
  pedidos_itens: ["id", "pedidoid", "produtoid", "item", "quantidade", "descricao", "valorunitario", "valorunitariocheio",
    "customedio", "custoreposicao", "custofinanc", "lucromedio", "lucroreposicao", "vendedorid", "canceladoem", "data",
    "brinde", "servico", "empresaid", "largura", "comprimento", "altura",
    // Entregas: situação do item, carga e pedido de compra ao fabricante.
    "entrega", "cargaid", "ordementrega", "itemminutaid", "pedidocompraitemid", "depositoid", "concluidoem"],
  funcionarios: ["id", "nome", "cargo", "excluido"],
  mapa_metamensal: ["id", "mesref", "meta", "empresaid", "diasvenda", "metafaturamento"],
  // Entregas (tela Entregas)
  minuta: ["id", "pedidoid", "tipominuta", "datavenda", "dataentrega", "cargaid", "clienteid", "clientenome", "clientecep",
    "clienteendereco", "clientecomplemento", "clientebairro", "clientecidade", "clienteestado", "clientetelefone1",
    "clientetelefone2", "clientepontoreferencia", "observacoes", "statusentrega", "entregaagendada", "ordementrega",
    "status", "clienterecebeu", "clienterecebeuem", "vendedorid", "valorfrete"],
  cargas: ["id", "descricao", "status", "datasaida", "dataretorno", "datacriacao", "datadespacho", "tipoentrega",
    "responsavelid", "veiculoid", "distanciaestimada", "conclusaodata"],
  estoque_posicao: ["id", "produtoid", "descricao", "depositosaldo", "depositoreservado", "depositotransito",
    "saldoimediato", "saldoshowroom", "entregafutura", "aguardandofabricar", "reservaordenado"],
  pedidocompra: ["id", "dataemissao", "fabricanteid", "concluido", "concluidoem", "enviado", "confirmardo", "entregaprevista", "pedidotipo"],
  pedidocompra_itens: ["id", "pedidoid", "produtoid", "quantidade", "saldo"],
  clientes: ["id", "nome"],
};

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

async function pagina(apikey: string, tabela: string, n: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        apikey,
        tablename: tabela,
        pagesize: 500,
        pagenumber: n,
        columns: TABELAS[tabela],
        sort: [{ column: "id", order: "ASC" }],
      }),
      signal: ctrl.signal,
    });
    const texto = await r.text();
    if (!r.ok) throw new Error(`${tabela} página ${n}: HTTP ${r.status} ${texto.split(apikey).join("***").slice(0, 300)}`);
    const d = JSON.parse(texto)?.data ?? {};
    return {
      linhas: Array.isArray(d.result) ? d.result : [],
      paginas: Number(d.totalPages ?? 1),
      total: Number(d.totalCount ?? 0),
    };
  } finally {
    clearTimeout(t);
  }
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

  const { data: logId } = await admin.rpc("syscol_log_sync", { p_id: null, p_resumo: { status: "rodando" }, p_erro: null });
  const resumo: Record<string, unknown> = {};
  let erro: string | null = null;

  try {
    for (const tabela of Object.keys(TABELAS)) {
      let n = 1, paginas = 1, salvos = 0, total = 0;
      do {
        const p = await pagina(apikey, tabela, n);
        paginas = Math.min(p.paginas, 200);
        total = p.total;
        if (p.linhas.length) {
          const { data, error } = await admin.rpc("syscol_salvar_api", { p_tabela: tabela, p_linhas: p.linhas });
          if (error) throw new Error(`${tabela}: ${error.message}`);
          salvos += Number(data ?? 0);
        }
        n++;
      } while (n <= paginas);
      resumo[tabela] = { total_api: total, salvos };
    }
    const { data: aplicado, error } = await admin.rpc("syscol_aplicar_api");
    if (error) throw new Error(`aplicar: ${error.message}`);
    resumo.aplicado = aplicado;
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
    console.error("[syscol-sync]", erro);
  }

  await admin.rpc("syscol_log_sync", { p_id: logId, p_resumo: resumo, p_erro: erro });
  return responder({ ok: !erro, resumo, erro }, erro ? 502 : 200);
});
