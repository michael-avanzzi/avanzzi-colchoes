import { useCallback, useEffect, useRef, useState } from 'react'

import { mensagemDeErro } from '../lib/supabase'
import { obterRankingVendas, type RankingVendas } from '../services/ranking.service'

/**
 * Ranking de vendas do período, atualizado sozinho a cada `intervaloMs`
 * e sempre que a tela volta a ficar visível.
 */
export function useRankingVendas(inicio: string, fim: string, intervaloMs = 60_000) {
  const [dados, setDados] = useState<RankingVendas | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const pedido = useRef(0)

  const atualizar = useCallback(async () => {
    const meu = ++pedido.current
    setCarregando(true)
    try {
      const d = await obterRankingVendas(inicio, fim)
      if (meu !== pedido.current) return
      setDados(d)
      setErro(null)
    } catch (e) {
      if (meu === pedido.current) setErro(mensagemDeErro(e))
    } finally {
      if (meu === pedido.current) setCarregando(false)
    }
  }, [inicio, fim])

  useEffect(() => {
    const primeira = window.setTimeout(() => void atualizar(), 0)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void atualizar()
    }, intervaloMs)
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void atualizar()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      window.clearTimeout(primeira)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [atualizar, intervaloMs])

  return { dados, erro, carregando, atualizar }
}
