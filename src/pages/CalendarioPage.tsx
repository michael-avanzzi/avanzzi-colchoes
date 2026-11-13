import { useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import type { DatesSetArg, EventInput } from '@fullcalendar/core'
import { ImageDown, Plus } from 'lucide-react'

import { AgendamentoModais, type EstadoModal } from '../components/agendamentos/AgendamentoModais'
import { FiltroVendedor } from '../components/agendamentos/FiltroVendedor'
import { ImagemHorarios } from '../components/agendamentos/ImagemHorarios'
import { useAuth } from '../auth/AuthProvider'
import { useAgendamentos } from '../hooks/useAgendamentos'
import { useCadastros } from '../hooks/useCadastros'
import { COLUNAS, COLUNA_POR_ID, colunaDe, type Coluna } from '../types/agendamento'

/** "" = todas, exceto cancelados e reagendados (que poluem a agenda). */
type FiltroColuna = '' | 'todas' | Coluna

const ehCelular = () => window.matchMedia('(max-width: 860px)').matches

export function CalendarioPage() {
  const { nomeVendedor } = useCadastros()
  const { perfil } = useAuth()
  const [periodo, setPeriodo] = useState<{ inicio: Date; fim: Date; visao: string } | null>(null)
  const [imagemAberta, setImagemAberta] = useState(false)
  const [vendedor, setVendedor] = useState('')
  const [filtroColuna, setFiltroColuna] = useState<FiltroColuna>('')
  const [modal, setModal] = useState<EstadoModal>(null)

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

  function aoMudarDatas(arg: DatesSetArg) {
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
        <h1>Calendário</h1>
        <button type="button" className="botao botao-primario" onClick={() => setModal({ tipo: 'novo' })}>
          <Plus size={18} aria-hidden /> Novo agendamento
        </button>
      </header>

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

      {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}

      <div className="calendario">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          locale={ptBrLocale}
          initialView={ehCelular() ? 'timeGridDay' : 'timeGridWeek'}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth' }}
          buttonText={{ today: 'Hoje', day: 'Dia', week: 'Semana', month: 'Mês' }}
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
