import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellRing, Check } from 'lucide-react'

import { useLembretes } from '../../hooks/useLembretes'
import { formatarHora } from '../../lib/datas'
import { mensagemDeErro } from '../../lib/supabase'
import { atualizarStatus } from '../../services/agendamentos.service'
import type { Agendamento } from '../../types/agendamento'
import { Modal } from '../ui/Modal'
import { AtivarNotificacoes } from './AtivarNotificacoes'

const CHAVE_VISTOS = 'avanzzi.lembretes-vistos'

function lerVistos(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_VISTOS) ?? '[]') as string[]
  } catch {
    return []
  }
}

function salvarVistos(ids: string[]) {
  try {
    localStorage.setItem(CHAVE_VISTOS, JSON.stringify(ids.slice(-200)))
  } catch {
    // sem armazenamento local: o aviso pode reaparecer, sem prejuízo
  }
}

/** Sino com os agendamentos a confirmar na próxima hora + aviso na tela quando surge um novo. */
export function Lembretes({ claro = false }: { claro?: boolean }) {
  const navigate = useNavigate()
  const { lembretes, atualizar } = useLembretes()
  const [aberto, setAberto] = useState(false)
  const [aviso, setAviso] = useState<Agendamento | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const anunciados = useRef(new Set(lerVistos()))

  // Novo lembrete com o app aberto: aviso na tela (uma vez por agendamento).
  useEffect(() => {
    const novo = lembretes.find((l) => !anunciados.current.has(l.id))
    if (!novo) return
    for (const l of lembretes) anunciados.current.add(l.id)
    salvarVistos([...anunciados.current])
    const t = window.setTimeout(() => setAviso(novo), 0)
    return () => window.clearTimeout(t)
  }, [lembretes])

  function abrir(a: Agendamento) {
    setAberto(false)
    setAviso(null)
    navigate(`/?agendamento=${a.id}`)
  }

  async function confirmar(a: Agendamento) {
    setErro(null)
    setOcupado(a.id)
    try {
      await atualizarStatus(a, 'confirmado')
      if (aviso?.id === a.id) setAviso(null)
      await atualizar()
    } catch (error) {
      setErro(mensagemDeErro(error))
    } finally {
      setOcupado(null)
    }
  }

  const qtd = lembretes.length

  return (
    <>
      <button
        type="button"
        className={claro ? 'botao-icone sino' : 'botao-icone escuro sino'}
        onClick={() => setAberto(true)}
        aria-label={qtd ? `${qtd} agendamento(s) para confirmar` : 'Lembretes'}
        title="Lembretes"
      >
        {qtd ? <BellRing size={20} /> : <Bell size={20} />}
        {qtd > 0 && <span className="sino-contador">{qtd}</span>}
      </button>

      {aviso && (
        <div className="aviso-lembrete" role="status">
          <BellRing size={18} aria-hidden />
          <span>
            Confirme com <strong>{aviso.cliente_nome}</strong> — atendimento às {formatarHora(aviso.inicio)}.
          </span>
          <div className="aviso-lembrete-acoes">
            <button type="button" className="botao botao-primario botao-pequeno" onClick={() => void confirmar(aviso)} disabled={ocupado === aviso.id}>
              <Check size={16} aria-hidden /> Confirmado
            </button>
            <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => abrir(aviso)}>
              Abrir
            </button>
            <button type="button" className="botao-link" onClick={() => setAviso(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      <Modal titulo="Lembretes" aberto={aberto} onFechar={() => setAberto(false)}>
        {aberto && (
          <div className="form">
            <p className="texto-suave">
              Seus agendamentos que começam na próxima hora e ainda não foram confirmados com o cliente.
            </p>
            {qtd === 0 ? (
              <p className="vazio">Nada para confirmar agora.</p>
            ) : (
              <ul className="lista-pendencias">
                {lembretes.map((a) => (
                  <li key={a.id} className="item-lembrete">
                    <button type="button" className="item-pendencia" onClick={() => abrir(a)}>
                      <span className="item-pendencia-data">Hoje às {formatarHora(a.inicio)}</span>
                      <strong>{a.cliente_nome}</strong>
                      {a.cliente_telefone && <span className="texto-suave">{a.cliente_telefone}</span>}
                    </button>
                    <button
                      type="button"
                      className="botao botao-primario botao-pequeno"
                      onClick={() => void confirmar(a)}
                      disabled={ocupado === a.id}
                    >
                      <Check size={16} aria-hidden /> Confirmado
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}
            <AtivarNotificacoes />
          </div>
        )}
      </Modal>
    </>
  )
}
