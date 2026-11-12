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
  it('segue o padrão: data, vendedor, hora, endereço e despedida', () => {
    const m = montarMensagem({ inicio: new Date(2026, 10, 13, 8, 0).toISOString(), vendedor: 'Michael Avanzzi' })
    expect(m).toBe(
      [
        'Seu atendimento está agendado:',
        '📅 Sexta-feira, 13/11',
        'Michael Avanzzi',
        '🕒 08:00',
        '📍 Av. da Saudade, 1177 - Pte. Preta, Campinas - SP, 13041-670',
        '',
        'Qualquer dúvida ou se precisar remarcar, é só responder esta mensagem. Até lá!',
      ].join('\n'),
    )
  })

  it('sem vendedor, pula a linha do nome', () => {
    const m = montarMensagem({ inicio: new Date(2026, 10, 13, 8, 0).toISOString(), vendedor: null })
    expect(m.split('\n')[2]).toBe('🕒 08:00')
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
