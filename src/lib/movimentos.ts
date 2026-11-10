import { atualizarStatus, registrarResultado } from '../services/agendamentos.service'
import type { Agendamento, Coluna, ResultadoVenda, StatusAtendimento } from '../types/agendamento'
import type { MeuPerfil } from '../types/auth'

/** Colunas para onde um cartão pode ser movido diretamente (sem formulário extra). */
export const COLUNAS_DIRETAS: Coluna[] = [
  'agendado',
  'confirmado',
  'em_atendimento',
  'venda_fechada',
  'nao_fechou',
  'nao_compareceu',
]

function alvo(destino: Coluna): { status: StatusAtendimento; resultado: ResultadoVenda } {
  switch (destino) {
    case 'em_atendimento':
      return { status: 'compareceu', resultado: 'pendente' }
    case 'venda_fechada':
      return { status: 'compareceu', resultado: 'venda_fechada' }
    case 'nao_fechou':
      return { status: 'compareceu', resultado: 'nao_fechou' }
    case 'agendado':
    case 'confirmado':
    case 'nao_compareceu':
      return { status: destino, resultado: 'pendente' }
    default:
      throw new Error('Use as ações Reagendar ou Cancelar para esta etapa.')
  }
}

/**
 * Leva o agendamento até a coluna de destino usando as funções do banco
 * (cada passo grava seu próprio evento no histórico).
 */
export async function moverPara(a: Agendamento, destino: Coluna, valor?: number | null) {
  const meta = alvo(destino)
  let atual = a

  if (atual.status !== meta.status) {
    if (atual.resultado !== 'pendente') {
      atual = await registrarResultado(atual, 'pendente')
    }
    atual = await atualizarStatus(atual, meta.status)
  }

  if (meta.status === 'compareceu' && (atual.resultado !== meta.resultado || valor !== undefined)) {
    atual = await registrarResultado(atual, meta.resultado, valor)
  }

  return atual
}

/** Espelha a regra do banco (fn_carregar_para_alterar) só para esconder botões. */
export function podeAlterar(perfil: MeuPerfil | null, a: Pick<Agendamento, 'vendedor_id'>) {
  if (!perfil?.allowed) return false
  return perfil.papel !== 'vendedor' || a.vendedor_id === perfil.id
}

export function ehGestor(perfil: MeuPerfil | null) {
  return Boolean(perfil?.allowed && perfil.papel !== 'vendedor')
}

/** Comparecimento só a partir do dia do agendamento (mesma regra do banco). */
export function jaPodeMarcarComparecimento(a: Pick<Agendamento, 'inicio'>) {
  const dia = new Date(a.inicio)
  dia.setHours(0, 0, 0, 0)
  return dia.getTime() <= Date.now()
}
