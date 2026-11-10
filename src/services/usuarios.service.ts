import { FunctionsHttpError } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'
import type { Papel } from '../types/auth'

export type Usuario = {
  id: string
  nome: string
  email: string
  telefone: string | null
  papel: Papel
  ativo: boolean
  criado_em: string
}

export type SenhaGerada = {
  email: string
  senha_temporaria: string
}

export async function listarUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase
    .from('perfis')
    .select('id, nome, email, telefone, papel, ativo, criado_em')
    .order('ativo', { ascending: false })
    .order('nome')
  if (error) throw error
  return data as Usuario[]
}

export async function atualizarUsuario(u: Pick<Usuario, 'id' | 'nome' | 'telefone' | 'papel' | 'ativo'>) {
  const { error } = await supabase.rpc('rpc_admin_atualizar_perfil', {
    p_id: u.id,
    p_nome: u.nome,
    p_telefone: u.telefone ?? '',
    p_papel: u.papel,
    p_ativo: u.ativo,
  })
  if (error) throw error
}

async function chamarAdmin(body: Record<string, unknown>): Promise<SenhaGerada> {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body })

  if (error) {
    // A Edge Function devolve { error } com a mensagem para o usuário.
    if (error instanceof FunctionsHttpError) {
      const detalhe = await error.context.json().catch(() => null)
      if (detalhe?.error) throw new Error(detalhe.error)
    }
    if (error.name === 'FunctionsFetchError' || error.name === 'FunctionsRelayError') {
      throw new Error('A função admin-usuarios não respondeu. Confirme se ela foi implantada no Supabase.')
    }
    throw error
  }
  return data as SenhaGerada
}

export function criarUsuario(dados: { nome: string; email: string; telefone: string; papel: Papel }) {
  return chamarAdmin({ acao: 'criar', ...dados })
}

export function redefinirSenha(id: string) {
  return chamarAdmin({ acao: 'redefinir_senha', id })
}
