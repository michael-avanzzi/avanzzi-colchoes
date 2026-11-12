import { useState, type FormEvent } from 'react'
import {
  CalendarClock,
  CalendarX2,
  Clock,
  Package,
  Pencil,
  Phone,
  StickyNote,
  UserRound,
  UserRoundCog,
} from 'lucide-react'

import { useAuth } from '../../auth/AuthProvider'
import { useCadastros } from '../../hooks/useCadastros'
import {
  combinarDataHora,
  formatarCompleto,
  formatarDataHora,
  formatarHora,
  formatarMoeda,
  paraInputData,
  paraInputHora,
} from '../../lib/datas'
import {
  COLUNAS_DIRETAS,
  ehGestor,
  jaPodeMarcarComparecimento,
  moverPara,
  podeAlterar,
} from '../../lib/movimentos'
import { mensagemDeErro } from '../../lib/supabase'
import { cancelar, reagendar, transferirVendedor } from '../../services/agendamentos.service'
import {
  COLUNA_POR_ID,
  colunaDe,
  estaEncerrado,
  type Agendamento,
  type Coluna,
} from '../../types/agendamento'
import { AgendamentoForm } from './AgendamentoForm'
import { CompartilharWhatsApp } from './CompartilharWhatsApp'
import { Historico } from './Historico'

export type AcaoDetalhe = 'editar' | 'reagendar' | 'cancelar' | 'transferir' | 'venda'

type Props = {
  agendamento: Agendamento
  acaoInicial?: AcaoDetalhe | null
  onAlterado: (a: Agendamento) => void
  /** Abre outro agendamento (ex.: anterior/novo de um reagendamento). */
  onAbrir?: (id: string) => void
  /** Acabou de ser criado: destaca o envio da confirmação ao cliente. */
  recemCriado?: boolean
}

export function AgendamentoDetalhe({ agendamento: a, acaoInicial = null, onAlterado, onAbrir, recemCriado = false }: Props) {
  const { perfil } = useAuth()
  const { nomeVendedor, nomeCategoria, vendedores } = useCadastros()

  const [acao, setAcao] = useState<AcaoDetalhe | null>(acaoInicial)
  const [aba, setAba] = useState<'detalhes' | 'historico'>('detalhes')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Campos dos painéis de ação.
  const proximo = new Date(a.inicio)
  const [novaData, setNovaData] = useState(paraInputData(proximo))
  const [novaHora, setNovaHora] = useState(paraInputHora(proximo))
  const [motivo, setMotivo] = useState('')
  const [novoVendedor, setNovoVendedor] = useState('')
  const [valor, setValor] = useState('')

  const coluna = colunaDe(a)
  const info = COLUNA_POR_ID[coluna]
  const encerrado = estaEncerrado(a)
  const editavel = podeAlterar(perfil, a) && !encerrado
  const comparecimentoLiberado = jaPodeMarcarComparecimento(a)

  async function executar(fn: () => Promise<Agendamento>) {
    setErro(null)
    setOcupado(true)
    try {
      const atualizado = await fn()
      setAcao(null)
      setMotivo('')
      onAlterado(atualizado)
    } catch (error) {
      setErro(mensagemDeErro(error))
    } finally {
      setOcupado(false)
    }
  }

  function mover(destino: Coluna) {
    if (destino === 'venda_fechada') {
      setAcao('venda')
      return
    }
    void executar(() => moverPara(a, destino))
  }

  function enviarAcao(event: FormEvent) {
    event.preventDefault()
    if (acao === 'reagendar') {
      if (!novaData || !novaHora) return setErro('Informe a nova data e horário.')
      void executar(() => reagendar(a, combinarDataHora(novaData, novaHora), motivo.trim()))
    } else if (acao === 'cancelar') {
      if (motivo.trim().length < 3) return setErro('Informe o motivo do cancelamento.')
      void executar(() => cancelar(a, motivo.trim()))
    } else if (acao === 'transferir') {
      if (!novoVendedor) return setErro('Escolha o novo vendedor.')
      if (motivo.trim().length < 3) return setErro('Informe a justificativa.')
      void executar(() => transferirVendedor(a, novoVendedor, motivo.trim()))
    } else if (acao === 'venda') {
      const numero = valor.trim() ? Number(valor.replace(/\./g, '').replace(',', '.')) : null
      if (numero !== null && (Number.isNaN(numero) || numero < 0)) return setErro('Valor inválido.')
      void executar(() => moverPara(a, 'venda_fechada', numero))
    }
  }

  if (acao === 'editar') {
    return (
      <AgendamentoForm
        agendamento={a}
        onCancelar={() => setAcao(null)}
        onSalvo={(salvo) => {
          setAcao(null)
          onAlterado(salvo)
        }}
      />
    )
  }

  const destinos = COLUNAS_DIRETAS.filter((c) => {
    if (c === coluna) return false
    const exigeComparecimento = c !== 'agendado' && c !== 'confirmado'
    return !exigeComparecimento || comparecimentoLiberado
  })

  return (
    <div className="detalhe">
      <div className="detalhe-status">
        <span className="etiqueta-coluna" style={{ ['--cor' as string]: info.cor }}>
          {info.titulo}
        </span>
        {a.valor_venda !== null && <strong>{formatarMoeda(a.valor_venda)}</strong>}
      </div>

      <div className="abas" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'detalhes'}
          className={aba === 'detalhes' ? 'aba ativa' : 'aba'}
          onClick={() => setAba('detalhes')}
        >
          Detalhes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'historico'}
          className={aba === 'historico' ? 'aba ativa' : 'aba'}
          onClick={() => setAba('historico')}
        >
          Histórico
        </button>
      </div>

      {aba === 'historico' ? (
        <Historico agendamentoId={a.id} versao={a.versao} />
      ) : (
        <>
          <dl className="detalhe-info">
            <div>
              <dt><Clock size={16} aria-hidden /> Quando</dt>
              <dd>
                {formatarDataHora(a.inicio)} até{' '}
                {formatarHora(new Date(new Date(a.inicio).getTime() + a.duracao_min * 60000).toISOString())}
              </dd>
            </div>
            <div>
              <dt><UserRound size={16} aria-hidden /> Vendedor</dt>
              <dd>{nomeVendedor(a.vendedor_id)}</dd>
            </div>
            <div>
              <dt><Package size={16} aria-hidden /> Produto</dt>
              <dd>{nomeCategoria(a.categoria_id) ?? 'Não informado'}</dd>
            </div>
            {a.cliente_telefone && (
              <div>
                <dt><Phone size={16} aria-hidden /> Telefone</dt>
                <dd><a href={`tel:${a.cliente_telefone.replace(/\D/g, '')}`}>{a.cliente_telefone}</a></dd>
              </div>
            )}
            {a.observacoes && (
              <div className="detalhe-info-largo">
                <dt><StickyNote size={16} aria-hidden /> Observações</dt>
                <dd className="pre">{a.observacoes}</dd>
              </div>
            )}
            {a.motivo_cancelamento && (
              <div className="detalhe-info-largo">
                <dt>Motivo do cancelamento</dt>
                <dd>{a.motivo_cancelamento}</dd>
              </div>
            )}
          </dl>

          {(a.comparecimento_em || a.resultado_em) && (
            <ul className="detalhe-registros">
              {a.comparecimento_em && a.comparecimento_por && (
                <li>
                  {a.status === 'nao_compareceu' ? 'Falta' : 'Comparecimento'} registrado por{' '}
                  <strong>{nomeVendedor(a.comparecimento_por)}</strong> em {formatarCompleto(a.comparecimento_em)}
                </li>
              )}
              {a.resultado_em && a.resultado_por && (
                <li>
                  Resultado informado por <strong>{nomeVendedor(a.resultado_por)}</strong> em{' '}
                  {formatarCompleto(a.resultado_em)}
                </li>
              )}
            </ul>
          )}

          {a.reagendado_para_id && (
            <p className="alerta alerta-info">
              Este horário foi reagendado.{' '}
              {onAbrir && (
                <button type="button" className="botao-link" onClick={() => onAbrir(a.reagendado_para_id!)}>
                  Ver o novo agendamento
                </button>
              )}
            </p>
          )}
          {a.reagendado_de_id && (
            <p className="alerta alerta-info">
              Criado a partir de um reagendamento.{' '}
              {onAbrir && (
                <button type="button" className="botao-link" onClick={() => onAbrir(a.reagendado_de_id!)}>
                  Ver o horário anterior
                </button>
              )}
            </p>
          )}

          {!acao && (a.status === 'agendado' || a.status === 'confirmado') && (
            <CompartilharWhatsApp agendamento={a} destaque={recemCriado} />
          )}

          {editavel && !acao && (
            <>
              <section className="detalhe-bloco">
                <h3>Mover para</h3>
                <div className="detalhe-destinos">
                  {destinos.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="botao-etapa"
                      style={{ ['--cor' as string]: COLUNA_POR_ID[c].cor }}
                      disabled={ocupado}
                      onClick={() => mover(c)}
                    >
                      {COLUNA_POR_ID[c].titulo}
                    </button>
                  ))}
                </div>
                {!comparecimentoLiberado && (
                  <p className="texto-suave">Comparecimento e resultado ficam disponíveis no dia do agendamento.</p>
                )}
              </section>

              <div className="detalhe-acoes">
                <button type="button" className="botao botao-secundario" onClick={() => setAcao('editar')}>
                  <Pencil size={16} aria-hidden /> Editar
                </button>
                {(a.status === 'agendado' || a.status === 'confirmado' || a.status === 'nao_compareceu') && (
                  <button type="button" className="botao botao-secundario" onClick={() => setAcao('reagendar')}>
                    <CalendarClock size={16} aria-hidden /> Reagendar
                  </button>
                )}
                {(a.status === 'agendado' || a.status === 'confirmado') && (
                  <button type="button" className="botao botao-secundario botao-perigo" onClick={() => setAcao('cancelar')}>
                    <CalendarX2 size={16} aria-hidden /> Cancelar
                  </button>
                )}
                {ehGestor(perfil) && (
                  <button type="button" className="botao botao-secundario" onClick={() => setAcao('transferir')}>
                    <UserRoundCog size={16} aria-hidden /> Trocar vendedor
                  </button>
                )}
              </div>
            </>
          )}

          {!editavel && !encerrado && (
            <p className="texto-suave">Somente o vendedor responsável ou a gerência alteram este agendamento.</p>
          )}

          {acao && editavel && (
            <form className="form detalhe-bloco" onSubmit={enviarAcao} noValidate>
              {acao === 'reagendar' && (
                <>
                  <h3>Reagendar</h3>
                  <p className="texto-suave">
                    O horário atual fica registrado como “Reagendado” e um novo agendamento é criado.
                  </p>
                  <div className="campos-linha">
                    <label className="campo">
                      <span>Nova data</span>
                      <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
                    </label>
                    <label className="campo">
                      <span>Novo horário</span>
                      <input type="time" step={300} value={novaHora} onChange={(e) => setNovaHora(e.target.value)} />
                    </label>
                  </div>
                  <label className="campo">
                    <span>Motivo (opcional)</span>
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  </label>
                </>
              )}
              {acao === 'cancelar' && (
                <>
                  <h3>Cancelar agendamento</h3>
                  <label className="campo">
                    <span>Motivo *</span>
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
                  </label>
                </>
              )}
              {acao === 'transferir' && (
                <>
                  <h3>Trocar vendedor responsável</h3>
                  <label className="campo">
                    <span>Novo vendedor</span>
                    <select value={novoVendedor} onChange={(e) => setNovoVendedor(e.target.value)}>
                      <option value="">Selecione…</option>
                      {vendedores
                        .filter((v) => v.ativo && v.id !== a.vendedor_id)
                        .map((v) => (
                          <option key={v.id} value={v.id}>{v.nome}</option>
                        ))}
                    </select>
                  </label>
                  <label className="campo">
                    <span>Justificativa *</span>
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  </label>
                </>
              )}
              {acao === 'venda' && (
                <>
                  <h3>Venda fechada</h3>
                  <label className="campo">
                    <span>Valor da venda (opcional)</span>
                    <input
                      inputMode="decimal"
                      placeholder="0,00"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      autoFocus
                    />
                  </label>
                </>
              )}

              {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}

              <div className="modal-acoes">
                <button
                  type="button"
                  className="botao botao-secundario"
                  onClick={() => {
                    setAcao(null)
                    setErro(null)
                  }}
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className={acao === 'cancelar' ? 'botao botao-perigo-cheio' : 'botao botao-primario'}
                  disabled={ocupado}
                >
                  {ocupado && <span className="spinner" aria-hidden />}
                  Confirmar
                </button>
              </div>
            </form>
          )}

          {erro && !acao && <p className="alerta alerta-erro" role="alert">{erro}</p>}
        </>
      )}
    </div>
  )
}
