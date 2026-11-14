import type { MetricasVendedor } from '../services/indicadores.service'

/**
 * Ranking por vendedor: quem mais vendeu em valor no período.
 *
 * Valor vendido = atendimentos × comparecimento × conversão × ticket médio,
 * então ele já premia quem traz mais clientes, fecha mais e vende mais caro.
 * Desempates: mais vendas, maior conversão, mais clientes atendidos, nome.
 */
export function ordenarRanking<T extends MetricasVendedor>(lista: T[]): T[] {
  return [...lista].sort(
    (a, b) =>
      b.valor_vendido - a.valor_vendido ||
      b.vendas - a.vendas ||
      (b.taxa_conversao ?? -1) - (a.taxa_conversao ?? -1) ||
      b.compareceram - a.compareceram ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  )
}

/** Valor médio por venda fechada; null sem vendas com valor. */
export function ticketMedio(m: Pick<MetricasVendedor, 'valor_vendido' | 'vendas'>) {
  return m.vendas > 0 && m.valor_vendido > 0 ? m.valor_vendido / m.vendas : null
}
