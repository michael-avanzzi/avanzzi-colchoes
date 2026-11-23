import { describe, expect, it } from 'vitest'

import type { RankingVendas, VendedorRanking } from '../services/ranking.service'
import {
  calcularMetaLoja,
  detectarAvisos,
  hojeBrasilia,
  periodoDoPreset,
  textoPeriodo,
  variacao,
} from './rankingVendas'

function vendedor(p: Partial<VendedorRanking>): VendedorRanking {
  return {
    posicao: 1,
    vendedor_id: '1',
    nome: 'Fulano',
    nome_syscol: 'FULANO',
    perfil_id: null,
    foto_path: null,
    valor: 0,
    pedidos: 0,
    ticket_medio: null,
    margem_pct: null,
    hoje_valor: 0,
    hoje_pedidos: 0,
    meta_diaria: null,
    meta_propria: false,
    ...p,
  }
}

function ranking(vendedores: VendedorRanking[]): RankingVendas {
  return {
    gerado_em: '2026-11-23T15:00:00Z',
    hoje: '2026-11-23',
    gestao: false,
    periodo: { inicio: '2026-11-01', fim: '2026-11-23' },
    vendedores,
    resumo: {
      valor: 0, pedidos: 0, ticket_medio: null, margem_pct: null,
      anterior_inicio: '2026-10-09', anterior_fim: '2026-10-31', anterior_valor: 0, anterior_pedidos: 0,
    },
    mes: { inicio: '2026-11-01', fim: '2026-11-30', dias_mes: 30, dias_passados: 23, dias_restantes: 8, valor: 0, pedidos: 0, meta: null },
    diario: [],
    pedidos: null,
    config: null,
  }
}

describe('hojeBrasilia', () => {
  it('usa o horário de Brasília, não o do aparelho', () => {
    // 02:30 UTC do dia 24 ainda é dia 23 em Brasília (UTC-3)
    expect(hojeBrasilia(new Date('2026-11-24T02:30:00Z'))).toBe('2026-11-23')
    expect(hojeBrasilia(new Date('2026-11-24T03:30:00Z'))).toBe('2026-11-24')
  })
})

describe('periodoDoPreset', () => {
  it('monta os períodos rápidos', () => {
    expect(periodoDoPreset('hoje', '2026-11-23')).toEqual({ inicio: '2026-11-23', fim: '2026-11-23' })
    expect(periodoDoPreset('7d', '2026-11-03')).toEqual({ inicio: '2026-10-28', fim: '2026-11-03' })
    expect(periodoDoPreset('mes', '2026-11-23')).toEqual({ inicio: '2026-11-01', fim: '2026-11-23' })
    expect(periodoDoPreset('mes-passado', '2026-01-15')).toEqual({ inicio: '2025-12-01', fim: '2025-12-31' })
    expect(periodoDoPreset('ano', '2026-11-23')).toEqual({ inicio: '2026-01-01', fim: '2026-11-23' })
  })
})

describe('calcularMetaLoja', () => {
  it('calcula quanto falta, o valor por dia e o ritmo', () => {
    const m = calcularMetaLoja({ ...ranking([]).mes, valor: 449243, meta: 600000 })
    expect(m.pct).toBeCloseTo(74.87, 1)
    expect(m.falta).toBe(150757)
    expect(m.porDia).toBeCloseTo(18844.6, 0)
    expect(m.ritmoPct).toBeCloseTo(76.67, 1)
    expect(m.noRitmo).toBe(false)
  })

  it('sem meta cadastrada não inventa números', () => {
    const m = calcularMetaLoja({ ...ranking([]).mes, valor: 1000, meta: null })
    expect(m.pct).toBeNull()
    expect(m.falta).toBeNull()
    expect(m.porDia).toBeNull()
  })

  it('meta batida não pede mais por dia', () => {
    const m = calcularMetaLoja({ ...ranking([]).mes, valor: 700000, meta: 600000 })
    expect(m.falta).toBe(0)
    expect(m.porDia).toBeNull()
  })
})

describe('variacao', () => {
  it('é null sem base de comparação', () => {
    expect(variacao(100, 0)).toBeNull()
    expect(variacao(150, 100)).toBe(50)
  })
})

describe('detectarAvisos', () => {
  const ana = vendedor({ posicao: 1, vendedor_id: '2', nome: 'Ana', valor: 5000 })
  const bia = vendedor({ posicao: 2, vendedor_id: '3', nome: 'Bia', valor: 4000 })

  it('primeiro carregamento só registra o líder', () => {
    const r = detectarAvisos(ranking([ana, bia]), null, new Set())
    expect(r.avisos).toEqual([])
    expect(r.lider).toBe('2')
  })

  it('avisa quando o líder muda', () => {
    const r = detectarAvisos(ranking([ana, bia]), '3', new Set())
    expect(r.avisos.map((a) => a.tipo)).toEqual(['lider'])
    expect(r.avisos[0].vendedor.nome).toBe('Ana')
  })

  it('líder com zero vendas não conta', () => {
    const zerada = vendedor({ posicao: 1, vendedor_id: '9', valor: 0 })
    expect(detectarAvisos(ranking([zerada]), '3', new Set()).avisos).toEqual([])
  })

  it('comemora a meta do dia uma vez por tela', () => {
    const bateu = vendedor({ posicao: 1, vendedor_id: '2', valor: 5000, hoje_valor: 3000, meta_diaria: 2500 })
    const primeira = detectarAvisos(ranking([bateu]), '2', new Set())
    expect(primeira.avisos.map((a) => a.chave)).toEqual(['meta:2026-11-23:2'])
    const vistas = new Set(primeira.avisos.map((a) => a.chave))
    expect(detectarAvisos(ranking([bateu]), '2', vistas).avisos).toEqual([])
  })

  it('sem meta definida não comemora', () => {
    const semMeta = vendedor({ hoje_valor: 99999, meta_diaria: null, valor: 1 })
    expect(detectarAvisos(ranking([semMeta]), '1', new Set()).avisos).toEqual([])
  })
})

describe('textoPeriodo', () => {
  it('mostra um dia ou um intervalo', () => {
    expect(textoPeriodo('2026-11-23', '2026-11-23')).toBe('23 nov')
    expect(textoPeriodo('2026-11-01', '2026-11-23')).toBe('1 nov a 23 nov')
  })
})
