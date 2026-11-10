import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Agendamento, ResultadoVenda, StatusAtendimento } from '../types/agendamento'

// Simula as funções do banco: cada chamada aplica a mudança e incrementa a versão.
const chamadas: string[] = []

vi.mock('../services/agendamentos.service', () => ({
  atualizarStatus: vi.fn(async (a: Agendamento, status: StatusAtendimento) => {
    chamadas.push(`status:${status}@v${a.versao}`)
    return { ...a, status, versao: a.versao + 1 }
  }),
  registrarResultado: vi.fn(async (a: Agendamento, resultado: ResultadoVenda, valor?: number | null) => {
    chamadas.push(`resultado:${resultado}${valor != null ? `=${valor}` : ''}@v${a.versao}`)
    return { ...a, resultado, valor_venda: valor ?? null, versao: a.versao + 1 }
  }),
}))

const { moverPara, podeAlterar, jaPodeMarcarComparecimento } = await import('./movimentos')

function ag(parcial: Partial<Agendamento>): Agendamento {
  return {
    id: 'a1',
    cliente_nome: 'Cliente (fictício)',
    cliente_telefone: null,
    inicio: new Date().toISOString(),
    duracao_min: 60,
    vendedor_id: 'v1',
    categoria_id: null,
    observacoes: null,
    status: 'agendado',
    resultado: 'pendente',
    valor_venda: null,
    motivo_cancelamento: null,
    reagendado_de_id: null,
    reagendado_para_id: null,
    comparecimento_por: null,
    comparecimento_em: null,
    resultado_por: null,
    resultado_em: null,
    versao: 1,
    criado_por: 'v1',
    criado_em: '',
    atualizado_por: null,
    atualizado_em: '',
    ...parcial,
  }
}

beforeEach(() => {
  chamadas.length = 0
})

describe('moverPara', () => {
  it('Agendado → Confirmado: só muda o status', async () => {
    const r = await moverPara(ag({}), 'confirmado')
    expect(chamadas).toEqual(['status:confirmado@v1'])
    expect(r.status).toBe('confirmado')
  })

  it('Agendado → Venda fechada: marca comparecimento e depois o resultado, com a versão atualizada', async () => {
    const r = await moverPara(ag({}), 'venda_fechada', 1200)
    expect(chamadas).toEqual(['status:compareceu@v1', 'resultado:venda_fechada=1200@v2'])
    expect(r).toMatchObject({ status: 'compareceu', resultado: 'venda_fechada', valor_venda: 1200, versao: 3 })
  })

  it('Venda fechada → Não compareceu: desfaz o resultado antes de mudar o status', async () => {
    await moverPara(ag({ status: 'compareceu', resultado: 'venda_fechada', versao: 4 }), 'nao_compareceu')
    expect(chamadas).toEqual(['resultado:pendente@v4', 'status:nao_compareceu@v5'])
  })

  it('Venda fechada → Não fechou: troca só o resultado', async () => {
    await moverPara(ag({ status: 'compareceu', resultado: 'venda_fechada' }), 'nao_fechou')
    expect(chamadas).toEqual(['resultado:nao_fechou@v1'])
  })

  it('Não fechou → Em atendimento: volta o resultado para pendente', async () => {
    await moverPara(ag({ status: 'compareceu', resultado: 'nao_fechou' }), 'em_atendimento')
    expect(chamadas).toEqual(['resultado:pendente@v1'])
  })

  it('recusa Reagendado e Cancelado (exigem formulário)', async () => {
    await expect(moverPara(ag({}), 'reagendado')).rejects.toThrow()
    await expect(moverPara(ag({}), 'cancelado')).rejects.toThrow()
    expect(chamadas).toEqual([])
  })
})

describe('podeAlterar', () => {
  const vendedor = { allowed: true as const, id: 'v1', nome: 'V', email: '', telefone: null, papel: 'vendedor' as const, trocar_senha: false }
  it('vendedor altera só os próprios', () => {
    expect(podeAlterar(vendedor, { vendedor_id: 'v1' })).toBe(true)
    expect(podeAlterar(vendedor, { vendedor_id: 'v2' })).toBe(false)
  })
  it('gerente altera qualquer um', () => {
    expect(podeAlterar({ ...vendedor, papel: 'gerente' }, { vendedor_id: 'v2' })).toBe(true)
  })
  it('sem perfil liberado não altera', () => {
    expect(podeAlterar(null, { vendedor_id: 'v1' })).toBe(false)
    expect(podeAlterar({ allowed: false, message: '' }, { vendedor_id: 'v1' })).toBe(false)
  })
})

describe('jaPodeMarcarComparecimento', () => {
  it('libera no dia e depois, bloqueia no futuro', () => {
    expect(jaPodeMarcarComparecimento({ inicio: new Date().toISOString() })).toBe(true)
    const amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    expect(jaPodeMarcarComparecimento({ inicio: amanha.toISOString() })).toBe(false)
  })
})
