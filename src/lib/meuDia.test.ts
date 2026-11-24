import { describe, expect, it } from 'vitest'

import { acoesRapidas, resumoDoDia } from './meuDia'

const agora = new Date('2026-11-24T14:00:00')
const em = (h: string) => new Date(`2026-11-24T${h}:00`).toISOString()

describe('acoesRapidas', () => {
  it('agendado ainda longe do horário: só confirmar', () => {
    expect(acoesRapidas({ status: 'agendado', resultado: 'pendente', inicio: em('16:00') }, agora)).toEqual(['confirmar'])
  })

  it('agendado na hora: confirmar, chegou ou não veio', () => {
    expect(acoesRapidas({ status: 'agendado', resultado: 'pendente', inicio: em('14:10') }, agora)).toEqual([
      'confirmar',
      'chegou',
      'nao_veio',
    ])
  })

  it('confirmado no dia: chegou ou não veio', () => {
    expect(acoesRapidas({ status: 'confirmado', resultado: 'pendente', inicio: em('18:00') }, agora)).toEqual(['chegou', 'nao_veio'])
  })

  it('confirmado para outro dia: nada ainda (comparecimento só no dia)', () => {
    expect(
      acoesRapidas({ status: 'confirmado', resultado: 'pendente', inicio: new Date('2026-11-26T10:00:00').toISOString() }, agora),
    ).toEqual([])
  })

  it('em atendimento: vendeu ou não fechou', () => {
    expect(acoesRapidas({ status: 'compareceu', resultado: 'pendente', inicio: em('10:00') }, agora)).toEqual(['vendeu', 'nao_fechou'])
  })

  it('com desfecho ou encerrado: nenhum botão', () => {
    expect(acoesRapidas({ status: 'compareceu', resultado: 'venda_fechada', inicio: em('10:00') }, agora)).toEqual([])
    expect(acoesRapidas({ status: 'nao_compareceu', resultado: 'pendente', inicio: em('10:00') }, agora)).toEqual([])
    expect(acoesRapidas({ status: 'cancelado', resultado: 'pendente', inicio: em('10:00') }, agora)).toEqual([])
    expect(acoesRapidas({ status: 'reagendado', resultado: 'pendente', inicio: em('10:00') }, agora)).toEqual([])
  })
})

describe('resumoDoDia', () => {
  it('conta por etapa e ignora cancelados e reagendados', () => {
    const r = resumoDoDia([
      { status: 'agendado', resultado: 'pendente', valor_venda: null },
      { status: 'confirmado', resultado: 'pendente', valor_venda: null },
      { status: 'compareceu', resultado: 'pendente', valor_venda: null },
      { status: 'compareceu', resultado: 'venda_fechada', valor_venda: 3200 },
      { status: 'compareceu', resultado: 'venda_fechada', valor_venda: null },
      { status: 'cancelado', resultado: 'pendente', valor_venda: null },
      { status: 'reagendado', resultado: 'pendente', valor_venda: null },
    ])
    expect(r).toEqual({ total: 5, aConfirmar: 1, aguardando: 1, emAtendimento: 1, vendas: 2, valorVendido: 3200 })
  })
})
