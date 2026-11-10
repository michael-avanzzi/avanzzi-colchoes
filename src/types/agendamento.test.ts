import { describe, expect, it } from 'vitest'

import { colunaDe, estaEncerrado } from './agendamento'

describe('colunaDe', () => {
  it('usa o status quando o cliente não compareceu ainda', () => {
    expect(colunaDe({ status: 'agendado', resultado: 'pendente' })).toBe('agendado')
    expect(colunaDe({ status: 'confirmado', resultado: 'pendente' })).toBe('confirmado')
    expect(colunaDe({ status: 'nao_compareceu', resultado: 'pendente' })).toBe('nao_compareceu')
    expect(colunaDe({ status: 'cancelado', resultado: 'pendente' })).toBe('cancelado')
    expect(colunaDe({ status: 'reagendado', resultado: 'pendente' })).toBe('reagendado')
  })

  it('separa o comparecimento pelo resultado da venda', () => {
    expect(colunaDe({ status: 'compareceu', resultado: 'pendente' })).toBe('em_atendimento')
    expect(colunaDe({ status: 'compareceu', resultado: 'venda_fechada' })).toBe('venda_fechada')
    expect(colunaDe({ status: 'compareceu', resultado: 'nao_fechou' })).toBe('nao_fechou')
  })
})

describe('estaEncerrado', () => {
  it('considera encerrados só cancelado e reagendado', () => {
    expect(estaEncerrado({ status: 'cancelado' })).toBe(true)
    expect(estaEncerrado({ status: 'reagendado' })).toBe(true)
    expect(estaEncerrado({ status: 'compareceu' })).toBe(false)
    expect(estaEncerrado({ status: 'nao_compareceu' })).toBe(false)
  })
})
