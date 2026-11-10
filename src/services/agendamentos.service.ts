import { supabase } from '../lib/supabase'
import type {
  Agendamento,
  Categoria,
  EventoAgendamento,
  ResultadoVenda,
  StatusAtendimento,
  Vendedor,
} from '../types/agendamento'

export async function listarAgendamentos(inicio: Date, fim: Date): Promise<Agendamento[]> {
  const { data, error } = await supabase
    .from('agendamentos')
    .select('*')
    .gte('inicio', inicio.toISOString())
    .lt('inicio', fim.toISOString())
    .order('inicio')
    .limit(2000)
  if (error) throw error
  return data as Agendamento[]
}

export async function listarCategorias(): Promise<Categoria[]> {
  const { data, error } = await supabase
    .from('categorias_produto')
    .select('id, nome, ordem, ativo')
    .order('ordem')
  if (error) throw error
  return data as Categoria[]
}

/** Todos os perfis (inclusive inativos, para exibir nomes em registros antigos). */
export async function listarVendedores(): Promise<Vendedor[]> {
  const { data, error } = await supabase
    .from('perfis')
    .select('id, nome, papel, ativo')
    .order('nome')
  if (error) throw error
  return data as Vendedor[]
}

export async function listarEventos(agendamentoId: string): Promise<EventoAgendamento[]> {
  const { data, error } = await supabase
    .from('agendamento_eventos')
    .select('*')
    .eq('agendamento_id', agendamentoId)
    .order('ocorrido_em')
    .order('id')
  if (error) throw error
  return data as EventoAgendamento[]
}

async function rpc(nome: string, params: Record<string, unknown>): Promise<Agendamento> {
  const { data, error } = await supabase.rpc(nome, params)
  if (error) throw error
  return data as Agendamento
}

export type NovoAgendamento = {
  cliente_nome: string
  cliente_telefone: string
  inicio: string
  duracao_min: number
  categoria_id: number | null
  observacoes: string
  vendedor_id: string | null
}

export const criarAgendamento = (n: NovoAgendamento) =>
  rpc('rpc_criar_agendamento', {
    p_cliente_nome: n.cliente_nome,
    p_inicio: n.inicio,
    p_duracao_min: n.duracao_min,
    p_categoria_id: n.categoria_id,
    p_observacoes: n.observacoes,
    p_cliente_telefone: n.cliente_telefone,
    p_vendedor_id: n.vendedor_id,
  })

export const editarAgendamento = (
  a: Pick<Agendamento, 'id' | 'versao'>,
  d: Pick<NovoAgendamento, 'cliente_nome' | 'cliente_telefone' | 'categoria_id' | 'observacoes' | 'duracao_min'>,
  motivo?: string,
) =>
  rpc('rpc_editar_agendamento', {
    p_id: a.id,
    p_versao: a.versao,
    p_cliente_nome: d.cliente_nome,
    p_cliente_telefone: d.cliente_telefone,
    p_categoria_id: d.categoria_id,
    p_observacoes: d.observacoes,
    p_duracao_min: d.duracao_min,
    p_motivo: motivo ?? null,
  })

export const reagendar = (a: Pick<Agendamento, 'id' | 'versao'>, novoInicio: string, motivo: string) =>
  rpc('rpc_reagendar_agendamento', {
    p_id: a.id,
    p_versao: a.versao,
    p_novo_inicio: novoInicio,
    p_motivo: motivo,
  })

export const cancelar = (a: Pick<Agendamento, 'id' | 'versao'>, motivo: string) =>
  rpc('rpc_cancelar_agendamento', { p_id: a.id, p_versao: a.versao, p_motivo: motivo })

export const atualizarStatus = (a: Pick<Agendamento, 'id' | 'versao'>, status: StatusAtendimento) =>
  rpc('rpc_atualizar_status', { p_id: a.id, p_versao: a.versao, p_status: status })

export const registrarResultado = (
  a: Pick<Agendamento, 'id' | 'versao'>,
  resultado: ResultadoVenda,
  valor?: number | null,
) =>
  rpc('rpc_registrar_resultado', {
    p_id: a.id,
    p_versao: a.versao,
    p_resultado: resultado,
    p_valor_venda: valor ?? null,
  })

export const transferirVendedor = (a: Pick<Agendamento, 'id' | 'versao'>, vendedorId: string, motivo: string) =>
  rpc('rpc_transferir_vendedor', {
    p_id: a.id,
    p_versao: a.versao,
    p_novo_vendedor_id: vendedorId,
    p_motivo: motivo,
  })
