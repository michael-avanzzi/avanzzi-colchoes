import { describe, expect, it } from 'vitest'

import type { StatusAtendimento } from '../types/agendamento'
import { horariosDoDia } from './disponibilidade'

const EXP = { abre: '08:00', fecha: '20:00', intervaloMin: 30 }
const DIA = new Date(2026, 10, 14)
const ANTES = new Date(2026, 10, 13, 12)

const ag = (h: number, m: number, duracao_min: number, status: StatusAtendimento = 'agendado', vendedor_id = 'v1') => ({
  vendedor_id,
  inicio: new Date(2026, 10, 14, h, m).toISOString(),
  duracao_min,
  status,
})

const rotulos = (hs: ReturnType<typeof horariosDoDia>) =>
  hs.filter((h) => !h.livre).map((h) => `${h.inicio.getHours()}:${String(h.inicio.getMinutes()).padStart(2, '0')}`)

describe('horariosDoDia', () => {
  it('gera de 30 em 30 min, das 08:00 até 19:30', () => {
    const hs = horariosDoDia(DIA, 'v1', [], EXP, ANTES)
    expect(hs).toHaveLength(24)
    expect(hs[0].inicio.getHours()).toBe(8)
    expect(hs.at(-1)!.inicio.getHours()).toBe(19)
    expect(hs.at(-1)!.inicio.getMinutes()).toBe(30)
    expect(hs.every((h) => h.livre)).toBe(true)
  })

  it('marca ocupado tudo que coincide com o atendimento', () => {
    const hs = horariosDoDia(DIA, 'v1', [ag(9, 0, 60), ag(14, 15, 30, 'confirmado')], EXP, ANTES)
    expect(rotulos(hs)).toEqual(['9:00', '9:30', '14:00', '14:30'])
  })

  it('ignora outros vendedores e status que liberam o horário', () => {
    const hs = horariosDoDia(
      DIA,
      'v1',
      [ag(10, 0, 60, 'agendado', 'v2'), ag(11, 0, 60, 'cancelado'), ag(12, 0, 60, 'reagendado'), ag(13, 0, 60, 'nao_compareceu')],
      EXP,
      ANTES,
    )
    expect(hs.every((h) => h.livre)).toBe(true)
  })

  it('no próprio dia, esconde os horários que já começaram', () => {
    const hs = horariosDoDia(DIA, 'v1', [], EXP, new Date(2026, 10, 14, 15, 10))
    expect(hs[0].inicio.getHours()).toBe(15)
    expect(hs[0].inicio.getMinutes()).toBe(30)
  })
})
