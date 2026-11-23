import { useEffect, useRef, useState } from 'react'

import { dataCurta } from '../../lib/rankingVendas'
import type { RankingVendas } from '../../services/ranking.service'

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function eixo(v: number) {
  if (v >= 1000) return `R$ ${Math.round(v / 1000)} mil`
  return `R$ ${Math.round(v)}`
}

/** Valor vendido por dia, em barras. Aponte ou toque numa barra para ver o valor. */
export function GraficoVendasDia({ diario }: { diario: RankingVendas['diario'] }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(640)
  const [ativo, setAtivo] = useState<number | null>(null)

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(280, Math.round(e.contentRect.width))))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  if (diario.length === 0) return null

  const altura = 220
  const base = altura - 26
  const esquerda = 64
  const maximo = Math.max(...diario.map((d) => d.valor), 1)
  const passoEixo = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maximo)
  const passo = (largura - esquerda) / diario.length
  const larguraBarra = Math.max(2, passo * (diario.length > 40 ? 0.8 : 0.66))
  const y = (v: number) => base - (v / maximo) * (base - 12)
  const cadaRotulo = Math.max(1, Math.ceil(diario.length / Math.floor((largura - esquerda) / 52)))
  const selecionado = ativo !== null ? diario[ativo] : null

  return (
    <div className="rk-grafico" ref={caixa}>
      <svg
        width={largura}
        height={altura}
        viewBox={`0 0 ${largura} ${altura}`}
        role="img"
        aria-label="Valor vendido por dia no período"
        onMouseLeave={() => setAtivo(null)}
      >
        {passoEixo.map((v) => (
          <g key={v}>
            <line x1={esquerda} x2={largura} y1={y(v)} y2={y(v)} className="rk-grafico-grade" />
            <text x={esquerda - 8} y={y(v)} dy="0.32em" textAnchor="end" className="rk-grafico-texto">
              {eixo(v)}
            </text>
          </g>
        ))}
        {diario.map((d, i) => {
          const x = esquerda + i * passo + (passo - larguraBarra) / 2
          return (
            <g key={d.dia}>
              <rect
                x={x}
                y={y(d.valor)}
                width={larguraBarra}
                height={Math.max(0, base - y(d.valor))}
                rx={Math.min(4, larguraBarra / 3)}
                className={d.valor > 0 ? (ativo === i ? 'rk-barra rk-barra-ativa' : 'rk-barra') : 'rk-barra-vazia'}
              />
              <rect
                x={esquerda + i * passo}
                y={0}
                width={passo}
                height={base}
                fill="transparent"
                onMouseEnter={() => setAtivo(i)}
                onClick={() => setAtivo(i)}
              />
              {i % cadaRotulo === 0 && (
                <text x={x + larguraBarra / 2} y={altura - 6} textAnchor="middle" className="rk-grafico-texto">
                  {dataCurta(d.dia)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {selecionado && (
        <div
          className="rk-dica"
          style={{ left: Math.min(Math.max(0, esquerda + (ativo ?? 0) * passo + passo / 2 - 70), largura - 140) }}
          role="status"
        >
          <strong>{dataCurta(selecionado.dia)}</strong>
          <span>{moeda.format(selecionado.valor)}</span>
          <small>{selecionado.pedidos === 1 ? '1 pedido' : `${selecionado.pedidos} pedidos`}</small>
        </div>
      )}
    </div>
  )
}
