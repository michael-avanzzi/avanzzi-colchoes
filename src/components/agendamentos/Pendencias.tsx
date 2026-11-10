import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { useAuth } from '../../auth/AuthProvider'
import { useCadastros } from '../../hooks/useCadastros'
import { formatarDataHora, inicioDoDia } from '../../lib/datas'
import { mensagemDeErro } from '../../lib/supabase'
import { listarPendencias } from '../../services/agendamentos.service'
import { COLUNA_POR_ID, colunaDe, type Agendamento } from '../../types/agendamento'
import { Modal } from '../ui/Modal'

type Props = {
  /** Muda sempre que a agenda é recarregada (tempo real), para recontar. */
  sinal: unknown
  onAbrir: (id: string) => void
}

/**
 * Aviso de atendimentos de dias anteriores sem desfecho (comparecimento ou
 * resultado não registrados). O vendedor vê só os seus; a gerência vê todos.
 */
export function Pendencias({ sinal, onAbrir }: Props) {
  const { perfil } = useAuth()
  const { nomeVendedor } = useCadastros()
  const [lista, setLista] = useState<Agendamento[]>([])
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const meuId = perfil?.allowed && perfil.papel === 'vendedor' ? perfil.id : null

  useEffect(() => {
    let ativo = true
    listarPendencias(inicioDoDia(new Date()))
      .then((itens) => {
        if (!ativo) return
        setLista(meuId ? itens.filter((a) => a.vendedor_id === meuId) : itens)
        setErro(null)
      })
      .catch((error) => ativo && setErro(mensagemDeErro(error)))
    return () => {
      ativo = false
    }
  }, [sinal, meuId])

  if (erro) return null
  if (lista.length === 0) return null

  return (
    <>
      <div className="alerta alerta-aviso pendencias" role="status">
        <AlertTriangle size={18} aria-hidden />
        <span>
          <strong>{lista.length}</strong> atendimento(s) de dias anteriores sem comparecimento ou resultado
          registrado.
        </span>
        <button type="button" className="botao-link" onClick={() => setAberto(true)}>
          Resolver
        </button>
      </div>

      <Modal titulo="Pendências de conclusão" aberto={aberto} onFechar={() => setAberto(false)}>
        {aberto && (
          <div className="form">
            <p className="texto-suave">
              Registre se o cliente compareceu e o resultado. Enquanto isso, esses atendimentos ficam fora dos
              indicadores.
            </p>
            <ul className="lista-pendencias">
              {lista.map((a) => {
                const col = COLUNA_POR_ID[colunaDe(a)]
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="item-pendencia"
                      onClick={() => {
                        setAberto(false)
                        onAbrir(a.id)
                      }}
                    >
                      <span className="item-pendencia-data">{formatarDataHora(a.inicio)}</span>
                      <strong>{a.cliente_nome}</strong>
                      <span className="texto-suave">{nomeVendedor(a.vendedor_id)}</span>
                      <span className="etiqueta-coluna" style={{ ['--cor' as string]: col.cor }}>
                        {col.titulo}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </Modal>
    </>
  )
}
