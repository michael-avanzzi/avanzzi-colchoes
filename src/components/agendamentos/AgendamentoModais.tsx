import { useEffect, useState } from 'react'

import { Modal } from '../ui/Modal'
import { mensagemDeErro } from '../../lib/supabase'
import { buscarAgendamento } from '../../services/agendamentos.service'
import type { Agendamento } from '../../types/agendamento'
import { AgendamentoDetalhe, type AcaoDetalhe } from './AgendamentoDetalhe'
import { AgendamentoForm } from './AgendamentoForm'

export type EstadoModal =
  | { tipo: 'novo'; inicio?: Date }
  | { tipo: 'detalhe'; id: string; acao?: AcaoDetalhe }
  | null

type Props = {
  estado: EstadoModal
  onEstado: (e: EstadoModal) => void
  /** Lista da tela (atualizada em tempo real), para o detalhe refletir mudanças de outros usuários. */
  agendamentos: Agendamento[]
  onMudou: () => void
}

export function AgendamentoModais({ estado, onEstado, agendamentos, onMudou }: Props) {
  // Último registro recebido do banco: cobre agendamentos fora do período exibido
  // (pendências antigas, cadeia de reagendamento).
  const [ultimo, setUltimo] = useState<Agendamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const idDetalhe = estado?.tipo === 'detalhe' ? estado.id : null
  const daLista = idDetalhe ? agendamentos.find((a) => a.id === idDetalhe) : undefined
  const detalhe = daLista ?? (ultimo?.id === idDetalhe ? ultimo : null)
  const precisaBuscar = Boolean(idDetalhe) && !detalhe

  useEffect(() => {
    if (!precisaBuscar || !idDetalhe) return
    let ativo = true
    buscarAgendamento(idDetalhe)
      .then((a) => {
        if (!ativo) return
        if (a) setUltimo(a)
        else setErro('Agendamento não encontrado.')
      })
      .catch((error) => ativo && setErro(mensagemDeErro(error)))
    return () => {
      ativo = false
    }
  }, [precisaBuscar, idDetalhe])

  function abrir(id: string) {
    setErro(null)
    onEstado({ tipo: 'detalhe', id })
  }

  function aoAlterar(a: Agendamento) {
    setUltimo(a)
    onMudou()
    // Reagendar devolve o NOVO agendamento: o detalhe passa a mostrar ele.
    abrir(a.id)
  }

  function fechar() {
    setErro(null)
    onEstado(null)
  }

  return (
    <>
      <Modal titulo="Novo agendamento" aberto={estado?.tipo === 'novo'} onFechar={fechar}>
        {estado?.tipo === 'novo' && (
          <AgendamentoForm
            inicioSugerido={estado.inicio}
            onCancelar={fechar}
            onSalvo={(a) => {
              setUltimo(a)
              onMudou()
              onEstado(null)
            }}
          />
        )}
      </Modal>

      <Modal titulo={detalhe?.cliente_nome ?? 'Agendamento'} aberto={estado?.tipo === 'detalhe'} onFechar={fechar}>
        {estado?.tipo === 'detalhe' &&
          (detalhe ? (
            <AgendamentoDetalhe
              key={`${detalhe.id}-${estado.acao ?? ''}`}
              agendamento={detalhe}
              acaoInicial={estado.acao}
              onAlterado={aoAlterar}
              onAbrir={abrir}
            />
          ) : erro ? (
            <p className="alerta alerta-erro" role="alert">{erro}</p>
          ) : (
            <div className="carregando" role="status">
              <span className="spinner" aria-hidden /> Carregando…
            </div>
          ))}
      </Modal>
    </>
  )
}
