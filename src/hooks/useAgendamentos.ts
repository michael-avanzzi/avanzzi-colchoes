import { useCallback, useEffect, useRef, useState } from 'react'

import { mensagemDeErro, supabase } from '../lib/supabase'
import { listarAgendamentos } from '../services/agendamentos.service'
import type { Agendamento } from '../types/agendamento'

/**
 * Agendamentos do período [inicio, fim), atualizados em tempo real:
 * qualquer alteração feita por outro usuário (ou em outra tela) recarrega a lista.
 */
export function useAgendamentos(inicio: Date | null, fim: Date | null) {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const inicioMs = inicio?.getTime() ?? null
  const fimMs = fim?.getTime() ?? null
  const requisicao = useRef(0)

  const recarregar = useCallback(async () => {
    if (inicioMs === null || fimMs === null) return
    const atual = ++requisicao.current
    try {
      const lista = await listarAgendamentos(new Date(inicioMs), new Date(fimMs))
      if (atual !== requisicao.current) return // resposta de um período antigo
      setAgendamentos(lista)
      setErro(null)
    } catch (error) {
      if (atual === requisicao.current) setErro(mensagemDeErro(error))
    } finally {
      if (atual === requisicao.current) setCarregando(false)
    }
  }, [inicioMs, fimMs])

  useEffect(() => {
    // Agenda fora do corpo do efeito para não disparar setState síncrono.
    const t = window.setTimeout(() => void recarregar(), 0)
    return () => window.clearTimeout(t)
  }, [recarregar])

  useEffect(() => {
    let espera: number | undefined
    const canal = supabase
      .channel(`agendamentos-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos' }, () => {
        // Agrupa rajadas (ex.: reagendar gera 2 alterações).
        window.clearTimeout(espera)
        espera = window.setTimeout(() => void recarregar(), 300)
      })
      .subscribe()

    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void recarregar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('online', aoVoltar)

    return () => {
      window.clearTimeout(espera)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('online', aoVoltar)
      void supabase.removeChannel(canal)
    }
  }, [recarregar])

  return { agendamentos, carregando, erro, recarregar }
}
