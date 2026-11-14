import { describe, expect, it } from 'vitest'

import type { MetricasVendedor } from '../services/indicadores.service'
import { ordenarRanking, ticketMedio } from './ranking'

const v = (nome: string, valor_vendido: number, vendas: number, taxa_conversao: number | null, compareceram: number) =>
  ({ nome, valor_vendido, vendas, taxa_conversao, compareceram }) as MetricasVendedor

describe('ordenarRanking', () => {
  it('ordena pelo valor vendido, não pela quantidade de vendas', () => {
    const r = ordenarRanking([v('Carla', 10000, 5, 20, 25), v('Ana', 20000, 8, 40, 20), v('Bruno', 15000, 5, 83, 6)])
    expect(r.map((x) => x.nome)).toEqual(['Ana', 'Bruno', 'Carla'])
  })

  it('desempata por vendas, conversão, atendidos e nome', () => {
    const r = ordenarRanking([
      v('Davi', 0, 0, null, 3),
      v('Eva', 5000, 2, 50, 4),
      v('Caio', 5000, 2, 50, 4),
      v('Fabi', 5000, 2, 100, 2),
      v('Gil', 5000, 3, 30, 10),
    ])
    expect(r.map((x) => x.nome)).toEqual(['Gil', 'Fabi', 'Caio', 'Eva', 'Davi'])
  })
})

describe('ticketMedio', () => {
  it('divide o valor pelas vendas e some sem venda', () => {
    expect(ticketMedio({ valor_vendido: 7500, vendas: 3 })).toBe(2500)
    expect(ticketMedio({ valor_vendido: 0, vendas: 0 })).toBeNull()
    expect(ticketMedio({ valor_vendido: 0, vendas: 2 })).toBeNull()
  })
})
