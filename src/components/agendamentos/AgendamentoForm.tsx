import { useState, type FormEvent } from 'react'

import { useAuth } from '../../auth/AuthProvider'
import { useCadastros } from '../../hooks/useCadastros'
import { combinarDataHora, paraInputData, paraInputHora, proximoHorario } from '../../lib/datas'
import { ehGestor } from '../../lib/movimentos'
import { mensagemDeErro } from '../../lib/supabase'
import { criarAgendamento, editarAgendamento } from '../../services/agendamentos.service'
import type { Agendamento } from '../../types/agendamento'

const DURACOES = [30, 45, 60, 90, 120]

type Props = {
  /** Edição quando informado; criação quando ausente. */
  agendamento?: Agendamento
  /** Data/hora sugerida para um novo agendamento. */
  inicioSugerido?: Date
  onCancelar: () => void
  onSalvo: (a: Agendamento) => void
}

export function AgendamentoForm({ agendamento, inicioSugerido, onCancelar, onSalvo }: Props) {
  const { perfil } = useAuth()
  const { categorias, vendedores } = useCadastros()
  const gestor = ehGestor(perfil)
  const editando = Boolean(agendamento)

  const base = agendamento ? new Date(agendamento.inicio) : (inicioSugerido ?? proximoHorario())

  const [cliente, setCliente] = useState(agendamento?.cliente_nome ?? '')
  const [telefone, setTelefone] = useState(agendamento?.cliente_telefone ?? '')
  const [data, setData] = useState(paraInputData(base))
  const [hora, setHora] = useState(paraInputHora(base))
  const [duracao, setDuracao] = useState(agendamento?.duracao_min ?? 60)
  const [categoria, setCategoria] = useState<string>(agendamento?.categoria_id?.toString() ?? '')
  const [observacoes, setObservacoes] = useState(agendamento?.observacoes ?? '')
  const [vendedor, setVendedor] = useState(perfil?.allowed ? perfil.id : '')
  const [motivo, setMotivo] = useState('')

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(event: FormEvent) {
    event.preventDefault()
    setErro(null)

    if (cliente.trim().length < 2) return setErro('Informe o nome do cliente.')
    if (!editando && (!data || !hora)) return setErro('Informe data e horário.')

    const dados = {
      cliente_nome: cliente.trim(),
      cliente_telefone: telefone.trim(),
      duracao_min: duracao,
      categoria_id: categoria ? Number(categoria) : null,
      observacoes: observacoes.trim(),
    }

    setSalvando(true)
    try {
      const salvo = agendamento
        ? await editarAgendamento(agendamento, dados, motivo.trim() || undefined)
        : await criarAgendamento({
            ...dados,
            inicio: combinarDataHora(data, hora),
            vendedor_id: gestor ? vendedor : null,
          })
      onSalvo(salvo)
    } catch (error) {
      setErro(mensagemDeErro(error))
    } finally {
      setSalvando(false)
    }
  }

  const vendedoresAtivos = vendedores.filter((v) => v.ativo)

  return (
    <form className="form" onSubmit={salvar} noValidate>
      <label className="campo">
        <span>Cliente *</span>
        <input value={cliente} onChange={(e) => setCliente(e.target.value)} autoFocus maxLength={120} />
      </label>

      <label className="campo">
        <span>Telefone do cliente</span>
        <input
          type="tel"
          inputMode="tel"
          placeholder="(11) 99999-9999"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
        />
      </label>

      <div className="campos-linha">
        <label className="campo">
          <span>Data *</span>
          <input type="date" value={data} disabled={editando} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="campo">
          <span>Horário *</span>
          <input type="time" value={hora} step={300} disabled={editando} onChange={(e) => setHora(e.target.value)} />
        </label>
        <label className="campo">
          <span>Duração</span>
          <select value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}>
            {[...new Set([...DURACOES, duracao])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>{d} min</option>
            ))}
          </select>
        </label>
      </div>
      {editando && <p className="texto-suave">Para mudar data ou horário, use “Reagendar”.</p>}

      <label className="campo">
        <span>Produto de interesse</span>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Não informado</option>
          {categorias.filter((c) => c.ativo || c.id === agendamento?.categoria_id).map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </label>

      {!editando && gestor && (
        <label className="campo">
          <span>Vendedor responsável</span>
          <select value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
            {vendedoresAtivos.map((v) => (
              <option key={v.id} value={v.id}>{v.nome}</option>
            ))}
          </select>
        </label>
      )}
      {!editando && !gestor && perfil?.allowed && (
        <p className="texto-suave">Vendedor responsável: <strong>{perfil.nome}</strong></p>
      )}

      <label className="campo">
        <span>Observações</span>
        <textarea rows={3} maxLength={2000} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
      </label>

      {editando && (
        <label className="campo">
          <span>Motivo da alteração (opcional)</span>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </label>
      )}

      {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}

      <div className="modal-acoes">
        <button type="button" className="botao botao-secundario" onClick={onCancelar}>
          Cancelar
        </button>
        <button type="submit" className="botao botao-primario" disabled={salvando}>
          {salvando && <span className="spinner" aria-hidden />}
          {editando ? 'Salvar alterações' : 'Agendar'}
        </button>
      </div>
    </form>
  )
}
