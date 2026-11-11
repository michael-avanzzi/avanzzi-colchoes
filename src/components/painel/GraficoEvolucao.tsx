import { useEffect, useMemo, useRef, useState } from 'react'

import { rotuloDoGrupo } from '../../lib/periodos'
import type { Agrupamento, MetricasPeriodo } from '../../services/indicadores.service'

/**
 * Três séries, nas três primeiras cores da paleta categórica validada (ordem fixa).
 * "Compareceram" é tracejada e desenhada por último: quando coincide com
 * "Vendas" (todo mundo comprou), as duas continuam visíveis.
 */
const SERIES = [
  { chave: 'agendamentos', rotulo: 'Agendamentos', cor: 'var(--serie-1)', tracejada: false },
  { chave: 'compareceram', rotulo: 'Compareceram', cor: 'var(--serie-2)', tracejada: true },
  { chave: 'vendas', rotulo: 'Vendas fechadas', cor: 'var(--serie-3)', tracejada: false },
] as const

const ORDEM_DESENHO = [SERIES[0], SERIES[2], SERIES[1]]

type Ponto = { periodo: string; agendamentos: number; compareceram: number; vendas: number }

type Props = {
  chaves: string[]
  serie: MetricasPeriodo[]
  agrupar: Agrupamento
}

const ALTURA = 240
const MARGEM = { topo: 12, direita: 16, base: 28, esquerda: 36 }

/** Escala "redonda" para o eixo Y. */
function ticksY(max: number) {
  if (max <= 4) return [0, 1, 2, 3, 4]
  const passoBruto = max / 4
  const potencia = 10 ** Math.floor(Math.log10(passoBruto))
  const passo = [1, 2, 5, 10].map((m) => m * potencia).find((p) => p >= passoBruto) ?? passoBruto
  const ticks = []
  for (let v = 0; v <= max + passo * 0.001; v += passo) ticks.push(v)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + passo)
  return ticks
}

export function GraficoEvolucao({ chaves, serie, agrupar }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(600)
  const [foco, setFoco] = useState<number | null>(null)
  const [verTabela, setVerTabela] = useState(false)

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const obs = new ResizeObserver(([entrada]) => setLargura(Math.max(280, entrada.contentRect.width)))
    obs.observe(el)
    return () => obs.disconnect()
  }, [verTabela])

  const pontos = useMemo<Ponto[]>(() => {
    const porChave = new Map(serie.map((s) => [s.periodo, s]))
    return chaves.map((periodo) => {
      const s = porChave.get(periodo)
      return {
        periodo,
        agendamentos: s?.agendamentos ?? 0,
        compareceram: s?.compareceram ?? 0,
        vendas: s?.vendas ?? 0,
      }
    })
  }, [chaves, serie])

  const max = Math.max(1, ...pontos.map((p) => p.agendamentos))
  const ticks = ticksY(max)
  const topo = ticks[ticks.length - 1]

  const larguraPlot = largura - MARGEM.esquerda - MARGEM.direita
  const alturaPlot = ALTURA - MARGEM.topo - MARGEM.base
  const passoX = pontos.length > 1 ? larguraPlot / (pontos.length - 1) : 0
  const x = (i: number) => MARGEM.esquerda + (pontos.length > 1 ? i * passoX : larguraPlot / 2)
  const y = (v: number) => MARGEM.topo + alturaPlot - (v / topo) * alturaPlot

  // Rótulos do eixo X sem sobreposição: no máximo um a cada ~56 px.
  const saltoRotulo = Math.max(1, Math.ceil(pontos.length / Math.max(1, Math.floor(larguraPlot / 56))))
  const comMarcadores = pontos.length <= 31

  const focado = foco !== null ? pontos[foco] : null

  return (
    <section className="grafico" aria-labelledby="grafico-titulo">
      <header className="grafico-cabecalho">
        <h2 id="grafico-titulo">Evolução no período</h2>
        <ul className="legenda" aria-label="Legenda">
          {SERIES.map((s) => (
            <li key={s.chave}>
              <span
                className={s.tracejada ? 'legenda-marca tracejada' : 'legenda-marca'}
                style={{ background: s.cor, ['--cor' as string]: s.cor }}
                aria-hidden
              />
              {s.rotulo}
            </li>
          ))}
        </ul>
        <button type="button" className="botao-link" onClick={() => setVerTabela((v) => !v)}>
          {verTabela ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </header>

      {verTabela ? (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th scope="col">Período</th>
                {SERIES.map((s) => (
                  <th key={s.chave} scope="col" className="num">{s.rotulo}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pontos.map((p) => (
                <tr key={p.periodo}>
                  <th scope="row">{rotuloDoGrupo(p.periodo, agrupar, true)}</th>
                  <td className="num">{p.agendamentos}</td>
                  <td className="num">{p.compareceram}</td>
                  <td className="num">{p.vendas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={caixa} className="grafico-area" onMouseLeave={() => setFoco(null)}>
          <svg
            width={largura}
            height={ALTURA}
            role="img"
            aria-label="Gráfico de linhas: agendamentos, comparecimentos e vendas por período. Use “Ver tabela” para os valores."
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={MARGEM.esquerda}
                  x2={largura - MARGEM.direita}
                  y1={y(t)}
                  y2={y(t)}
                  className={t === 0 ? 'eixo-base' : 'grade'}
                />
                <text x={MARGEM.esquerda - 8} y={y(t)} className="rotulo-eixo" textAnchor="end" dominantBaseline="middle">
                  {t}
                </text>
              </g>
            ))}

            {pontos.map((p, i) =>
              i % saltoRotulo === 0 ? (
                <text key={p.periodo} x={x(i)} y={ALTURA - 8} className="rotulo-eixo" textAnchor="middle">
                  {rotuloDoGrupo(p.periodo, agrupar)}
                </text>
              ) : null,
            )}

            {focado && foco !== null && (
              <line x1={x(foco)} x2={x(foco)} y1={MARGEM.topo} y2={MARGEM.topo + alturaPlot} className="mira" />
            )}

            {ORDEM_DESENHO.map((s) => (
              <g key={s.chave}>
                <polyline
                  fill="none"
                  stroke={s.cor}
                  strokeWidth={2}
                  strokeDasharray={s.tracejada ? '6 4' : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={pontos.map((p, i) => `${x(i)},${y(p[s.chave])}`).join(' ')}
                />
                {pontos.map((p, i) =>
                  comMarcadores || foco === i ? (
                    <circle
                      key={p.periodo}
                      cx={x(i)}
                      cy={y(p[s.chave])}
                      r={foco === i ? 5 : 4}
                      fill={s.cor}
                      className="marcador"
                    />
                  ) : null,
                )}
              </g>
            ))}

            {/* Áreas de toque maiores que as marcas, uma por período. */}
            {pontos.map((p, i) => (
              <rect
                key={p.periodo}
                x={x(i) - Math.max(passoX, 24) / 2}
                y={MARGEM.topo}
                width={Math.max(passoX, 24)}
                height={alturaPlot}
                fill="transparent"
                onMouseEnter={() => setFoco(i)}
                onTouchStart={() => setFoco(i)}
              />
            ))}
          </svg>

          {focado && foco !== null && (
            <div
              className="dica"
              role="status"
              style={{
                left: Math.min(Math.max(x(foco), 90), largura - 90),
                top: 4,
              }}
            >
              <strong>{rotuloDoGrupo(focado.periodo, agrupar, true)}</strong>
              {SERIES.map((s) => (
                <span key={s.chave} className="dica-linha">
                  <span className="legenda-marca" style={{ background: s.cor }} aria-hidden />
                  {s.rotulo}
                  <b>{focado[s.chave]}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
