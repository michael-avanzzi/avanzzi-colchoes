import { describe, expect, it } from 'vitest'

import { linkWhatsApp, montarMensagem, normalizarTelefoneBR } from './whatsapp'

describe('normalizarTelefoneBR', () => {
  it('aceita os formatos comuns e devolve 55 + DDD + número', () => {
    expect(normalizarTelefoneBR('(11) 98765-4321')).toBe('5511987654321')
    expect(normalizarTelefoneBR('11 3333-4444')).toBe('551133334444')
    expect(normalizarTelefoneBR('+55 (21) 99999-0000')).toBe('5521999990000')
    expect(normalizarTelefoneBR('0 11 98765 4321')).toBe('5511987654321')
    expect(normalizarTelefoneBR('005511987654321')).toBe('5511987654321')
  })

  it('recusa vazio ou número incompleto', () => {
    expect(normalizarTelefoneBR(null)).toBeNull()
    expect(normalizarTelefoneBR('')).toBeNull()
    expect(normalizarTelefoneBR('98765-4321')).toBeNull()
  })
})

describe('montarMensagem', () => {
  it('traz primeiro nome, vendedor, dia, hora e produto', () => {
    const m = montarMensagem({
      cliente: 'MARIANA SOUZA',
      inicio: new Date(2026, 10, 14, 10, 30).toISOString(),
      vendedor: 'Michael Avanzzi',
      produto: 'Colchão',
    })
    expect(m).toContain('Olá, Mariana!')
    expect(m).toContain('Aqui é Michael Avanzzi, da Avanzzi Colchões.')
    expect(m).toContain('📅 Sábado, 14/11')
    expect(m).toContain('🕒 10:30')
    expect(m).toContain('🛏️ Interesse: Colchão')
  })

  it('omite o produto quando não informado', () => {
    const m = montarMensagem({ cliente: 'João', inicio: new Date().toISOString(), vendedor: null, produto: null })
    expect(m).not.toContain('Interesse')
    expect(m).toContain('Aqui é da Avanzzi Colchões.')
  })
})

describe('linkWhatsApp', () => {
  it('usa o número quando válido e codifica a mensagem', () => {
    expect(linkWhatsApp('(11) 98765-4321', 'Olá & até')).toBe('https://wa.me/5511987654321?text=Ol%C3%A1%20%26%20at%C3%A9')
  })
  it('sem número válido, abre para escolher o contato', () => {
    expect(linkWhatsApp(null, 'oi')).toBe('https://wa.me/?text=oi')
  })
})
