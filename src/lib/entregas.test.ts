import { describe, expect, it } from 'vitest'

import type { ItemEntrega } from '../services/entregas.service'
import {
  diasDaSemana,
  linkMapa,
  resumoEntregas,
  rotuloDia,
  rotuloEstoqueItem,
  rotuloSemana,
  segundaDaSemana,
  seloDaEntrega,
  somarDiasIso,
} from './entregas'

const item = (p: Partial<ItemEntrega>): ItemEntrega => ({
  descricao: 'CM TESTE',
  quantidade: 1,
  situacao: 'aguardando_fabricar',
  codigo: '2',
  previsao_fabricante: null,
  tem_pedido_compra: false,
  estoque_saldo: 0,
  estoque_livre: 0,
  estoque: 'sem_estoque',
  ...p,
})

describe('semana', () => {
  it('acha a segunda-feira e os 7 dias', () => {
    expect(segundaDaSemana('2026-11-27')).toBe('2026-11-23') // sexta
    expect(segundaDaSemana('2026-11-29')).toBe('2026-11-23') // domingo
    expect(segundaDaSemana('2026-11-30')).toBe('2026-11-30') // segunda
    expect(diasDaSemana('2026-11-30')).toEqual([
      '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06',
    ])
    expect(somarDiasIso('2026-11-30', -7)).toBe('2026-11-23')
  })

  it('rótulos em português', () => {
    expect(rotuloDia('2026-11-30')).toBe('segunda-feira, 30/11')
    expect(rotuloSemana('2026-11-30')).toMatch(/^Semana de 30 de nov\.? a 6 de dez\.?$/)
  })
})

describe('seloDaEntrega', () => {
  it('aguardando fabricante com saldo livre para tudo vira "tem no estoque"', () => {
    expect(seloDaEntrega({ prontidao: 'aguardando', aguardando: 2, aguardando_com_estoque: 2 })).toBe('tem_no_estoque')
    expect(seloDaEntrega({ prontidao: 'risco', aguardando: 1, aguardando_com_estoque: 1 })).toBe('tem_no_estoque')
    expect(seloDaEntrega({ prontidao: 'aguardando', aguardando: 2, aguardando_com_estoque: 1 })).toBe('aguardando')
    expect(seloDaEntrega({ prontidao: 'risco', aguardando: 1, aguardando_com_estoque: 0 })).toBe('risco')
    expect(seloDaEntrega({ prontidao: 'pronto', aguardando: 0, aguardando_com_estoque: 0 })).toBe('pronto')
  })

  it('resumo conta por selo', () => {
    const r = resumoEntregas([
      { prontidao: 'entregue', aguardando: 0, aguardando_com_estoque: 0 },
      { prontidao: 'pronto', aguardando: 0, aguardando_com_estoque: 0 },
      { prontidao: 'aguardando', aguardando: 1, aguardando_com_estoque: 1 },
      { prontidao: 'risco', aguardando: 1, aguardando_com_estoque: 0 },
    ])
    expect(r).toEqual({ total: 4, entregue: 1, pronto: 1, tem_no_estoque: 1, aguardando: 0, risco: 1 })
  })
})

describe('rotuloEstoqueItem', () => {
  it('texto simples por situação', () => {
    expect(rotuloEstoqueItem(item({ situacao: 'entregue', estoque: 'ok' })).texto).toBe('Entregue')
    expect(rotuloEstoqueItem(item({ situacao: 'em_carga', estoque: 'ok' })).texto).toBe('Na carga')
    expect(rotuloEstoqueItem(item({ situacao: 'disponivel', estoque: 'ok' }))).toEqual({ classe: 'ok', texto: 'Em estoque' })
    expect(rotuloEstoqueItem(item({ estoque: 'tem_no_estoque', estoque_livre: 3 }))).toEqual({ classe: 'livre', texto: 'Tem no estoque (3 livre)' })
    expect(rotuloEstoqueItem(item({ previsao_fabricante: '2026-12-10', tem_pedido_compra: true })).texto).toBe('Sem estoque · fábrica 10/12')
    expect(rotuloEstoqueItem(item({ tem_pedido_compra: true })).texto).toBe('Sem estoque · fábrica sem data')
    expect(rotuloEstoqueItem(item({})).texto).toBe('Sem estoque · sem pedido de compra')
  })
})

describe('linkMapa', () => {
  it('monta a busca no Google Maps ou null sem endereço', () => {
    expect(linkMapa({ endereco: 'Rua A, 10', bairro: 'Centro', cidade: 'Campinas', estado: 'SP', cep: null })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%2010%2C%20Centro%2C%20Campinas%2C%20SP',
    )
    expect(linkMapa({ endereco: null, bairro: null, cidade: null, estado: null, cep: null })).toBeNull()
  })
})
