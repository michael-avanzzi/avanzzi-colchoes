import { useMemo, useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

import { useAuth } from '../auth/AuthProvider'
import { AgendamentoModais, type EstadoModal } from '../components/agendamentos/AgendamentoModais'
import { FiltroVendedor } from '../components/agendamentos/FiltroVendedor'
import { useAgendamentos } from '../hooks/useAgendamentos'
import { useCadastros } from '../hooks/useCadastros'
import {
  formatarDia,
  formatarDiaCurto,
  formatarHora,
  inicioDaSemana,
  inicioDoDia,
  somarDias,
} from '../lib/datas'
import { jaPodeMarcarComparecimento, moverPara, podeAlterar } from '../lib/movimentos'
import { mensagemDeErro } from '../lib/supabase'
import {
  COLUNAS,
  colunaDe,
  estaEncerrado,
  type Agendamento,
  type Coluna,
} from '../types/agendamento'

type Periodo = 'dia' | 'semana'

export function KanbanPage() {
  const { perfil } = useAuth()
  const { nomeVendedor, nomeCategoria } = useCadastros()

  const [periodo, setPeriodo] = useState<Periodo>('dia')
  const [hoje] = useState(() => inicioDoDia(new Date()).getTime())
  const [referencia, setReferencia] = useState(() => new Date(hoje))
  const [vendedor, setVendedor] = useState('')
  const [modal, setModal] = useState<EstadoModal>(null)
  const [arrastando, setArrastando] = useState<Agendamento | null>(null)
  const [movendo, setMovendo] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const inicio = periodo === 'dia' ? referencia : inicioDaSemana(referencia)
  const fim = somarDias(inicio, periodo === 'dia' ? 1 : 7)
  const { agendamentos, carregando, erro, recarregar } = useAgendamentos(inicio, fim)

  const porColuna = useMemo(() => {
    const mapa = Object.fromEntries(COLUNAS.map((c) => [c.id, [] as Agendamento[]])) as Record<Coluna, Agendamento[]>
    for (const a of agendamentos) {
      if (vendedor && a.vendedor_id !== vendedor) continue
      mapa[colunaDe(a)].push(a)
    }
    return mapa
  }, [agendamentos, vendedor])

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // No toque, segurar 250 ms para arrastar; deslizar rápido rola a tela.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  function navegar(passo: number) {
    setReferencia((r) => somarDias(r, passo * (periodo === 'dia' ? 1 : 7)))
  }

  function aoComecar(e: DragStartEvent) {
    setAviso(null)
    setArrastando(agendamentos.find((a) => a.id === e.active.id) ?? null)
  }

  async function aoSoltar(e: DragEndEvent) {
    setArrastando(null)
    const a = agendamentos.find((x) => x.id === e.active.id)
    const destino = e.over?.id as Coluna | undefined
    if (!a || !destino || destino === colunaDe(a)) return

    if (destino === 'reagendado') return setModal({ tipo: 'detalhe', id: a.id, acao: 'reagendar' })
    if (destino === 'cancelado') return setModal({ tipo: 'detalhe', id: a.id, acao: 'cancelar' })
    if (destino === 'venda_fechada') return setModal({ tipo: 'detalhe', id: a.id, acao: 'venda' })

    const exigeComparecimento = destino !== 'agendado' && destino !== 'confirmado'
    if (exigeComparecimento && !jaPodeMarcarComparecimento(a)) {
      return setAviso('Comparecimento e resultado só podem ser registrados a partir do dia do agendamento.')
    }

    setMovendo(a.id)
    try {
      await moverPara(a, destino)
    } catch (error) {
      setAviso(mensagemDeErro(error))
    } finally {
      setMovendo(null)
      void recarregar()
    }
  }

  const titulo =
    periodo === 'dia'
      ? formatarDia(referencia)
      : `${formatarDiaCurto(inicio)} a ${formatarDiaCurto(somarDias(fim, -1))}`
  const ehHoje = hoje === referencia.getTime()

  return (
    <section className="pagina pagina-larga">
      <header className="pagina-cabecalho pagina-cabecalho-acoes">
        <div>
          <h1>Kanban</h1>
          <p className="texto-suave primeira-maiuscula">{titulo}</p>
        </div>
        <button type="button" className="botao botao-primario" onClick={() => setModal({ tipo: 'novo' })}>
          <Plus size={18} aria-hidden /> Novo agendamento
        </button>
      </header>

      <div className="barra-filtros">
        <div className="navegacao-periodo">
          <button type="button" className="botao-icone escuro" onClick={() => navegar(-1)} aria-label="Período anterior">
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            className="botao botao-secundario botao-pequeno"
            disabled={ehHoje && periodo === 'dia'}
            onClick={() => setReferencia(new Date(hoje))}
          >
            Hoje
          </button>
          <button type="button" className="botao-icone escuro" onClick={() => navegar(1)} aria-label="Próximo período">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="segmentado" role="group" aria-label="Período">
          {(['dia', 'semana'] as Periodo[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={periodo === p}
              className={periodo === p ? 'ativo' : ''}
              onClick={() => setPeriodo(p)}
            >
              {p === 'dia' ? 'Dia' : 'Semana'}
            </button>
          ))}
        </div>
        <FiltroVendedor valor={vendedor} onChange={setVendedor} />
        {carregando && <span className="spinner spinner-suave" role="status" aria-label="Carregando" />}
      </div>

      {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}
      {aviso && (
        <p className="alerta alerta-aviso" role="alert">
          {aviso}{' '}
          <button type="button" className="botao-link" onClick={() => setAviso(null)}>Ok</button>
        </p>
      )}

      <DndContext sensors={sensores} onDragStart={aoComecar} onDragEnd={(e) => void aoSoltar(e)} onDragCancel={() => setArrastando(null)}>
        <div className="kanban">
          {COLUNAS.map((col) => (
            <ColunaKanban
              key={col.id}
              id={col.id}
              titulo={col.titulo}
              cor={col.cor}
              aceita={arrastando !== null && col.id !== colunaDe(arrastando)}
            >
              {porColuna[col.id].length === 0 ? (
                <p className="coluna-vazia">Nenhum</p>
              ) : (
                porColuna[col.id].map((a) => (
                  <CartaoArrastavel
                    key={a.id}
                    agendamento={a}
                    bloqueado={!podeAlterar(perfil, a) || estaEncerrado(a) || movendo === a.id}
                    mostrarDia={periodo === 'semana'}
                    vendedor={nomeVendedor(a.vendedor_id)}
                    categoria={nomeCategoria(a.categoria_id)}
                    cor={col.cor}
                    onAbrir={() => setModal({ tipo: 'detalhe', id: a.id })}
                  />
                ))
              )}
            </ColunaKanban>
          ))}
        </div>

        <DragOverlay>
          {arrastando && (
            <Cartao
              agendamento={arrastando}
              mostrarDia={periodo === 'semana'}
              vendedor={nomeVendedor(arrastando.vendedor_id)}
              categoria={nomeCategoria(arrastando.categoria_id)}
              cor={COLUNAS.find((c) => c.id === colunaDe(arrastando))!.cor}
              flutuando
            />
          )}
        </DragOverlay>
      </DndContext>

      <AgendamentoModais estado={modal} onEstado={setModal} agendamentos={agendamentos} onMudou={() => void recarregar()} />
    </section>
  )
}

function ColunaKanban({
  id,
  titulo,
  cor,
  aceita,
  children,
}: {
  id: Coluna
  titulo: string
  cor: string
  aceita: boolean
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !aceita })
  const qtd = Array.isArray(children) ? children.length : 0
  return (
    <section
      ref={setNodeRef}
      className={['coluna', aceita ? 'coluna-aceita' : '', isOver && aceita ? 'coluna-sobre' : ''].join(' ')}
      style={{ ['--cor' as string]: cor }}
      aria-label={titulo}
    >
      <header className="coluna-cabecalho">
        <span className="coluna-ponto" aria-hidden />
        <h2>{titulo}</h2>
        <span className="coluna-qtd">{qtd}</span>
      </header>
      <div className="coluna-cartoes">{children}</div>
    </section>
  )
}

type CartaoProps = {
  agendamento: Agendamento
  mostrarDia: boolean
  vendedor: string
  categoria: string | null
  cor: string
  flutuando?: boolean
}

function Cartao({ agendamento: a, mostrarDia, vendedor, categoria, cor, flutuando }: CartaoProps) {
  return (
    <div className={flutuando ? 'cartao cartao-flutuando' : 'cartao'} style={{ ['--cor' as string]: cor }}>
      <div className="cartao-topo">
        <span className="cartao-hora">
          {mostrarDia && `${formatarDiaCurto(new Date(a.inicio))} · `}
          {formatarHora(a.inicio)}
        </span>
        {categoria && <span className="cartao-categoria">{categoria}</span>}
      </div>
      <strong className="cartao-cliente">{a.cliente_nome}</strong>
      <span className="cartao-vendedor">{vendedor}</span>
    </div>
  )
}

function CartaoArrastavel({
  onAbrir,
  bloqueado,
  ...props
}: CartaoProps & { onAbrir: () => void; bloqueado: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.agendamento.id,
    disabled: bloqueado,
  })
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={['cartao-botao', isDragging ? 'arrastando' : '', bloqueado ? 'bloqueado' : ''].join(' ')}
      onClick={onAbrir}
      aria-label={`${props.agendamento.cliente_nome}, ${formatarHora(props.agendamento.inicio)}`}
      {...listeners}
      {...attributes}
    >
      <Cartao {...props} />
    </button>
  )
}
