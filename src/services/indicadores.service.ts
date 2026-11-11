import { supabase } from '../lib/supabase'

export type Agrupamento = 'dia' | 'semana' | 'mes'

export type Metricas = {
  agendamentos: number
  futuros: number
  cancelados: number
  reagendados: number
  pendentes: number
  compareceram: number
  nao_compareceram: number
  vendas: number
  nao_fechou: number
  resultado_pendente: number
  valor_vendido: number
  taxa_comparecimento: number | null
  taxa_conversao: number | null
}

export type MetricasVendedor = Metricas & { vendedor_id: string; nome: string }
export type MetricasPeriodo = Metricas & { periodo: string }

export type Indicadores = {
  resumo: Metricas
  por_vendedor: MetricasVendedor[]
  serie: MetricasPeriodo[]
}

/** Toda a regra de cálculo fica no banco (rpc_indicadores). */
export async function obterIndicadores(
  inicio: Date,
  fim: Date,
  vendedorId: string | null,
  agrupar: Agrupamento,
): Promise<Indicadores> {
  const { data, error } = await supabase.rpc('rpc_indicadores', {
    p_inicio: inicio.toISOString(),
    p_fim: fim.toISOString(),
    p_vendedor_id: vendedorId,
    p_agrupar: agrupar,
  })
  if (error) throw error
  return data as Indicadores
}
