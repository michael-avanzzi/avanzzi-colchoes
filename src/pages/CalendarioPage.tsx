import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import type { DatesSetArg, EventInput } from '@fullcalendar/core'
import { CalendarSearch, ChevronLeft, ChevronRight, ImageDown, Plus } from 'lucide-react'

import { AgendamentoModais, type EstadoModal } from '../components/agendamentos/AgendamentoModais'
import { FiltroVendedor } from '../components/agendamentos/FiltroVendedor'
import { ImagemHorarios } from '../components/agendamentos/ImagemHorarios'
import { Pendencias } from '../components/agendamentos/Pendencias'
import { useAuth } from '../auth/AuthProvider'
import { useAgendamentos } from '../hooks/useAgendamentos'
import { useCadastros } from '../hooks/useCadastros'
import { COLUNAS, COLUNA_POR_ID, colunaDe, type Coluna } from '../types/agendamento'

/** "" = todas, exceto cancelados e reagendados (que poluem a agenda). */
type FiltroColuna = '' | 'todas' | Coluna

const ehCelular = () => window.matchMedia('(max-width: 860px)').matches

type Visao = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth'
const VISOES: [Visao, string][] = [
  ['timeGridDay', 'Dia'],
  ['timeGridWeek', 'Semana'],
  ['dayGridMonth', 'Mês'],
]
const PASSO: Record<Visao, string> = { timeGridDay: 'Dia', timeGridWeek: 'Semana', dayGridMonth: 'Mês' }
const fmtDiaLongo = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

function paraInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CalendarioPage() {
  const { nomeVendedor } = useCadastros()
  const { perfil } = useAuth()
  const [periodo, setPeriodo] = useState<{ inicio: Date; fim: Date; visao: string } | null>(null)
  const [imagemAberta, setImagemAberta] = useState(false)
  const [vendedor, setVendedor] = useState('')
  const [filtroColuna, setFiltroColuna] = useState<FiltroColuna>('')
  const [modal, setModal] = useState<EstadoModal>(null)
  const calendario = useRef<FullCalendar>(null)
  const seletorData = useRef<HTMLInputElement>(null)
  const toque = useRef<{ x: number; y: number } | null>(null)
  const [titulo, setTitulo] = useState('')
  const [ehHoje, setEhHoje] = useState(true)
  const [parametros, setParametros] = useSearchParams()

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

  const { agendamentos, carregando, erro, recarregar } = useAgendamentos(
    periodo?.inicio ?? null,
    periodo?.fim ?? null,
  )

  const eventos = useMemo<EventInput[]>(
    () =>
      agendamentos
        .filter((a) => !vendedor || a.vendedor_id === vendedor)
        .filter((a) => {
          const c = colunaDe(a)
          if (filtroColuna === 'todas') return true
          if (filtroColuna === '') return c !== 'cancelado' && c !== 'reagendado'
          return c === filtroColuna
        })
        .map((a) => {
          const cor = COLUNA_POR_ID[colunaDe(a)].cor
          const inicio = new Date(a.inicio)
          return {
            id: a.id,
            title: `${a.cliente_nome} · ${nomeVendedor(a.vendedor_id)}`,
            start: inicio,
            end: new Date(inicio.getTime() + a.duracao_min * 60000),
            backgroundColor: cor,
            borderColor: cor,
            textColor: '#ffffff',
          }
        }),
    [agendamentos, vendedor, filtroColuna, nomeVendedor],
  )

  const api = () => calendario.current?.getApi()
  const visao = (periodo?.visao ?? (ehCelular() ? 'timeGridDay' : 'timeGridWeek')) as Visao

  function aoMudarDatas(arg: DatesSetArg) {
    const hoje = new Date()
    setEhHoje(arg.view.currentStart <= hoje && hoje < arg.view.currentEnd)
    setTitulo(arg.view.type === 'timeGridDay' ? fmtDiaLongo.format(arg.view.currentStart) : arg.view.title)
    setPeriodo((p) =>
      p &&
      p.inicio.getTime() === arg.start.getTime() &&
      p.fim.getTime() === arg.end.getTime() &&
      p.visao === arg.view.type
        ? p
        : { inicio: arg.start, fim: arg.end, visao: arg.view.type },
    )
  }

  // Imagem dos horários: só na visão Dia. Sem filtro, usa a agenda de quem está logado.
  const vendedorDaImagem = vendedor || (perfil?.allowed ? perfil.id : '')
  const podeGerarImagem = periodo?.visao === 'timeGridDay' && Boolean(vendedorDaImagem)

  return (
    <section className="pagina pagina-larga">
      <header className="pagina-cabecalho pagina-cabecalho-acoes">
        <h1>Agenda</h1>
        <button type="button" className="botao botao-primario" onClick={() => setModal({ tipo: 'novo' })}>
          <Plus size={18} aria-hidden /> Novo agendamento
        </button>
      </header>

      <div className="navegacao-datas" role="group" aria-label="Navegar entre datas">
        <button type="button" className="seta-data" onClick={() => api()?.prev()} aria-label={`${PASSO[visao]} anterior`}>
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
          aria-label={`${titulo}. Escolher outra data`}
        >
          <span className="primeira-maiuscula">{titulo}</span>
          <CalendarSearch size={16} aria-hidden />
        </button>
        <input
          ref={seletorData}
          type="date"
          className="seletor-data"
          tabIndex={-1}
          aria-hidden
          value={periodo ? paraInput(periodo.inicio) : ''}
          onChange={(e) => {
            if (!e.target.value) return
            const [a, m, d] = e.target.value.split('-').map(Number)
            api()?.gotoDate(new Date(a, m - 1, d))
          }}
        />
        <button type="button" className="seta-data" onClick={() => api()?.next()} aria-label={`Próximo ${PASSO[visao].toLowerCase()}`}>
          <ChevronRight size={26} aria-hidden />
        </button>
        <div className="navegacao-datas-extra">
          <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => api()?.today()} disabled={ehHoje}>
            Hoje
          </button>
          <div className="segmentado" role="group" aria-label="Visualização">
            {VISOES.map(([v, rotulo]) => (
              <button key={v} type="button" aria-pressed={visao === v} className={visao === v ? 'ativo' : ''} onClick={() => api()?.changeView(v)}>
                {rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="barra-filtros">
        <FiltroVendedor valor={vendedor} onChange={setVendedor} />
        <label className="filtro">
          <select
            value={filtroColuna}
            onChange={(e) => setFiltroColuna(e.target.value as FiltroColuna)}
            aria-label="Filtrar por status"
          >
            <option value="">Em aberto e concluídos</option>
            <option value="todas">Todos (inclui cancelados)</option>
            {COLUNAS.map((c) => (
              <option key={c.id} value={c.id}>{c.titulo}</option>
            ))}
          </select>
        </label>
        {podeGerarImagem && (
          <button
            type="button"
            className="botao botao-secundario botao-pequeno"
            onClick={() => setImagemAberta(true)}
            disabled={carregando}
          >
            <ImageDown size={16} aria-hidden /> Imagem dos horários
          </button>
        )}
        {carregando && periodo && <span className="spinner spinner-suave" role="status" aria-label="Carregando" />}
      </div>

      <Pendencias sinal={agendamentos} onAbrir={(id) => setModal({ tipo: 'detalhe', id })} />
      {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}

      <div
        className="calendario"
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
          // Arrastar o dedo para o lado troca de dia (ou semana/mês).
          if (Math.abs(dx) > 70 && Math.abs(dy) < 50) {
            if (dx < 0) api()?.next()
            else api()?.prev()
          }
        }}
      >
        <FullCalendar
          ref={calendario}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={ptBrLocale}
          initialView={ehCelular() ? 'timeGridDay' : 'timeGridWeek'}
          headerToolbar={false}
          height="auto"
          allDaySlot={false}
          slotMinTime="07:00:00"
          slotMaxTime="22:00:00"
          scrollTime="08:00:00"
          slotDuration="00:30:00"
          nowIndicator
          dayMaxEvents={4}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          events={eventos}
          datesSet={aoMudarDatas}
          eventClick={(info) => {
            info.jsEvent.preventDefault()
            setModal({ tipo: 'detalhe', id: info.event.id })
          }}
          dateClick={(info) => {
            // No mês o clique vem sem horário: sugere 09:00.
            const inicio = new Date(info.date)
            if (info.allDay) inicio.setHours(9, 0, 0, 0)
            if (inicio.getTime() < Date.now()) return
            setModal({ tipo: 'novo', inicio })
          }}
        />
      </div>

      {periodo && vendedorDaImagem && (
        <ImagemHorarios
          aberto={imagemAberta && podeGerarImagem}
          onFechar={() => setImagemAberta(false)}
          dia={periodo.inicio}
          vendedorId={vendedorDaImagem}
          vendedorNome={nomeVendedor(vendedorDaImagem)}
          agendamentos={agendamentos}
        />
      )}

      <AgendamentoModais estado={modal} onEstado={setModal} agendamentos={agendamentos} onMudou={() => void recarregar()} />
    </section>
  )
}
