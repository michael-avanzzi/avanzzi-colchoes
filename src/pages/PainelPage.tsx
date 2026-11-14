import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Info } from 'lucide-react'

import { FiltroVendedor } from '../components/agendamentos/FiltroVendedor'
import { GraficoEvolucao } from '../components/painel/GraficoEvolucao'
import { RANKING_HABILITADO } from '../config'
import { useAgendamentos } from '../hooks/useAgendamentos'
import {
  formatarDia,
  formatarDiaCurto,
  formatarMoeda,
  inicioDaSemana,
  inicioDoDia,
  paraInputData,
  somarDias,
} from '../lib/datas'
import { agrupamentoPara, chavesDoPeriodo } from '../lib/periodos'
import { ordenarRanking, ticketMedio } from '../lib/ranking'
import { mensagemDeErro } from '../lib/supabase'
import { obterIndicadores, type Indicadores, type Metricas, type MetricasVendedor } from '../services/indicadores.service'

type TipoPeriodo = 'dia' | 'semana' | 'mes' | 'personalizado'

const fmtMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const fmtNumero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function calcularPeriodo(tipo: TipoPeriodo, ref: Date, de: string, ate: string): { inicio: Date; fim: Date } {
  if (tipo === 'dia') return { inicio: inicioDoDia(ref), fim: somarDias(inicioDoDia(ref), 1) }
  if (tipo === 'semana') {
    const inicio = inicioDaSemana(ref)
    return { inicio, fim: somarDias(inicio, 7) }
  }
  if (tipo === 'mes') {
    return { inicio: new Date(ref.getFullYear(), ref.getMonth(), 1), fim: new Date(ref.getFullYear(), ref.getMonth() + 1, 1) }
  }
  const [a1, m1, d1] = de.split('-').map(Number)
  const [a2, m2, d2] = ate.split('-').map(Number)
  return { inicio: new Date(a1, m1 - 1, d1), fim: new Date(a2, m2 - 1, d2 + 1) }
}

function taxa(v: number | null) {
  return v === null ? '—' : `${fmtNumero.format(v)}%`
}

export function PainelPage() {
  const [hoje] = useState(() => inicioDoDia(new Date()))
  const [tipo, setTipo] = useState<TipoPeriodo>('mes')
  const [referencia, setReferencia] = useState(hoje)
  const [de, setDe] = useState(() => paraInputData(new Date(hoje.getFullYear(), hoje.getMonth(), 1)))
  const [ate, setAte] = useState(() => paraInputData(hoje))
  const [vendedor, setVendedor] = useState('')

  const [dados, setDados] = useState<Indicadores | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const personalizadoValido = tipo !== 'personalizado' || (de && ate && de <= ate)
  const { inicio, fim } = calcularPeriodo(tipo, referencia, de, ate)
  const agrupar = agrupamentoPara(inicio, fim)
  const inicioMs = inicio.getTime()
  const fimMs = fim.getTime()

  // Reaproveita o tempo real da agenda: qualquer alteração recalcula os indicadores.
  const { agendamentos: sinal } = useAgendamentos(inicio, fim)

  useEffect(() => {
    if (!personalizadoValido) return
    let ativo = true
    obterIndicadores(new Date(inicioMs), new Date(fimMs), vendedor || null, agrupar)
      .then((d) => {
        if (!ativo) return
        setDados(d)
        setErro(null)
      })
      .catch((error) => ativo && setErro(mensagemDeErro(error)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [inicioMs, fimMs, vendedor, agrupar, personalizadoValido, sinal])

  const chaves = useMemo(
    () => chavesDoPeriodo(new Date(inicioMs), new Date(fimMs), agrupar),
    [inicioMs, fimMs, agrupar],
  )

  function navegar(passo: number) {
    setReferencia((r) => {
      if (tipo === 'dia') return somarDias(r, passo)
      if (tipo === 'semana') return somarDias(r, 7 * passo)
      return new Date(r.getFullYear(), r.getMonth() + passo, 1)
    })
  }

  const titulo =
    tipo === 'dia'
      ? formatarDia(inicio)
      : tipo === 'mes'
        ? fmtMes.format(inicio)
        : `${formatarDiaCurto(inicio)} a ${formatarDiaCurto(somarDias(fim, -1))}`

  const r = dados?.resumo
  const vendedores = useMemo(() => {
    const lista = dados?.por_vendedor ?? []
    return RANKING_HABILITADO ? ordenarRanking(lista) : [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [dados])

  return (
    <section className="pagina pagina-larga">
      <header className="pagina-cabecalho">
        <h1>Painel de controle</h1>
        <p className="texto-suave primeira-maiuscula">{titulo}</p>
      </header>

      <div className="barra-filtros">
        <div className="segmentado" role="group" aria-label="Período">
          {(
            [
              ['dia', 'Dia'],
              ['semana', 'Semana'],
              ['mes', 'Mês'],
              ['personalizado', 'Período'],
            ] as [TipoPeriodo, string][]
          ).map(([t, rotulo]) => (
            <button
              key={t}
              type="button"
              aria-pressed={tipo === t}
              className={tipo === t ? 'ativo' : ''}
              onClick={() => {
                setTipo(t)
                setReferencia(hoje)
              }}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {tipo === 'personalizado' ? (
          <div className="periodo-livre">
            <label className="filtro">
              <span className="sr-only">De</span>
              <input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} aria-label="Data inicial" />
            </label>
            <span className="texto-suave">até</span>
            <label className="filtro">
              <span className="sr-only">Até</span>
              <input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} aria-label="Data final" />
            </label>
          </div>
        ) : (
          <div className="navegacao-periodo">
            <button type="button" className="botao-icone escuro" onClick={() => navegar(-1)} aria-label="Período anterior">
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              className="botao botao-secundario botao-pequeno"
              onClick={() => setReferencia(hoje)}
            >
              Atual
            </button>
            <button type="button" className="botao-icone escuro" onClick={() => navegar(1)} aria-label="Próximo período">
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        <FiltroVendedor valor={vendedor} onChange={setVendedor} />
        {carregando && <span className="spinner spinner-suave" role="status" aria-label="Carregando" />}
      </div>

      {!personalizadoValido && <p className="alerta alerta-aviso">Escolha uma data inicial anterior à final.</p>}
      {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}

      {r && (
        <>
          <div className="indicadores">
            <Cartao
              titulo="Agendamentos"
              valor={r.agendamentos}
              detalhe={detalheAgendamentos(r)}
            />
            <Cartao titulo="Compareceram" valor={r.compareceram} detalhe={`${r.resultado_pendente} com resultado pendente`} />
            <Cartao titulo="Não compareceram" valor={r.nao_compareceram} />
            <Cartao
              titulo="Vendas fechadas"
              valor={r.vendas}
              detalhe={r.valor_vendido > 0 ? `${formatarMoeda(r.valor_vendido)} registrados` : undefined}
            />
            <Cartao
              titulo="Taxa de comparecimento"
              valor={taxa(r.taxa_comparecimento)}
              detalhe={`${r.compareceram} de ${r.compareceram + r.nao_compareceram} com desfecho`}
              destaque
            />
            <Cartao
              titulo="Taxa de conversão"
              valor={taxa(r.taxa_conversao)}
              detalhe={`${r.vendas} vendas em ${r.vendas + r.nao_fechou} atendimentos concluídos`}
              destaque
            />
          </div>

          {r.pendentes > 0 && (
            <p className="alerta alerta-aviso pendencias" role="status">
              <AlertTriangle size={18} aria-hidden />
              <span>
                <strong>{r.pendentes}</strong> atendimento(s) já passaram sem comparecimento registrado e estão fora
                das taxas. Resolva pelo aviso no Kanban.
              </span>
            </p>
          )}

          {chaves.length > 1 && <GraficoEvolucao chaves={chaves} serie={dados.serie} agrupar={agrupar} />}

          <section className="bloco" aria-labelledby="por-vendedor">
            <h2 id="por-vendedor">{RANKING_HABILITADO ? 'Ranking por vendedor' : 'Por vendedor'}</h2>
            {vendedores.length === 0 ? (
              <p className="texto-suave">Nenhum agendamento no período.</p>
            ) : (
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      {RANKING_HABILITADO && <th scope="col" className="num">#</th>}
                      <th scope="col">Vendedor</th>
                      <th scope="col" className="num">Agendamentos</th>
                      <th scope="col" className="num">Compareceram</th>
                      <th scope="col" className="num">Faltas</th>
                      <th scope="col" className="num">Vendas</th>
                      <th scope="col" className="num">Comparecimento</th>
                      <th scope="col" className="num">Conversão</th>
                      <th scope="col" className="num">Ticket médio</th>
                      <th scope="col" className="num">Valor vendido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendedores.map((v, i) => (
                      <tr key={v.vendedor_id}>
                        {RANKING_HABILITADO && <td className="num">{i + 1}º</td>}
                        <th scope="row">{v.nome}</th>
                        <td className="num">{v.agendamentos}</td>
                        <td className="num">{v.compareceram}</td>
                        <td className="num">{v.nao_compareceram}</td>
                        <td className="num">{v.vendas}</td>
                        <td className="num">
                          {taxa(v.taxa_comparecimento)}
                          <small> {v.compareceram}/{v.compareceram + v.nao_compareceram}</small>
                        </td>
                        <td className="num">
                          {taxa(v.taxa_conversao)}
                          <small> {v.vendas}/{v.vendas + v.nao_fechou}</small>
                        </td>
                        <td className="num">{formatarTicket(v)}</td>
                        <td className="num">
                          <strong>{v.valor_vendido > 0 ? formatarMoeda(v.valor_vendido) : '—'}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <details className="bloco como-calculamos">
            <summary>
              <Info size={16} aria-hidden /> Como os indicadores são calculados
            </summary>
            <ul>
              <li><strong>Taxa de comparecimento</strong> = compareceram ÷ (compareceram + não compareceram).</li>
              <li><strong>Taxa de conversão</strong> = vendas fechadas ÷ (vendas fechadas + não fechou).</li>
              {RANKING_HABILITADO && (
                <li>
                  <strong>Ranking</strong> = maior valor vendido no período. O valor já reúne os clientes trazidos à loja,
                  a conversão e o ticket médio. Empate: mais vendas, maior conversão, mais clientes atendidos.
                </li>
              )}
              <li><strong>Ticket médio</strong> = valor vendido ÷ vendas fechadas.</li>
              <li>Ficam de fora: agendamentos futuros, cancelados e reagendados (a cadeia conta uma vez, pelo horário final).</li>
              <li>Atendimentos que já passaram sem registro de comparecimento, ou com resultado pendente, aguardam conclusão e não entram nas taxas.</li>
              <li>Regra provisória, sujeita à validação da gestão.</li>
            </ul>
          </details>
        </>
      )}
    </section>
  )
}

function formatarTicket(v: MetricasVendedor) {
  const t = ticketMedio(v)
  return t === null ? '—' : formatarMoeda(t)
}

function detalheAgendamentos(r: Metricas) {
  const partes = []
  if (r.futuros) partes.push(`${r.futuros} futuro(s)`)
  if (r.cancelados) partes.push(`${r.cancelados} cancelado(s)`)
  if (r.reagendados) partes.push(`${r.reagendados} reagendado(s)`)
  return partes.length ? partes.join(' · ') : undefined
}

function Cartao({
  titulo,
  valor,
  detalhe,
  destaque,
}: {
  titulo: string
  valor: number | string
  detalhe?: string
  destaque?: boolean
}) {
  return (
    <div className={destaque ? 'indicador indicador-destaque' : 'indicador'}>
      <span className="indicador-titulo">{titulo}</span>
      <strong className="indicador-valor">{valor}</strong>
      {detalhe && <span className="indicador-detalhe">{detalhe}</span>}
    </div>
  )
}
