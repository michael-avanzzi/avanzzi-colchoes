import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarSearch, ChevronLeft, ChevronRight, MessageCircle, Phone, Plus, Undo2 } from 'lucide-react'

import { useAuth } from '../auth/AuthProvider'
import { AgendamentoModais, type EstadoModal } from '../components/agendamentos/AgendamentoModais'
import { FiltroVendedor } from '../components/agendamentos/FiltroVendedor'
import { Pendencias } from '../components/agendamentos/Pendencias'
import { useAgendamentos } from '../hooks/useAgendamentos'
import { useCadastros } from '../hooks/useCadastros'
import { formatarHora, formatarMoeda, inicioDoDia, paraInputData, somarDias } from '../lib/datas'
import {
  acoesRapidas,
  DESTINO_DA_ACAO,
  FEITO_DA_ACAO,
  ROTULO_DA_ACAO,
  resumoDoDia,
  type AcaoRapida,
} from '../lib/meuDia'
import { ehGestor, moverPara, podeAlterar } from '../lib/movimentos'
import { mensagemDeErro } from '../lib/supabase'
import { linkWhatsApp, montarMensagem, normalizarTelefoneBR } from '../lib/whatsapp'
import { COLUNA_POR_ID, colunaDe, estaEncerrado, type Agendamento, type Coluna } from '../types/agendamento'

const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

type Aviso = { texto: string; erro?: boolean; desfazer?: () => Promise<unknown> }

/**
 * Meu dia: os atendimentos do dia em ordem de horário, cada um com o próximo
 * passo em um botão (Confirmar → Chegou / Não veio → Vendeu / Não fechou).
 * Feito para o celular: nada de arrastar, só tocar.
 */
export function MeuDiaPage() {
  const { perfil } = useAuth()
  const { nomeVendedor, nomeCategoria } = useCadastros()
  const gestor = ehGestor(perfil)
  const meuId = perfil?.allowed ? perfil.id : ''

  const [hoje, setHoje] = useState(() => inicioDoDia(new Date()))
  const [dia, setDia] = useState(hoje)
  const [vendedor, setVendedor] = useState('')
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false)
  const [modal, setModal] = useState<EstadoModal>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [agora, setAgora] = useState(() => new Date())
  const seletorData = useRef<HTMLInputElement>(null)
  const toque = useRef<{ x: number; y: number } | null>(null)
  const [parametros, setParametros] = useSearchParams()

  const { agendamentos, carregando, erro, recarregar } = useAgendamentos(dia, somarDias(dia, 1))

  // Relógio: atualiza "agora" (marca do horário atual e botões que dependem da hora) e vira o dia à meia-noite.
  useEffect(() => {
    const t = window.setInterval(() => {
      const d = new Date()
      setAgora(d)
      setHoje((h) => (inicioDoDia(d).getTime() === h.getTime() ? h : inicioDoDia(d)))
    }, 30_000)
    return () => window.clearInterval(t)
  }, [])

  // Link de notificação/lembrete: /?agendamento=<id> abre o detalhe.
  const idDoLink = parametros.get('agendamento')
  useEffect(() => {
    if (!idDoLink) return
    const t = window.setTimeout(() => {
      setModal({ tipo: 'detalhe', id: idDoLink })
      setParametros({}, { replace: true })
    }, 0)
    return () => window.clearTimeout(t)
  }, [idDoLink, setParametros])

  // O aviso de "feito / desfazer" some sozinho.
  useEffect(() => {
    if (!aviso) return
    const t = window.setTimeout(() => setAviso(null), aviso.erro ? 8000 : 6000)
    return () => window.clearTimeout(t)
  }, [aviso])

  // Vendedor vê só os seus; gestão vê todos ou filtra.
  const doVendedor = gestor ? vendedor : meuId
  const doDia = useMemo(
    () =>
      agendamentos
        .filter((a) => !doVendedor || a.vendedor_id === doVendedor)
        .sort((a, b) => a.inicio.localeCompare(b.inicio)),
    [agendamentos, doVendedor],
  )
  const lista = mostrarEncerrados ? doDia : doDia.filter((a) => !estaEncerrado(a))
  const encerrados = doDia.length - doDia.filter((a) => !estaEncerrado(a)).length
  const resumo = resumoDoDia(doDia)
  const ehHoje = dia.getTime() === hoje.getTime()
  const indiceAgora = ehHoje ? lista.findIndex((a) => new Date(a.inicio).getTime() > agora.getTime()) : -1

  function mudarDia(passo: number) {
    setDia((d) => somarDias(d, passo))
  }

  async function executar(a: Agendamento, acao: AcaoRapida) {
    if (acao === 'vendeu') {
      // Pede o valor da venda no detalhe (mesmo formulário de sempre).
      setModal({ tipo: 'detalhe', id: a.id, acao: 'venda' })
      return
    }
    const anterior: Coluna = colunaDe(a)
    setOcupado(a.id)
    try {
      const atualizado = await moverPara(a, DESTINO_DA_ACAO[acao])
      const nome = a.cliente_nome.trim().split(/\s+/)[0]
      setAviso({
        texto: `${nome}: ${FEITO_DA_ACAO[acao]}.`,
        desfazer: () => moverPara(atualizado, anterior),
      })
      void recarregar()
    } catch (e) {
      setAviso({ texto: mensagemDeErro(e), erro: true })
    } finally {
      setOcupado(null)
    }
  }

  async function desfazer() {
    const d = aviso?.desfazer
    if (!d) return
    setAviso(null)
    try {
      await d()
      setAviso({ texto: 'Desfeito.' })
      void recarregar()
    } catch (e) {
      setAviso({ texto: mensagemDeErro(e), erro: true })
    }
  }

  return (
    <section className="pagina md-pagina">
      <header className="pagina-cabecalho pagina-cabecalho-acoes">
        <h1>Meu dia</h1>
        <button
          type="button"
          className="botao botao-primario"
          onClick={() => {
            // Hoje: sugere o próximo horário; outro dia: 09:00.
            const inicio = new Date(dia)
            if (ehHoje) {
              inicio.setTime(agora.getTime())
              inicio.setMinutes(inicio.getMinutes() < 30 ? 30 : 60, 0, 0)
            } else inicio.setHours(9, 0, 0, 0)
            setModal({ tipo: 'novo', inicio })
          }}
        >
          <Plus size={18} aria-hidden /> Novo
        </button>
      </header>

      <div className="navegacao-datas" role="group" aria-label="Navegar entre os dias">
        <button type="button" className="seta-data" onClick={() => mudarDia(-1)} aria-label="Dia anterior">
          <ChevronLeft size={26} aria-hidden />
        </button>
        <button
          type="button"
          className="titulo-data"
          onClick={() => {
            const el = seletorData.current
            if (!el) return
            try {
              el.showPicker()
            } catch {
              el.focus()
            }
          }}
          aria-label={`${fmtDia.format(dia)}. Escolher outra data`}
        >
          <span className="primeira-maiuscula">{ehHoje ? `Hoje, ${fmtDia.format(dia)}` : fmtDia.format(dia)}</span>
          <CalendarSearch size={16} aria-hidden />
        </button>
        <input
          ref={seletorData}
          type="date"
          className="seletor-data"
          tabIndex={-1}
          aria-hidden
          value={paraInputData(dia)}
          onChange={(e) => {
            if (!e.target.value) return
            const [a, m, d] = e.target.value.split('-').map(Number)
            setDia(new Date(a, m - 1, d))
          }}
        />
        <button type="button" className="seta-data" onClick={() => mudarDia(1)} aria-label="Próximo dia">
          <ChevronRight size={26} aria-hidden />
        </button>
        <div className="navegacao-datas-extra">
          <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => setDia(hoje)} disabled={ehHoje}>
            Hoje
          </button>
          {gestor && <FiltroVendedor valor={vendedor} onChange={setVendedor} />}
        </div>
      </div>

      <Pendencias sinal={agendamentos} onAbrir={(id) => setModal({ tipo: 'detalhe', id })} />
      {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}

      {resumo.total > 0 && (
        <ul className="md-resumo" aria-label="Resumo do dia">
          <li><strong>{resumo.total}</strong> {resumo.total === 1 ? 'atendimento' : 'atendimentos'}</li>
          {resumo.aConfirmar > 0 && <li className="md-resumo-atencao"><strong>{resumo.aConfirmar}</strong> a confirmar</li>}
          {resumo.aguardando > 0 && <li><strong>{resumo.aguardando}</strong> aguardando</li>}
          {resumo.emAtendimento > 0 && <li><strong>{resumo.emAtendimento}</strong> em atendimento</li>}
          {resumo.vendas > 0 && (
            <li className="md-resumo-ok">
              <strong>{resumo.vendas}</strong> {resumo.vendas === 1 ? 'venda' : 'vendas'}
              {resumo.valorVendido > 0 && ` · ${formatarMoeda(resumo.valorVendido)}`}
            </li>
          )}
        </ul>
      )}

      <div
        className="md-lista-area"
        onTouchStart={(e) => {
          const t = e.touches[0]
          toque.current = { x: t.clientX, y: t.clientY }
        }}
        onTouchEnd={(e) => {
          const inicio = toque.current
          toque.current = null
          if (!inicio) return
          const t = e.changedTouches[0]
          const dx = t.clientX - inicio.x
          const dy = t.clientY - inicio.y
          // Arrastar o dedo para o lado troca de dia.
          if (Math.abs(dx) > 70 && Math.abs(dy) < 50) mudarDia(dx < 0 ? 1 : -1)
        }}
      >
        {carregando && agendamentos.length === 0 ? (
          <div className="carregando" role="status">
            <span className="spinner" aria-hidden /> Carregando o dia…
          </div>
        ) : lista.length === 0 ? (
          <div className="vazio md-vazio">
            <strong>Nenhum atendimento {ehHoje ? 'hoje' : 'neste dia'}</strong>
            <span className="texto-suave">Toque em Novo para agendar, ou use as setas para ver outro dia.</span>
          </div>
        ) : (
          <ol className="md-lista">
            {lista.map((a, i) => (
              <Fragment key={a.id}>
                {i === indiceAgora && (
                  <li className="md-agora" aria-label={`Agora, ${formatarHora(agora.toISOString())}`}>
                    <span>Agora · {formatarHora(agora.toISOString())}</span>
                  </li>
                )}
                <CartaoDia
                  a={a}
                  agora={agora}
                  podeMexer={podeAlterar(perfil, a)}
                  mostrarVendedor={gestor && !vendedor}
                  nomeVendedor={nomeVendedor(a.vendedor_id)}
                  nomeCategoria={a.categoria_id ? nomeCategoria(a.categoria_id) : null}
                  ocupado={ocupado === a.id}
                  onAcao={(acao) => void executar(a, acao)}
                  onAbrir={() => setModal({ tipo: 'detalhe', id: a.id })}
                />
              </Fragment>
            ))}
            {ehHoje && indiceAgora === -1 && lista.length > 0 && (
              <li className="md-agora"><span>Agora · {formatarHora(agora.toISOString())}</span></li>
            )}
          </ol>
        )}
      </div>

      {encerrados > 0 && (
        <button type="button" className="botao-link md-encerrados" onClick={() => setMostrarEncerrados((m) => !m)}>
          {mostrarEncerrados
            ? 'Esconder cancelados e reagendados'
            : `Mostrar ${encerrados} ${encerrados === 1 ? 'cancelado ou reagendado' : 'cancelados ou reagendados'}`}
        </button>
      )}

      {aviso && (
        <div className={aviso.erro ? 'md-aviso md-aviso-erro' : 'md-aviso'} role="status">
          <span>{aviso.texto}</span>
          {aviso.desfazer && (
            <button type="button" className="md-aviso-desfazer" onClick={() => void desfazer()}>
              <Undo2 size={16} aria-hidden /> Desfazer
            </button>
          )}
        </div>
      )}

      <AgendamentoModais estado={modal} onEstado={setModal} agendamentos={agendamentos} onMudou={() => void recarregar()} />
    </section>
  )
}

type PropsCartao = {
  a: Agendamento
  agora: Date
  podeMexer: boolean
  mostrarVendedor: boolean
  nomeVendedor: string
  nomeCategoria: string | null
  ocupado: boolean
  onAcao: (acao: AcaoRapida) => void
  onAbrir: () => void
}

function CartaoDia({ a, agora, podeMexer, mostrarVendedor, nomeVendedor, nomeCategoria, ocupado, onAcao, onAbrir }: PropsCartao) {
  const coluna = colunaDe(a)
  const etapa = COLUNA_POR_ID[coluna]
  const acoes = podeMexer ? acoesRapidas(a, agora) : []
  const telefone = normalizarTelefoneBR(a.cliente_telefone)
  const contato = podeMexer && (a.status === 'agendado' || a.status === 'confirmado')
  const atrasado = a.status === 'agendado' && new Date(a.inicio).getTime() < agora.getTime()
  const detalhes = [nomeCategoria, mostrarVendedor ? nomeVendedor : null].filter(Boolean).join(' · ')

  return (
    <li className={`md-cartao ${estaEncerrado(a) ? 'md-cartao-encerrado' : ''}`} style={{ ['--cor' as string]: etapa.cor }}>
      <button type="button" className="md-cartao-corpo" onClick={onAbrir} aria-label={`${a.cliente_nome}, ${formatarHora(a.inicio)}. Abrir detalhes`}>
        <span className="md-hora">
          <strong>{formatarHora(a.inicio)}</strong>
          <small>{a.duracao_min} min</small>
        </span>
        <span className="md-info">
          <strong>{a.cliente_nome}</strong>
          {detalhes && <span>{detalhes}</span>}
          {a.observacoes && <span className="md-obs">{a.observacoes}</span>}
        </span>
        <span className="md-etapa">
          {coluna === 'venda_fechada' && a.valor_venda ? `Vendeu ${formatarMoeda(a.valor_venda)}` : etapa.titulo}
        </span>
      </button>

      {atrasado && acoes.length > 0 && <p className="md-alerta">Horário já passou e ainda não foi confirmado.</p>}

      {(acoes.length > 0 || contato) && (
        <div className="md-acoes">
          {acoes.map((acao, i) => (
            <button
              key={acao}
              type="button"
              className={`md-acao md-acao-${acao} ${i === 0 ? 'md-acao-principal' : ''}`}
              disabled={ocupado}
              onClick={() => onAcao(acao)}
            >
              {ocupado && i === 0 && <span className="spinner" aria-hidden />}
              {ROTULO_DA_ACAO[acao]}
            </button>
          ))}
          {contato && (
            <span className="md-contato">
              <a
                className="md-icone md-whatsapp"
                href={linkWhatsApp(a.cliente_telefone, montarMensagem({ inicio: a.inicio, vendedor: nomeVendedor }))}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Enviar confirmação para ${a.cliente_nome} no WhatsApp`}
                title="WhatsApp"
              >
                <MessageCircle size={20} aria-hidden />
              </a>
              {telefone && (
                <a className="md-icone" href={`tel:+${telefone}`} aria-label={`Ligar para ${a.cliente_nome}`} title="Ligar">
                  <Phone size={20} aria-hidden />
                </a>
              )}
            </span>
          )}
        </div>
      )}
    </li>
  )
}
