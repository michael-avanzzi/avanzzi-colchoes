import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, Maximize, X } from 'lucide-react'

import { useAuth } from '../auth/AuthProvider'
import { Logo } from '../components/layout/Logo'
import { AvisosRanking } from '../components/ranking/AvisosRanking'
import { MetaLoja } from '../components/ranking/MetaLoja'
import { ListaRanking, Podio } from '../components/ranking/Placar'
import { useRankingVendas } from '../hooks/useRankingVendas'
import { hojeBrasilia, nomeDoMes, periodoDoPreset } from '../lib/rankingVendas'

const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

/** Relógio que troca o "hoje" à meia-noite de Brasília. */
function useAgora(intervaloMs = 15_000) {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), intervaloMs)
    return () => window.clearInterval(t)
  }, [intervaloMs])
  return agora
}

/** Mantém a tela da TV acesa enquanto a página estiver aberta (quando o navegador permite). */
function useTelaAcesa() {
  useEffect(() => {
    let trava: WakeLockSentinel | null = null
    const pedir = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          trava = await navigator.wakeLock.request('screen')
        }
      } catch {
        // sem permissão: a TV segue a configuração de energia dela
      }
    }
    void pedir()
    const aoVoltar = () => void pedir()
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar)
      void trava?.release().catch(() => {})
    }
  }, [])
}

/** Ranking do mês em tela cheia para a TV da sala de vendas. Atualiza a cada minuto. */
export function RankingTvPage() {
  const { perfil, signOut } = useAuth()
  const ehTv = perfil?.allowed && perfil.papel === 'tv'
  const agora = useAgora()
  const hoje = hojeBrasilia(agora)
  const periodo = periodoDoPreset('mes', hoje)
  const { dados, erro } = useRankingVendas(periodo.inicio, periodo.fim, 60_000)
  useTelaAcesa()

  useEffect(() => {
    document.documentElement.classList.add('rk-tv-ativo')
    return () => document.documentElement.classList.remove('rk-tv-ativo')
  }, [])

  function telaCheia() {
    const el = document.documentElement
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void el.requestFullscreen?.().catch(() => {})
  }

  const vendedores = dados?.vendedores ?? []

  return (
    <div className="rk-tv">
      <header className="rk-tv-topo">
        <div className="rk-tv-marca">
          <Logo />
          <div>
            <h1>Ranking de vendas</h1>
            <p>{nomeDoMes(periodo.inicio)} · pedidos do Syscol</p>
          </div>
        </div>
        <div className="rk-tv-hora">
          <strong>{hora.format(agora)}</strong>
          <span>{dados ? `Atualizado às ${hora.format(new Date(dados.gerado_em))}` : 'Carregando…'}</span>
        </div>
        <div className="rk-tv-botoes">
          <button type="button" className="botao-icone" onClick={telaCheia} aria-label="Tela cheia" title="Tela cheia">
            <Maximize size={20} />
          </button>
          {ehTv ? (
            <button type="button" className="botao-icone" onClick={() => void signOut()} aria-label="Sair da conta" title="Sair da conta">
              <LogOut size={20} />
            </button>
          ) : (
            <Link to="/ranking" className="botao-icone" aria-label="Sair do modo TV" title="Sair do modo TV">
              <X size={20} />
            </Link>
          )}
        </div>
      </header>

      {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}

      {dados && (
        <main className="rk-tv-corpo">
          <MetaLoja mes={dados.mes} />
          {vendedores.length === 0 ? (
            <p className="rk-tv-vazio">Nenhum pedido neste mês ainda.</p>
          ) : (
            <div className="rk-tv-placar">
              <Podio vendedores={vendedores} tamanhoFoto={120} />
              <ListaRanking vendedores={vendedores} />
            </div>
          )}
        </main>
      )}

      <AvisosRanking dados={dados} />
    </div>
  )
}
