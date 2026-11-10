import { describe, expect, it } from 'vitest'

import { combinarDataHora, inicioDaSemana, paraInputData, paraInputHora, somarDias } from './datas'

describe('datas', () => {
  it('combina data e hora locais e volta para os mesmos campos', () => {
    const iso = combinarDataHora('2026-11-10', '18:30')
    const d = new Date(iso)
    expect(paraInputData(d)).toBe('2026-11-10')
    expect(paraInputHora(d)).toBe('18:30')
  })

  it('começa a semana na segunda-feira', () => {
    // 15/11/2026 é domingo
    expect(paraInputData(inicioDaSemana(new Date(2026, 10, 15, 14)))).toBe('2026-11-09')
    expect(paraInputData(inicioDaSemana(new Date(2026, 10, 9, 8)))).toBe('2026-11-09')
  })

  it('soma dias atravessando o mês', () => {
    expect(paraInputData(somarDias(new Date(2026, 10, 30), 1))).toBe('2026-12-01')
  })
})
