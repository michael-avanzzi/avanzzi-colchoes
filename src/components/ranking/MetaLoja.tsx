import { calcularMetaLoja, nomeDoMes } from '../../lib/rankingVendas'
import type { RankingVendas } from '../../services/ranking.service'

const moeda0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const pct = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Progresso da loja na meta do mês, com a marca do ritmo esperado para hoje. */
export function MetaLoja({ mes, podeConfigurar }: { mes: RankingVendas['mes']; podeConfigurar?: boolean }) {
  const m = calcularMetaLoja(mes)
  const largura = Math.min(100, m.pct ?? 0)

  return (
    <section className="rk-meta" aria-labelledby="rk-meta-titulo">
      <div className="rk-meta-topo">
        <div>
          <p className="rk-rotulo" id="rk-meta-titulo">Meta de {nomeDoMes(mes.inicio)}</p>
          <p className="rk-meta-valor">{moeda0.format(m.vendido)}</p>
          <p className="rk-meta-de">{m.meta ? `de ${moeda0.format(m.meta)}` : 'meta do mês não cadastrada'}</p>
        </div>
        {m.pct !== null && (
          <p className={`rk-meta-pct ${m.noRitmo ? 'rk-ok' : ''}`}>{pct.format(m.pct)}%</p>
        )}
      </div>

      <div
        className="rk-meta-trilho"
        role="img"
        aria-label={
          m.pct !== null
            ? `Loja em ${pct.format(m.pct)}% da meta do mês. Ritmo esperado para hoje: ${pct.format(m.ritmoPct)}%.`
            : 'Meta do mês não cadastrada'
        }
      >
        <div className={`rk-meta-barra ${m.noRitmo ? 'rk-meta-barra-ok' : ''}`} style={{ width: `${largura}%` }} />
        {m.meta && <div className="rk-meta-ritmo" style={{ left: `${Math.min(100, m.ritmoPct)}%` }} title="Ritmo esperado para hoje" />}
      </div>

      <div className="rk-meta-rodape">
        {!m.meta ? (
          <span>
            Cadastre a meta no mapa de meta mensal do Syscol
            {podeConfigurar ? ' ou em Configurar.' : '.'}
          </span>
        ) : m.falta === 0 ? (
          <span><strong>Meta do mês batida!</strong> Tudo que entrar agora é extra.</span>
        ) : (
          <>
            <span>Faltam <strong>{moeda0.format(m.falta ?? 0)}</strong></span>
            {m.porDia !== null && (
              <span>
                <strong>{moeda0.format(m.porDia)} por dia</strong> nos {m.diasRestantes}{' '}
                {m.diasRestantes === 1 ? 'dia que resta' : 'dias que restam'}
              </span>
            )}
            <span>Ritmo esperado hoje: <strong>{pct.format(m.ritmoPct)}%</strong></span>
          </>
        )}
      </div>
    </section>
  )
}
