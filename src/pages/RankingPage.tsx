import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Info, MessageCircle, RefreshCw, Settings, Target, Tv } from 'lucide-react'

import { useAuth } from '../auth/AuthProvider'
import { AvisosRanking, CartaoAviso } from '../components/ranking/AvisosRanking'
import { BotaoSom } from '../components/ranking/BotaoSom'
import { ConfigRanking } from '../components/ranking/ConfigRanking'
import { GraficoVendasDia } from '../components/ranking/GraficoVendasDia'
import { MetaLoja } from '../components/ranking/MetaLoja'
import { ListaRanking, Podio } from '../components/ranking/Placar'
import { useRankingVendas } from '../hooks/useRankingVendas'
import { useSom } from '../hooks/useSom'
import { formatarMoeda } from '../lib/datas'
import { linkWhatsApp } from '../lib/whatsapp'
import {
  dataCurta,
  hojeBrasilia,
  montarMensagemMetaDoDia,
  montarMensagemRanking,
  periodoDoPreset,
  PRESETS,
  textoPeriodo,
  variacao,
  type AvisoRanking,
  type PresetPeriodo,
} from '../lib/rankingVendas'
import type { PedidoRanking } from '../services/ranking.service'

const pct1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

function textoVariacao(v: number | null) {
  if (v === null) return 'sem base de comparação'
  const sinal = v > 0 ? '+' : v < 0 ? '−' : ''
  return `${sinal}${pct1.format(Math.abs(v))}% vs. período anterior`
}

/** Ranking de vendas dos vendedores com os pedidos do Syscol. */
export function RankingPage() {
  const { perfil } = useAuth()
  const papel = perfil?.allowed ? perfil.papel : null
  const gestao = papel === 'gerente' || papel === 'admin'

  const [hoje] = useState(() => hojeBrasilia())
  const [preset, setPreset] = useState<PresetPeriodo | null>('mes')
  const [periodo, setPeriodo] = useState(() => periodoDoPreset('mes', hojeBrasilia()))
  const { dados, erro, carregando, atualizar } = useRankingVendas(periodo.inicio, periodo.fim)
  const [configAberta, setConfigAberta] = useState(false)
  const [avisoTeste, setAvisoTeste] = useState<AvisoRanking | null>(null)
  const som = useSom()

  const lider = dados?.vendedores.find((v) => v.posicao === 1 && v.valor > 0)
  const participacao = lider && dados && dados.resumo.valor > 0 ? (100 * lider.valor) / dados.resumo.valor : null
  const varValor = dados ? variacao(dados.resumo.valor, dados.resumo.anterior_valor) : null
  const varPedidos = dados ? variacao(dados.resumo.pedidos, dados.resumo.anterior_pedidos) : null
  const datasValidas = periodo.inicio <= periodo.fim

  const vendedores = useMemo(() => dados?.vendedores ?? [], [dados])

  function escolherPreset(p: PresetPeriodo) {
    setPreset(p)
    setPeriodo(periodoDoPreset(p, hoje))
  }

  function testarAviso(tipo: 'lider' | 'meta') {
    const v = vendedores[0]
    if (!v) return
    setConfigAberta(false)
    const chave = `teste-${tipo}-${Date.now()}`
    if (tipo === 'lider') setAvisoTeste({ tipo, vendedor: v, chave })
    else {
      const meta = v.meta_diaria && v.meta_diaria > 0 ? v.meta_diaria : 5000
      setAvisoTeste({ tipo, vendedor: { ...v, meta_diaria: meta, hoje_valor: Math.max(v.hoje_valor, meta) }, chave })
    }
  }

  return (
    <section className="pagina pagina-larga rk-pagina">
      <header className="pagina-cabecalho pagina-cabecalho-acoes">
        <div>
          <h1>Ranking de vendas</h1>
          <p className="texto-suave">
            {textoPeriodo(periodo.inicio, periodo.fim)} · pedidos do Syscol
            {dados && ` · atualizado às ${hora.format(new Date(dados.gerado_em))}`}
          </p>
        </div>
        <div className="rk-acoes">
          <BotaoSom som={som} className="botao-icone escuro" />
          <button type="button" className="botao-icone escuro" onClick={() => void atualizar()} aria-label="Atualizar agora" title="Atualizar agora">
            <RefreshCw size={18} className={carregando ? 'rk-girando' : ''} />
          </button>
          {dados && (
            <a
              className="botao botao-whatsapp botao-pequeno"
              href={linkWhatsApp(null, montarMensagemRanking(dados))}
              target="_blank"
              rel="noopener noreferrer"
              title="Abre o WhatsApp com o ranking pronto para enviar ao grupo de vendas"
              aria-label="Compartilhar o ranking no WhatsApp"
            >
              <MessageCircle size={18} aria-hidden /> Ranking
            </a>
          )}
          {dados && (
            <a
              className="botao botao-whatsapp botao-pequeno"
              href={linkWhatsApp(null, montarMensagemMetaDoDia(dados))}
              target="_blank"
              rel="noopener noreferrer"
              title="Abre o WhatsApp com a meta de hoje pronta para enviar ao grupo de vendas"
              aria-label="Compartilhar a meta de hoje no WhatsApp"
            >
              <Target size={18} aria-hidden /> Meta do dia
            </a>
          )}
          <Link to="/ranking/tv" className="botao botao-secundario botao-pequeno">
            <Tv size={18} aria-hidden /> Modo TV
          </Link>
          {gestao && dados?.config && (
            <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => setConfigAberta(true)}>
              <Settings size={18} aria-hidden /> Configurar
            </button>
          )}
        </div>
      </header>

      <div className="barra-filtros">
        <div className="segmentado" role="group" aria-label="Período">
          {PRESETS.map(([p, rotulo]) => (
            <button
              key={p}
              type="button"
              aria-pressed={preset === p}
              className={preset === p ? 'ativo' : ''}
              onClick={() => escolherPreset(p)}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="periodo-livre">
          <label className="filtro">
            <span className="sr-only">De</span>
            <input
              type="date"
              value={periodo.inicio}
              max={hoje}
              aria-label="Data inicial"
              onChange={(e) => {
                if (!e.target.value) return
                setPreset(null)
                setPeriodo((p) => ({ ...p, inicio: e.target.value }))
              }}
            />
          </label>
          <span className="texto-suave">até</span>
          <label className="filtro">
            <span className="sr-only">Até</span>
            <input
              type="date"
              value={periodo.fim}
              min={periodo.inicio}
              aria-label="Data final"
              onChange={(e) => {
                if (!e.target.value) return
                setPreset(null)
                setPeriodo((p) => ({ ...p, fim: e.target.value }))
              }}
            />
          </label>
        </div>
      </div>

      {!datasValidas && <p className="alerta alerta-aviso">Escolha uma data inicial anterior à final.</p>}
      {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}
      {!dados && carregando && (
        <div className="carregando" role="status">
          <span className="spinner" aria-hidden /> Carregando o ranking…
        </div>
      )}

      {dados && (
        <>
          {lider ? (
            <p className="rk-frase">
              <strong>{lider.nome}</strong> lidera com <strong>{formatarMoeda(lider.valor)}</strong>
              {participacao !== null && <>, {pct1.format(participacao)}% de tudo que a loja vendeu no período</>}.
            </p>
          ) : (
            <p className="rk-frase">Nenhum pedido no período escolhido.</p>
          )}

          <MetaLoja mes={dados.mes} podeConfigurar={gestao} />

          <section className="bloco rk-placar" aria-labelledby="rk-ranking-titulo">
            <h2 id="rk-ranking-titulo">Vendedores</h2>
            {vendedores.length === 0 ? (
              <p className="texto-suave">
                Nenhum vendedor ainda. Eles aparecem quando a sincronização com o Syscol traz os pedidos.
              </p>
            ) : (
              <>
                <Podio vendedores={vendedores} />
                <ListaRanking vendedores={vendedores} />
              </>
            )}
          </section>

          <div className="indicadores">
            <Cartao titulo="Total vendido" valor={formatarMoeda(dados.resumo.valor)} detalhe={textoVariacao(varValor)} positivo={varValor} />
            <Cartao titulo="Pedidos" valor={String(dados.resumo.pedidos)} detalhe={textoVariacao(varPedidos)} positivo={varPedidos} />
            <Cartao
              titulo="Ticket médio"
              valor={dados.resumo.ticket_medio !== null ? formatarMoeda(dados.resumo.ticket_medio) : '—'}
              detalhe="Valor médio por pedido"
            />
            {gestao && (
              <Cartao
                titulo="Margem bruta"
                valor={dados.resumo.margem_pct !== null ? `${pct1.format(dados.resumo.margem_pct)}%` : '—'}
                detalhe="Venda menos custo de reposição"
              />
            )}
          </div>

          {dados.diario.length > 1 && (
            <section className="bloco" aria-labelledby="rk-dia-titulo">
              <h2 id="rk-dia-titulo">Vendas por dia</h2>
              <GraficoVendasDia diario={dados.diario} />
            </section>
          )}

          {gestao && (
            <section className="bloco" aria-labelledby="rk-det-titulo">
              <h2 id="rk-det-titulo">Detalhes por vendedor</h2>
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th scope="col" className="num">#</th>
                      <th scope="col">Vendedor</th>
                      <th scope="col" className="num">Vendido</th>
                      <th scope="col" className="num">Pedidos</th>
                      <th scope="col" className="num">Ticket médio</th>
                      <th scope="col" className="num">Margem</th>
                      <th scope="col" className="num">Hoje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendedores.map((v) => (
                      <tr key={v.vendedor_id}>
                        <td className="num">{v.posicao}º</td>
                        <th scope="row">{v.nome}</th>
                        <td className="num"><strong>{formatarMoeda(v.valor)}</strong></td>
                        <td className="num">{v.pedidos}</td>
                        <td className="num">{v.ticket_medio !== null ? formatarMoeda(v.ticket_medio) : '—'}</td>
                        <td className="num">{v.margem_pct !== null ? `${pct1.format(v.margem_pct)}%` : '—'}</td>
                        <td className="num">{formatarMoeda(v.hoje_valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {gestao && dados.pedidos && (
            <section className="bloco" aria-labelledby="rk-ped-titulo">
              <h2 id="rk-ped-titulo">Pedidos do período</h2>
              {dados.pedidos.length === 0 ? (
                <p className="texto-suave">Nenhum pedido no período.</p>
              ) : (
                <div className="tabela-rolagem">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th scope="col">Pedido</th>
                        <th scope="col">Emissão</th>
                        <th scope="col">Vendedor</th>
                        <th scope="col">Situação</th>
                        <th scope="col" className="num">Itens</th>
                        <th scope="col" className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.pedidos.map((p) => (
                        <tr key={p.numero} className={p.cancelado ? 'rk-cancelado' : ''}>
                          <th scope="row">{Number(p.numero)}</th>
                          <td>{dataCurta(p.data_emissao)}</td>
                          <td>{p.vendedor_2 ? `${p.vendedor} e ${p.vendedor_2}` : (p.vendedor ?? '—')}</td>
                          <td>
                            <span className={`etiqueta ${classeStatus(p)}`}>{p.status ?? '—'}</span>
                          </td>
                          <td className="num">{p.qtd_itens ?? '—'}</td>
                          <td className="num">
                            {formatarMoeda(p.total)}
                            {p.valor_devolucao > 0 && (
                              <small className="rk-troca">
                                Troca: pedido de {formatarMoeda(p.total_pedido)} com {formatarMoeda(p.valor_devolucao)} de crédito
                              </small>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <details className="bloco como-calculamos">
            <summary>
              <Info size={16} aria-hidden /> Como os números são calculados
            </summary>
            <ul>
              <li>Os pedidos vêm do Syscol: pelo webhook, na hora em que são gravados, e por uma sincronização com a API a cada 10 minutos, que traz cancelamentos e alterações.</li>
              <li>O período usa a <strong>data de emissão</strong> do pedido. "Hoje" e "este mês" seguem o horário de Brasília.</li>
              <li>Pedidos cancelados ficam fora de todos os totais.</li>
              <li><strong>Trocas</strong>: quando o cliente troca o produto, o crédito dos itens devolvidos não conta de novo como venda. O pedido de troca conta só a diferença que o cliente pagou (e nada, se o crédito cobriu tudo). A venda original continua contando.</li>
              <li><strong>Venda dividida</strong>: pedido com dois vendedores é repartido pelo percentual de cada um no Syscol (por isso o valor de cada vendedor pode diferir do relatório do Syscol, que credita o pedido inteiro a um só).</li>
              <li>Os demais pedidos contam para o vendedor marcado nos itens, como no Syscol.</li>
              <li><strong>Meta do mês</strong> vem do mapa de meta mensal do Syscol. A marca na barra mostra onde a loja deveria estar hoje vendendo o mesmo valor todo dia.</li>
              <li><strong>Meta do dia</strong> é automática: a loja precisa vender hoje (meta do mês − o que vendeu até ontem) ÷ dias de venda que faltam no mês, e esse valor é dividido igualmente entre os vendedores. Administradores e gerentes ficam de fora. A meta fica fixa durante o dia e é recalculada a cada novo dia. A gestão pode dar uma meta própria a alguém em Configurar.</li>
              {gestao && <li><strong>Margem bruta</strong> = 1 − (custo de reposição dos itens ÷ valor vendido). Só gerentes e administradores veem.</li>}
              <li>Novo 1º lugar e meta do dia batida também chegam como notificação para quem ativou as notificações no app.</li>
            </ul>
          </details>
        </>
      )}

      <AvisosRanking dados={dados} />
      {avisoTeste && <CartaoAviso aviso={avisoTeste} onFechar={() => setAvisoTeste(null)} />}
      {dados?.config && (
        <ConfigRanking
          aberto={configAberta}
          onFechar={() => setConfigAberta(false)}
          dados={dados}
          ehAdmin={papel === 'admin'}
          onSalvo={() => void atualizar()}
          onTestarAviso={testarAviso}
        />
      )}
    </section>
  )
}

/** Cor da situação do pedido: concluído em verde, cancelado em vermelho, o resto em amarelo. */
function classeStatus(p: Pick<PedidoRanking, 'status' | 'cancelado'>) {
  if (p.cancelado) return 'etiqueta-inativo'
  if (/CONCLU/i.test(p.status ?? '')) return 'etiqueta-concluido'
  return 'etiqueta-pendente'
}

function Cartao({ titulo, valor, detalhe, positivo }: { titulo: string; valor: string; detalhe?: string; positivo?: number | null }) {
  const classe = positivo === undefined || positivo === null ? '' : positivo >= 0 ? 'rk-sobe' : 'rk-desce'
  return (
    <div className="indicador">
      <span className="indicador-titulo">{titulo}</span>
      <strong className="indicador-valor">{valor}</strong>
      {detalhe && <span className={`indicador-detalhe ${classe}`}>{detalhe}</span>}
    </div>
  )
}
