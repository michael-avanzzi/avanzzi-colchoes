import { supabase } from '../lib/supabase'

/** Vendedor no ranking de vendas do Syscol (rpc_ranking_vendas). */
export type VendedorRanking = {
  posicao: number
  vendedor_id: string
  nome: string
  nome_syscol: string
  perfil_id: string | null
  foto_path: string | null
  valor: number
  pedidos: number
  ticket_medio: number | null
  /** Só para gerente e admin. */
  margem_pct: number | null
  hoje_valor: number
  hoje_pedidos: number
  meta_diaria: number | null
  meta_propria: boolean
}

export type PedidoRanking = {
  numero: string
  data_emissao: string
  status: string | null
  cancelado: boolean
  /** Valor que conta como venda (total do pedido menos o crédito de troca). */
  total: number
  /** Total do pedido no Syscol. */
  total_pedido: number
  troca: boolean
  /** Crédito de itens devolvidos usado no pedido (troca). */
  valor_devolucao: number
  qtd_itens: number | null
  vendedor: string | null
  vendedor_2: string | null
}

export type ConfigRanking = {
  meta_diaria_padrao: number | null
  meta_mensal_manual: number | null
  meta_mes_do_syscol: boolean
  ultima_sincronizacao: string | null
  ultimo_webhook: string | null
  vendedores_syscol: { id: string; nome: string; ativo: boolean }[]
  perfis: { id: string; nome: string; papel: string; syscol_vendedor_id: string | null }[]
}

export type RankingVendas = {
  gerado_em: string
  /** Data de hoje em Brasília (AAAA-MM-DD). */
  hoje: string
  gestao: boolean
  periodo: { inicio: string; fim: string }
  vendedores: VendedorRanking[]
  resumo: {
    valor: number
    pedidos: number
    ticket_medio: number | null
    margem_pct: number | null
    anterior_inicio: string
    anterior_fim: string
    anterior_valor: number
    anterior_pedidos: number
  }
  mes: {
    inicio: string
    fim: string
    dias_mes: number
    dias_passados: number
    dias_restantes: number
    valor: number
    pedidos: number
    meta: number | null
    /** Meta de hoje da loja: (meta do mês - vendido até ontem) ÷ dias de venda que faltam. */
    meta_dia_loja: number | null
    /** Meta automática de hoje de cada vendedor: meta_dia_loja ÷ vendedores_na_meta. */
    meta_dia_vendedor: number | null
    /** Usuários com papel "vendedor" ligados ao Syscol (administradores ficam de fora). */
    vendedores_na_meta: number
    dias_de_venda_restantes: number
    hoje_e_dia_de_venda: boolean
  }
  diario: { dia: string; valor: number; pedidos: number }[]
  pedidos: PedidoRanking[] | null
  config: ConfigRanking | null
}

/** Toda a regra de cálculo fica no banco (rpc_ranking_vendas). Datas no formato AAAA-MM-DD. */
export async function obterRankingVendas(inicio: string, fim: string): Promise<RankingVendas> {
  const { data, error } = await supabase.rpc('rpc_ranking_vendas', { p_inicio: inicio, p_fim: fim })
  if (error) throw error
  return data as RankingVendas
}

export async function salvarMetasLoja(metaDiariaPadrao: number | null, metaMensalManual: number | null) {
  const { error } = await supabase.rpc('rpc_ranking_salvar_metas', {
    p_meta_diaria_padrao: metaDiariaPadrao,
    p_meta_mensal_manual: metaMensalManual,
  })
  if (error) throw error
}

export async function salvarMetaVendedor(vendedorId: string, metaDiaria: number | null) {
  const { error } = await supabase.rpc('rpc_ranking_meta_vendedor', {
    p_vendedor_id: vendedorId,
    p_meta_diaria: metaDiaria,
  })
  if (error) throw error
}

export async function vincularVendedor(perfilId: string, vendedorId: string | null) {
  const { error } = await supabase.rpc('rpc_ranking_vincular', { p_perfil_id: perfilId, p_vendedor_id: vendedorId })
  if (error) throw error
}

export async function definirVendedorAtivo(vendedorId: string, ativo: boolean) {
  const { error } = await supabase.rpc('rpc_ranking_vendedor_ativo', { p_vendedor_id: vendedorId, p_ativo: ativo })
  if (error) throw error
}
