import { useState, type FormEvent } from 'react'

import { mensagemDeErro } from '../../lib/supabase'
import {
  definirVendedorAtivo,
  salvarMetasLoja,
  salvarMetaVendedor,
  vincularVendedor,
  type RankingVendas,
} from '../../services/ranking.service'
import { Modal } from '../ui/Modal'

const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function numeroOuNull(v: string) {
  if (v.trim() === '') return null
  const n = Number(v.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

type Props = {
  aberto: boolean
  onFechar: () => void
  dados: RankingVendas
  ehAdmin: boolean
  onSalvo: () => void
  onTestarAviso: () => void
}

/** Metas do ranking (gerente/admin) e ligação dos usuários aos vendedores do Syscol (admin). */
export function ConfigRanking({ aberto, onFechar, dados, ehAdmin, onSalvo, onTestarAviso }: Props) {
  const cfg = dados.config
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  if (!cfg) return null

  async function executar(acao: () => Promise<void>, ok: string) {
    setSalvando(true)
    try {
      await acao()
      setMensagem({ tipo: 'ok', texto: ok })
      onSalvo()
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: mensagemDeErro(e) })
    } finally {
      setSalvando(false)
    }
  }

  const nomeSyscol = new Map(cfg.vendedores_syscol.map((v) => [v.id, v.nome]))

  return (
    <Modal titulo="Configurar ranking" aberto={aberto} onFechar={onFechar}>
      <FormMetas
        metaDiaria={cfg.meta_diaria_padrao}
        metaMensal={cfg.meta_mensal_manual}
        metaDoSyscol={cfg.meta_mes_do_syscol}
        salvando={salvando}
        onSalvar={(dia, mes) => void executar(() => salvarMetasLoja(dia, mes), 'Metas salvas.')}
      />

      <section className="rk-config-secao" aria-labelledby="rk-config-vend">
        <h3 id="rk-config-vend">Vendedores</h3>
        <p className="texto-suave">
          Meta diária própria (vazio = usa a padrão){ehAdmin ? ', usuário do app ligado a cada vendedor do Syscol e quem aparece no ranking' : ''}.
          A foto vem do perfil do usuário ligado.
        </p>
        <ul className="rk-config-lista">
          {cfg.vendedores_syscol.map((vs) => {
            const v = dados.vendedores.find((x) => x.vendedor_id === vs.id)
            const perfil = cfg.perfis.find((p) => p.syscol_vendedor_id === vs.id)
            return (
              <li key={vs.id} className="rk-config-item">
                <strong>{vs.nome}</strong>
                <div className="rk-config-controles">
                  {vs.ativo && (
                    <label className="campo campo-compacto">
                      <span>Meta diária</span>
                      <input
                        inputMode="decimal"
                        defaultValue={v?.meta_propria && v.meta_diaria ? String(v.meta_diaria) : ''}
                        placeholder={cfg.meta_diaria_padrao ? `Padrão ${cfg.meta_diaria_padrao}` : 'Sem meta'}
                        onBlur={(e) => {
                          const novo = numeroOuNull(e.target.value)
                          const atual = v?.meta_propria ? v.meta_diaria : null
                          if (novo !== atual) void executar(() => salvarMetaVendedor(vs.id, novo), `Meta de ${vs.nome} salva.`)
                        }}
                      />
                    </label>
                  )}
                  {ehAdmin && (
                    <>
                      <label className="campo campo-compacto">
                        <span>Usuário do app</span>
                        <select
                          value={perfil?.id ?? ''}
                          disabled={salvando}
                          onChange={(e) => {
                            const perfilId = e.target.value
                            void executar(
                              () => (perfilId ? vincularVendedor(perfilId, vs.id) : perfil ? vincularVendedor(perfil.id, null) : Promise.resolve()),
                              'Ligação salva.',
                            )
                          }}
                        >
                          <option value="">Nenhum</option>
                          {cfg.perfis.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                              {p.syscol_vendedor_id && p.syscol_vendedor_id !== vs.id
                                ? ` (ligado a ${nomeSyscol.get(p.syscol_vendedor_id) ?? 'outro'})`
                                : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="campo-check">
                        <input
                          type="checkbox"
                          checked={vs.ativo}
                          disabled={salvando}
                          onChange={(e) =>
                            void executar(() => definirVendedorAtivo(vs.id, e.target.checked), e.target.checked ? `${vs.nome} volta ao ranking.` : `${vs.nome} saiu do ranking.`)
                          }
                        />
                        <span>No ranking</span>
                      </label>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {mensagem && (
        <p className={mensagem.tipo === 'ok' ? 'alerta alerta-sucesso' : 'alerta alerta-erro'} role="status">
          {mensagem.texto}
        </p>
      )}

      <section className="rk-config-secao">
        <h3>Conexão com o Syscol</h3>
        <p className="texto-suave">
          Última sincronização com a API:{' '}
          {cfg.ultima_sincronizacao ? dataHora.format(new Date(cfg.ultima_sincronizacao)) : 'ainda não rodou'}.
          <br />
          Último pedido recebido pelo webhook:{' '}
          {cfg.ultimo_webhook ? dataHora.format(new Date(cfg.ultimo_webhook)) : 'nenhum ainda'}.
        </p>
        <button type="button" className="botao botao-secundario" onClick={onTestarAviso}>
          Testar aviso na tela
        </button>
      </section>
    </Modal>
  )
}

/** Campos das metas da loja. Montado ao abrir a janela, então não perde o que está sendo digitado. */
function FormMetas({
  metaDiaria,
  metaMensal,
  metaDoSyscol,
  salvando,
  onSalvar,
}: {
  metaDiaria: number | null
  metaMensal: number | null
  metaDoSyscol: boolean
  salvando: boolean
  onSalvar: (metaDiaria: number | null, metaMensal: number | null) => void
}) {
  const [metaDia, setMetaDia] = useState(() => (metaDiaria ? String(metaDiaria) : ''))
  const [metaMes, setMetaMes] = useState(() => (metaMensal ? String(metaMensal) : ''))

  function salvar(e: FormEvent) {
    e.preventDefault()
    onSalvar(numeroOuNull(metaDia), numeroOuNull(metaMes))
  }

  return (
    <form className="form" onSubmit={salvar}>
      <label className="campo">
        <span>Meta diária padrão por vendedor (R$)</span>
        <input inputMode="decimal" value={metaDia} onChange={(e) => setMetaDia(e.target.value)} placeholder="Ex.: 5000" />
      </label>
      <label className="campo">
        <span>
          Meta do mês da loja (R$)
          {metaDoSyscol ? ' · o Syscol já tem meta para este mês, ela é a que vale' : ''}
        </span>
        <input
          inputMode="decimal"
          value={metaMes}
          onChange={(e) => setMetaMes(e.target.value)}
          placeholder="Só se o Syscol não tiver meta no mês"
        />
      </label>
      <div className="modal-acoes">
        <button type="submit" className="botao botao-primario" disabled={salvando}>Salvar metas</button>
      </div>
    </form>
  )
}
