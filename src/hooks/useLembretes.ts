import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { listarAgendamentos } from '../services/agendamentos.service'
import type { Agendamento } from '../types/agendamento'

export const ANTECEDENCIA_MIN = 60

/** Agendamentos do vendedor que ainda precisam ser confirmados e começam na próxima hora. */
export function filtrarLembretes(lista: Agendamento[], vendedorId: string, agora: number) {
  const limite = agora + ANTECEDENCIA_MIN * 60_000
  return lista
    .filter((a) => a.vendedor_id === vendedorId && a.status === 'agendado')
    .filter((a) => {
      const inicio = new Date(a.inicio).getTime()
      return inicio > agora && inicio <= limite
    })
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
}

/**
 * Lembretes do usuário logado, recalculados a cada minuto e a cada mudança
 * na agenda (tempo real). Com o app fechado, quem avisa é o Web Push.
 */
export function useLembretes() {
  const { perfil } = useAuth()
  const meuId = perfil?.allowed ? perfil.id : null
  const [lembretes, setLembretes] = useState<Agendamento[]>([])

  const atualizar = useCallback(async () => {
    if (!meuId) return
    const agora = Date.now()
    try {
      const lista = await listarAgendamentos(new Date(agora), new Date(agora + ANTECEDENCIA_MIN * 60_000 + 60_000))
      setLembretes(filtrarLembretes(lista, meuId, Date.now()))
    } catch (error) {
      console.warn('[Lembretes]', error)
    }
  }, [meuId])

  useEffect(() => {
    if (!meuId) return
    const primeira = window.setTimeout(() => void atualizar(), 0)
    const relogio = window.setInterval(() => void atualizar(), 60_000)
    let espera: number | undefined
    const canal = supabase
      .channel(`lembretes-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, () => {
        window.clearTimeout(espera)
        espera = window.setTimeout(() => void atualizar(), 500)
      })
      .subscribe()
    return () => {
      window.clearTimeout(primeira)
      window.clearInterval(relogio)
      window.clearTimeout(espera)
      void supabase.removeChannel(canal)
    }
  }, [meuId, atualizar])

  return { lembretes, atualizar }
}
