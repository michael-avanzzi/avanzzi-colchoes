import { colunaDe, estaEncerrado, type Agendamento, type Coluna } from '../types/agendamento'

/** Botões de um toque da tela Meu dia: só o próximo passo de cada atendimento. */
export type AcaoRapida = 'confirmar' | 'chegou' | 'nao_veio' | 'vendeu' | 'nao_fechou'

export const DESTINO_DA_ACAO: Record<AcaoRapida, Coluna> = {
  confirmar: 'confirmado',
  chegou: 'em_atendimento',
  nao_veio: 'nao_compareceu',
  vendeu: 'venda_fechada',
  nao_fechou: 'nao_fechou',
}

export const ROTULO_DA_ACAO: Record<AcaoRapida, string> = {
  confirmar: 'Confirmar',
  chegou: 'Chegou',
  nao_veio: 'Não veio',
  vendeu: 'Vendeu',
  nao_fechou: 'Não fechou',
}

/** Mensagem curta depois do toque (com "Desfazer"). */
export const FEITO_DA_ACAO: Record<AcaoRapida, string> = {
  confirmar: 'confirmado',
  chegou: 'em atendimento',
  nao_veio: 'marcado como não compareceu',
  vendeu: 'venda registrada',
  nao_fechou: 'marcado como não fechou',
}

/** Comparecimento só a partir do dia do agendamento (mesma regra do banco). */
function diaJaChegou(a: Pick<Agendamento, 'inicio'>, agora: Date) {
  const dia = new Date(a.inicio)
  dia.setHours(0, 0, 0, 0)
  return dia.getTime() <= agora.getTime()
}

/**
 * Próximos passos possíveis, na ordem em que aparecem (o primeiro é o principal):
 * - Agendado: Confirmar. Se já está na hora (15 min antes), também Chegou / Não veio.
 * - Confirmado: Chegou / Não veio (a partir do dia do atendimento).
 * - Em atendimento: Vendeu / Não fechou.
 * - Encerrado ou com desfecho: nenhum (o resto fica no detalhe).
 */
export function acoesRapidas(a: Pick<Agendamento, 'status' | 'resultado' | 'inicio'>, agora = new Date()): AcaoRapida[] {
  if (estaEncerrado(a)) return []
  const coluna = colunaDe(a)
  if (coluna === 'agendado') {
    const naHora = new Date(a.inicio).getTime() - 15 * 60_000 <= agora.getTime()
    return naHora ? ['confirmar', 'chegou', 'nao_veio'] : ['confirmar']
  }
  if (coluna === 'confirmado') return diaJaChegou(a, agora) ? ['chegou', 'nao_veio'] : []
  if (coluna === 'em_atendimento') return ['vendeu', 'nao_fechou']
  return []
}

export type ResumoDoDia = {
  total: number
  aConfirmar: number
  aguardando: number
  emAtendimento: number
  vendas: number
  valorVendido: number
}

/** Números do topo da tela (cancelados e reagendados ficam de fora). */
export function resumoDoDia(lista: Pick<Agendamento, 'status' | 'resultado' | 'valor_venda'>[]): ResumoDoDia {
  const r: ResumoDoDia = { total: 0, aConfirmar: 0, aguardando: 0, emAtendimento: 0, vendas: 0, valorVendido: 0 }
  for (const a of lista) {
    if (estaEncerrado(a)) continue
    r.total++
    const c = colunaDe(a)
    if (c === 'agendado') r.aConfirmar++
    else if (c === 'confirmado') r.aguardando++
    else if (c === 'em_atendimento') r.emAtendimento++
    else if (c === 'venda_fechada') {
      r.vendas++
      r.valorVendido += a.valor_venda ?? 0
    }
  }
  return r
}
