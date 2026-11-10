export type StatusAtendimento =
  | 'agendado'
  | 'confirmado'
  | 'compareceu'
  | 'nao_compareceu'
  | 'cancelado'
  | 'reagendado'

export type ResultadoVenda = 'pendente' | 'venda_fechada' | 'nao_fechou'

export type Agendamento = {
  id: string
  cliente_nome: string
  cliente_telefone: string | null
  inicio: string
  duracao_min: number
  vendedor_id: string
  categoria_id: number | null
  observacoes: string | null
  status: StatusAtendimento
  resultado: ResultadoVenda
  valor_venda: number | null
  motivo_cancelamento: string | null
  reagendado_de_id: string | null
  reagendado_para_id: string | null
  comparecimento_por: string | null
  comparecimento_em: string | null
  resultado_por: string | null
  resultado_em: string | null
  versao: number
  criado_por: string
  criado_em: string
  atualizado_por: string | null
  atualizado_em: string
}

export type Categoria = { id: number; nome: string; ordem: number; ativo: boolean }

export type Vendedor = { id: string; nome: string; papel: string; ativo: boolean }

export type EventoAgendamento = {
  id: number
  agendamento_id: string
  tipo: string
  dados_anteriores: Record<string, unknown> | null
  dados_novos: Record<string, unknown> | null
  motivo: string | null
  usuario_id: string | null
  ocorrido_em: string
}

/**
 * Colunas do Kanban. São derivadas de status + resultado, para que o
 * Kanban e o calendário mostrem sempre a mesma coisa.
 */
export type Coluna =
  | 'agendado'
  | 'confirmado'
  | 'em_atendimento'
  | 'venda_fechada'
  | 'nao_fechou'
  | 'nao_compareceu'
  | 'reagendado'
  | 'cancelado'

export const COLUNAS: { id: Coluna; titulo: string; cor: string }[] = [
  { id: 'agendado', titulo: 'Agendado', cor: '#6b7a90' },
  { id: 'confirmado', titulo: 'Confirmado', cor: '#2f6fd6' },
  { id: 'em_atendimento', titulo: 'Em atendimento', cor: '#e08a00' },
  { id: 'venda_fechada', titulo: 'Venda fechada', cor: '#1f8a4c' },
  { id: 'nao_fechou', titulo: 'Não fechou', cor: '#8a5a44' },
  { id: 'nao_compareceu', titulo: 'Não compareceu', cor: '#c62828' },
  { id: 'reagendado', titulo: 'Reagendado', cor: '#7b4fc9' },
  { id: 'cancelado', titulo: 'Cancelado', cor: '#8c8c8c' },
]

export const COLUNA_POR_ID = Object.fromEntries(COLUNAS.map((c) => [c.id, c])) as Record<
  Coluna,
  (typeof COLUNAS)[number]
>

export function colunaDe(a: Pick<Agendamento, 'status' | 'resultado'>): Coluna {
  if (a.status === 'compareceu') {
    if (a.resultado === 'venda_fechada') return 'venda_fechada'
    if (a.resultado === 'nao_fechou') return 'nao_fechou'
    return 'em_atendimento'
  }
  return a.status
}

/** Agendamento encerrado: não se move mais no Kanban. */
export function estaEncerrado(a: Pick<Agendamento, 'status'>) {
  return a.status === 'cancelado' || a.status === 'reagendado'
}

export const TIPO_EVENTO_ROTULO: Record<string, string> = {
  criado: 'Agendamento criado',
  criado_por_reagendamento: 'Criado por reagendamento',
  editado: 'Dados alterados',
  reagendado: 'Reagendado',
  cancelado: 'Cancelado',
  status_alterado: 'Status alterado',
  resultado_registrado: 'Resultado registrado',
  vendedor_alterado: 'Vendedor alterado',
  alterado: 'Alterado',
}

export const CAMPO_ROTULO: Record<string, string> = {
  cliente_nome: 'Cliente',
  cliente_telefone: 'Telefone',
  inicio: 'Data/horário',
  duracao_min: 'Duração (min)',
  vendedor_id: 'Vendedor',
  categoria_id: 'Produto',
  observacoes: 'Observações',
  status: 'Status',
  resultado: 'Resultado',
  valor_venda: 'Valor da venda',
  motivo_cancelamento: 'Motivo do cancelamento',
  reagendado_de_id: 'Reagendado de',
  reagendado_para_id: 'Reagendado para',
}

export const STATUS_ROTULO: Record<StatusAtendimento, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  compareceu: 'Compareceu',
  nao_compareceu: 'Não compareceu',
  cancelado: 'Cancelado',
  reagendado: 'Reagendado',
}

export const RESULTADO_ROTULO: Record<ResultadoVenda, string> = {
  pendente: 'Pendente',
  venda_fechada: 'Venda fechada',
  nao_fechou: 'Não fechou',
}
