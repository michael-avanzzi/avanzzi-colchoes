import { useState } from 'react'

import { Modal } from '../ui/Modal'
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
  // Último registro recebido do banco: cobre o caso de o agendamento sair do período exibido.
  const [ultimo, setUltimo] = useState<Agendamento | null>(null)

  const detalhe =
    estado?.tipo === 'detalhe'
      ? (agendamentos.find((a) => a.id === estado.id) ?? (ultimo?.id === estado.id ? ultimo : null))
      : null

  function aoAlterar(a: Agendamento) {
    setUltimo(a)
    onMudou()
    // Reagendar devolve o NOVO agendamento: o detalhe passa a mostrar ele.
    onEstado({ tipo: 'detalhe', id: a.id })
  }

  return (
    <>
      <Modal titulo="Novo agendamento" aberto={estado?.tipo === 'novo'} onFechar={() => onEstado(null)}>
        {estado?.tipo === 'novo' && (
          <AgendamentoForm
            inicioSugerido={estado.inicio}
            onCancelar={() => onEstado(null)}
            onSalvo={(a) => {
              setUltimo(a)
              onMudou()
              onEstado(null)
            }}
          />
        )}
      </Modal>

      <Modal
        titulo={detalhe?.cliente_nome ?? 'Agendamento'}
        aberto={estado?.tipo === 'detalhe'}
        onFechar={() => onEstado(null)}
      >
        {estado?.tipo === 'detalhe' &&
          (detalhe ? (
            <AgendamentoDetalhe
              key={`${detalhe.id}-${estado.acao ?? ''}`}
              agendamento={detalhe}
              acaoInicial={estado.acao}
              onAlterado={aoAlterar}
            />
          ) : (
            <div className="carregando" role="status">
              <span className="spinner" aria-hidden /> Carregando…
            </div>
          ))}
      </Modal>
    </>
  )
}
