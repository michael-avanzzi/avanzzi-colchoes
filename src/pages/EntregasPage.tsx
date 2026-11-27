import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, MapPin, MessageCircle, Phone, RefreshCw, Truck } from 'lucide-react'

import { FiltroVendedorSyscol } from '../components/entregas/FiltroVendedorSyscol'
import {
  diasDaSemana,
  linkMapa,
  resumoEntregas,
  rotuloDia,
  rotuloEstoqueItem,
  rotuloSemana,
  ROTULO_SELO,
  segundaDaSemana,
  seloDaEntrega,
  somarDiasIso,
  diaMes,
} from '../lib/entregas'
import { hojeBrasilia } from '../lib/rankingVendas'
import { mensagemDeErro } from '../lib/supabase'
import { normalizarTelefoneBR } from '../lib/whatsapp'
import { obterEntregas, type Entrega, type Entregas } from '../services/entregas.service'

/**
 * Semana de entregas: os pedidos a entregar em cada dia (data da minuta ou, sem
 * minuta, a data prometida), com o estoque de cada item para decidir rápido.
 * Vendedor vê as entregas dele; logística, gerente e admin veem todas.
 */
export function EntregasPage() {
  const [hoje] = useState(() => hojeBrasilia())
  const [segunda, setSegunda] = useState(() => segundaDaSemana(hojeBrasilia()))
  const [vendedor, setVendedor] = useState('')
  const [dados, setDados] = useState<Entregas | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [verAtrasadas, setVerAtrasadas] = useState(false)
  const pedido = useRef(0)
  const toque = useRef<{ x: number; y: number } | null>(null)

  const fim = somarDiasIso(segunda, 6)

  const carregar = useCallback(async () => {
    const meu = ++pedido.current
    setCarregando(true)
    try {
      const d = await obterEntregas(segunda, fim, vendedor || null)
      if (meu !== pedido.current) return
      setDados(d)
      setErro(null)
    } catch (e) {
      if (meu === pedido.current) setErro(mensagemDeErro(e))
    } finally {
      if (meu === pedido.current) setCarregando(false)
    }
  }, [segunda, fim, vendedor])

  // Atualiza ao abrir, a cada 2 minutos e quando a tela volta a ficar visível.
  useEffect(() => {
    const primeira = window.setTimeout(() => void carregar(), 0)
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void carregar(), 120_000)
    const aoVoltar = () => document.visibilityState === 'visible' && void carregar()
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      window.clearTimeout(primeira)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [carregar])

  const porDia = useMemo(() => {
    const mapa = new Map<string, Entrega[]>()
    for (const e of dados?.entregas ?? []) mapa.set(e.data_entrega, [...(mapa.get(e.data_entrega) ?? []), e])
    return mapa
  }, [dados])

  // Domingo só aparece se tiver entrega.
  const dias = diasDaSemana(segunda).filter((d, i) => i < 6 || porDia.has(d))
  const resumo = resumoEntregas(dados?.entregas ?? [])
  const atrasadas = dados?.atrasadas ?? []
  const ehEstaSemana = segunda === segundaDaSemana(hoje)

  return (
    <section className="pagina en-pagina">
      <header className="pagina-cabecalho pagina-cabecalho-acoes">
        <div>
          <h1>Entregas</h1>
          <p className="texto-suave">
            {dados?.todos ? 'Todas as entregas' : 'Suas entregas'} · data da minuta ou, sem minuta, a data prometida
          </p>
        </div>
        <button type="button" className="botao-icone escuro" onClick={() => void carregar()} aria-label="Atualizar agora" title="Atualizar agora">
          <RefreshCw size={18} className={carregando ? 'rk-girando' : ''} />
        </button>
      </header>

      <div className="navegacao-datas" role="group" aria-label="Navegar entre as semanas">
        <button type="button" className="seta-data" onClick={() => setSegunda((s) => somarDiasIso(s, -7))} aria-label="Semana anterior">
          <ChevronLeft size={26} aria-hidden />
        </button>
        <span className="titulo-data">{rotuloSemana(segunda)}</span>
        <button type="button" className="seta-data" onClick={() => setSegunda((s) => somarDiasIso(s, 7))} aria-label="Próxima semana">
          <ChevronRight size={26} aria-hidden />
        </button>
        <div className="navegacao-datas-extra">
          <button
            type="button"
            className="botao botao-secundario botao-pequeno"
            onClick={() => setSegunda(segundaDaSemana(hoje))}
            disabled={ehEstaSemana}
          >
            Esta semana
          </button>
          {dados?.todos && dados.vendedores && (
            <FiltroVendedorSyscol valor={vendedor} vendedores={dados.vendedores} onChange={setVendedor} />
          )}
        </div>
      </div>

      {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}
      {dados && !dados.vinculado && (
        <p className="alerta alerta-aviso">
          Seu usuário ainda não está ligado a um vendedor do Syscol. Peça a um administrador para ligar em Ranking → Configurar.
        </p>
      )}

      {dados && (
        <ul className="md-resumo" aria-label="Resumo da semana">
          <li><strong>{resumo.total}</strong> {resumo.total === 1 ? 'entrega' : 'entregas'}</li>
          {resumo.pronto > 0 && <li className="en-resumo-pronto"><strong>{resumo.pronto}</strong> {resumo.pronto === 1 ? 'pronta' : 'prontas'}</li>}
          {resumo.tem_no_estoque > 0 && <li className="en-resumo-livre"><strong>{resumo.tem_no_estoque}</strong> com estoque para adiantar</li>}
          {resumo.aguardando > 0 && <li className="md-resumo-atencao"><strong>{resumo.aguardando}</strong> aguardando fabricante</li>}
          {resumo.risco > 0 && <li className="en-resumo-risco"><strong>{resumo.risco}</strong> com risco de atraso</li>}
          {resumo.entregue > 0 && <li className="md-resumo-ok"><strong>{resumo.entregue}</strong> {resumo.entregue === 1 ? 'entregue' : 'entregues'}</li>}
        </ul>
      )}

      {atrasadas.length > 0 && (
        <section className="en-atrasadas">
          <button type="button" className="en-atrasadas-topo" onClick={() => setVerAtrasadas((v) => !v)} aria-expanded={verAtrasadas}>
            <AlertTriangle size={20} aria-hidden />
            <span>
              <strong>{atrasadas.length}</strong> {atrasadas.length === 1 ? 'entrega atrasada' : 'entregas atrasadas'} de semanas
              anteriores
            </span>
            <ChevronDown size={20} aria-hidden className={verAtrasadas ? 'en-girado' : ''} />
          </button>
          {verAtrasadas && (
            <ol className="en-lista">
              {atrasadas.map((e) => (
                <CartaoEntrega key={e.numero} e={e} mostrarVendedor={Boolean(dados?.todos)} mostrarData />
              ))}
            </ol>
          )}
        </section>
      )}

      <div
        className="en-dias"
        onTouchStart={(ev) => {
          const t = ev.touches[0]
          toque.current = { x: t.clientX, y: t.clientY }
        }}
        onTouchEnd={(ev) => {
          const inicio = toque.current
          toque.current = null
          if (!inicio) return
          const t = ev.changedTouches[0]
          const dx = t.clientX - inicio.x
          if (Math.abs(dx) > 80 && Math.abs(t.clientY - inicio.y) < 50) setSegunda((s) => somarDiasIso(s, dx < 0 ? 7 : -7))
        }}
      >
        {!dados && carregando && (
          <div className="carregando" role="status">
            <span className="spinner" aria-hidden /> Carregando as entregas…
          </div>
        )}
        {dados &&
          dias.map((dia) => {
            const lista = porDia.get(dia) ?? []
            const r = resumoEntregas(lista)
            return (
              <section key={dia} className={`en-dia ${dia === hoje ? 'en-dia-hoje' : ''} ${dia < hoje ? 'en-dia-passado' : ''}`}>
                <header className="en-dia-topo">
                  <h2 className="primeira-maiuscula">
                    {dia === hoje ? 'Hoje, ' : ''}
                    {rotuloDia(dia)}
                  </h2>
                  <span className="texto-suave">
                    {lista.length === 0
                      ? 'Sem entregas'
                      : `${lista.length} ${lista.length === 1 ? 'entrega' : 'entregas'}${r.entregue ? ` · ${r.entregue} entregue${r.entregue > 1 ? 's' : ''}` : ''}`}
                  </span>
                </header>
                {lista.length > 0 && (
                  <ol className="en-lista">
                    {lista.map((e) => (
                      <CartaoEntrega key={e.numero} e={e} mostrarVendedor={Boolean(dados.todos)} />
                    ))}
                  </ol>
                )}
              </section>
            )
          })}
      </div>

      <details className="bloco como-calculamos">
        <summary>Como ler esta tela</summary>
        <ul>
          <li><strong>Data da entrega</strong>: a da minuta (ficha de entrega) quando existe; senão, a data prometida ao cliente no pedido.</li>
          <li><strong>Pronto para entregar</strong>: nenhum item aguardando fabricante.</li>
          <li><strong>Tem no estoque</strong>: o item aguarda o fabricante, mas o depósito tem saldo livre (saldo menos reservado). Dá para adiantar a entrega com o estoque.</li>
          <li><strong>Risco de atraso</strong>: a fábrica prevê entregar depois da data combinada com o cliente.</li>
          <li><strong>Atrasadas</strong>: data de entrega já passou e o pedido ainda não foi entregue.</li>
          <li>Dados do Syscol, atualizados a cada 10 minutos. Arraste para o lado para trocar de semana.</li>
        </ul>
      </details>
    </section>
  )
}

function CartaoEntrega({ e, mostrarVendedor, mostrarData = false }: { e: Entrega; mostrarVendedor: boolean; mostrarData?: boolean }) {
  const selo = seloDaEntrega(e)
  const mapa = linkMapa(e)
  const telefone = normalizarTelefoneBR(e.telefone)
  const local = [e.bairro, e.cidade].filter(Boolean).join(' · ')

  return (
    <li className={`en-cartao en-selo-${selo}`}>
      <div className="en-cartao-topo">
        <span className="en-pedido">
          Pedido {Number(e.numero)}
          {mostrarData && <> · {diaMes(e.data_entrega)}</>}
          {e.hora && <> · {e.hora}</>}
        </span>
        <span className={`en-selo en-selo-chip-${selo}`}>{ROTULO_SELO[selo]}</span>
      </div>

      <strong className="en-cliente">{e.cliente ?? 'Cliente sem nome no Syscol'}</strong>
      {local && <span className="en-local">{local}</span>}
      {e.endereco && (
        <span className="en-endereco">
          {e.endereco}
          {e.complemento ? ` · ${e.complemento}` : ''}
          {e.ponto_referencia ? ` · ${e.ponto_referencia}` : ''}
        </span>
      )}
      {e.observacao_entrega && <span className="en-obs">{e.observacao_entrega}</span>}

      <ul className="en-itens">
        {e.itens.map((i, n) => {
          const est = rotuloEstoqueItem(i)
          return (
            <li key={n} className="en-item">
              <span className="en-item-nome">
                {i.quantidade !== 1 && <strong>{i.quantidade}× </strong>}
                {i.descricao}
              </span>
              <span className={`en-estoque en-estoque-${est.classe}`}>{est.texto}</span>
            </li>
          )
        })}
      </ul>

      <div className="en-rodape">
        <span className="texto-suave en-detalhes">
          {e.carga_id ? (
            <>
              <Truck size={14} aria-hidden /> Carga {e.carga_id}
              {e.ordem_entrega ? ` · ${e.ordem_entrega}ª entrega` : ''}
              {e.carga_km ? ` · ${Math.round(e.carga_km)} km` : ''}
            </>
          ) : e.origem_data === 'prometida' ? (
            'Sem minuta · data prometida'
          ) : (
            'Sem carga'
          )}
          {mostrarVendedor && e.vendedor ? ` · ${e.vendedor}` : ''}
        </span>
        <span className="md-contato">
          {mapa && (
            <a className="md-icone" href={mapa} target="_blank" rel="noopener noreferrer" aria-label={`Ver o endereço de ${e.cliente ?? 'cliente'} no mapa`} title="Mapa">
              <MapPin size={20} aria-hidden />
            </a>
          )}
          {telefone && (
            <>
              <a className="md-icone md-whatsapp" href={`https://wa.me/${telefone}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${e.cliente ?? 'cliente'}`} title="WhatsApp">
                <MessageCircle size={20} aria-hidden />
              </a>
              <a className="md-icone" href={`tel:+${telefone}`} aria-label={`Ligar para ${e.cliente ?? 'cliente'}`} title="Ligar">
                <Phone size={20} aria-hidden />
              </a>
            </>
          )}
        </span>
      </div>
    </li>
  )
}
