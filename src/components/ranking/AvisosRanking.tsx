import { useEffect, useRef, useState } from 'react'

import { detectarAvisos, primeiroNome, type AvisoRanking } from '../../lib/rankingVendas'
import { tocarLideranca, tocarMeta } from '../../lib/sons'
import type { RankingVendas } from '../../services/ranking.service'
import { Avatar } from '../ui/Avatar'

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const DURACAO_MS = 12_000

function ler<T>(chave: string, padrao: T): T {
  try {
    const v = localStorage.getItem(chave)
    return v ? (JSON.parse(v) as T) : padrao
  } catch {
    return padrao
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    // sem armazenamento local: o aviso pode se repetir nesta tela, sem prejuízo
  }
}

/**
 * Mostra na tela um aviso grande quando alguém assume o 1º lugar do período
 * ou bate a meta do dia. Cada tela comemora cada meta uma vez por dia.
 */
export function AvisosRanking({ dados }: { dados: RankingVendas | null }) {
  const [fila, setFila] = useState<AvisoRanking[]>([])
  const vistos = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (!dados) return
    const chaveLider = `avanzzi.ranking.lider.${dados.periodo.inicio}.${dados.periodo.fim}`
    const chaveMetas = `avanzzi.ranking.metas.${dados.hoje}`
    if (!vistos.current) vistos.current = new Set(ler<string[]>(chaveMetas, []))

    const { avisos, lider } = detectarAvisos(dados, ler<string | null>(chaveLider, null), vistos.current)
    if (lider) gravar(chaveLider, lider)
    if (avisos.length === 0) return
    for (const a of avisos) if (a.tipo === 'meta') vistos.current.add(a.chave)
    gravar(chaveMetas, [...vistos.current].filter((c) => c.startsWith(`meta:${dados.hoje}:`)))
    setFila((f) => [...f, ...avisos])
  }, [dados])

  const atual = fila[0]

  useEffect(() => {
    if (!atual) return
    const t = window.setTimeout(() => setFila((f) => f.slice(1)), DURACAO_MS)
    return () => window.clearTimeout(t)
  }, [atual])

  if (!atual) return null
  return <CartaoAviso aviso={atual} onFechar={() => setFila((f) => f.slice(1))} />
}

export function CartaoAviso({ aviso, onFechar }: { aviso: AvisoRanking; onFechar: () => void }) {
  const v = aviso.vendedor
  const lider = aviso.tipo === 'lider'

  // Som combinando com o aviso: fanfarra para o novo líder, carrilhão para a meta do dia.
  useEffect(() => {
    if (aviso.tipo === 'lider') tocarLideranca()
    else tocarMeta()
  }, [aviso.chave, aviso.tipo])
  return (
    <div className="rk-aviso-fundo" role="alertdialog" aria-labelledby="rk-aviso-titulo" onClick={onFechar}>
      <div className={`rk-aviso ${lider ? '' : 'rk-aviso-meta'}`} onClick={(e) => e.stopPropagation()}>
        <Confete />
        <Avatar nome={v.nome} fotoPath={v.foto_path} tamanho={140} className="rk-foto" />
        <p className="rk-aviso-chamada">{lider ? 'Novo 1º lugar' : 'Meta do dia batida'}</p>
        <h2 id="rk-aviso-titulo" className="rk-aviso-titulo">
          {lider ? `${primeiroNome(v.nome)} assumiu a liderança!` : `${primeiroNome(v.nome)} bateu a meta de hoje!`}
        </h2>
        <p className="rk-aviso-texto">
          {lider
            ? `${moeda.format(v.valor)} vendidos no período`
            : `${moeda.format(v.hoje_valor)} vendidos hoje · meta de ${moeda.format(v.meta_diaria ?? 0)}`}
        </p>
        <button type="button" className="botao botao-primario" onClick={onFechar} autoFocus>
          Fechar
        </button>
      </div>
    </div>
  )
}

/** Confete leve em canvas; não roda para quem prefere menos movimento. */
function Confete() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const w = (c.width = c.offsetWidth)
    const h = (c.height = c.offsetHeight)
    const cores = ['#e0566a', '#ffd166', '#1f8a4c', '#4f7fd9', '#ff3b30', '#ffffff']
    const pecas = Array.from({ length: 120 }, () => ({
      x: Math.random() * w,
      y: -20 - Math.random() * h * 0.6,
      vx: (Math.random() - 0.5) * 2.4,
      vy: 2 + Math.random() * 3.2,
      r: 5 + Math.random() * 6,
      a: Math.random() * Math.PI,
      va: (Math.random() - 0.5) * 0.3,
      cor: cores[Math.floor(Math.random() * cores.length)],
    }))
    const inicio = performance.now()
    let quadro = 0
    const desenhar = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      for (const p of pecas) {
        p.x += p.vx
        p.y += p.vy
        p.a += p.va
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.a)
        ctx.fillStyle = p.cor
        ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2)
        ctx.restore()
      }
      if (t - inicio < 5000) quadro = requestAnimationFrame(desenhar)
      else ctx.clearRect(0, 0, w, h)
    }
    quadro = requestAnimationFrame(desenhar)
    return () => cancelAnimationFrame(quadro)
  }, [])

  return <canvas ref={ref} className="rk-confete" aria-hidden />
}
