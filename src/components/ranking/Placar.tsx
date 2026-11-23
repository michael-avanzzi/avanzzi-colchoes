import { bateuMetaDoDia } from '../../lib/rankingVendas'
import type { VendedorRanking } from '../../services/ranking.service'
import { Avatar } from '../ui/Avatar'

const moeda0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function pedidos(n: number) {
  return n === 1 ? '1 pedido' : `${n} pedidos`
}

/** Venda de hoje contra a meta do dia do vendedor. */
export function MetaDoDia({ v }: { v: VendedorRanking }) {
  const meta = v.meta_diaria && v.meta_diaria > 0 ? v.meta_diaria : null
  const bateu = bateuMetaDoDia(v)
  const largura = meta ? Math.min(100, (100 * v.hoje_valor) / meta) : 0
  return (
    <div className={`rk-dia ${bateu ? 'rk-dia-ok' : ''}`}>
      <div className="rk-dia-topo">
        <span>{bateu ? 'Meta do dia batida' : 'Hoje'}</span>
        <strong>
          {moeda0.format(v.hoje_valor)}
          {meta ? ` de ${moeda0.format(meta)}` : ''}
        </strong>
      </div>
      {meta && (
        <div className="rk-dia-trilho" aria-hidden>
          <div className="rk-dia-barra" style={{ width: `${largura}%` }} />
        </div>
      )}
    </div>
  )
}

/** 1º, 2º e 3º em destaque, com foto do perfil. */
export function Podio({ vendedores, tamanhoFoto = 88 }: { vendedores: VendedorRanking[]; tamanhoFoto?: number }) {
  const top = vendedores.slice(0, 3)
  if (top.length === 0) return null
  return (
    <ol className="rk-podio" aria-label="Pódio">
      {top.map((v) => (
        <li key={v.vendedor_id} className={`rk-podio-item rk-pos-${v.posicao}`}>
          <span className="rk-medalha" aria-label={`${v.posicao}º lugar`}>{v.posicao}º</span>
          <Avatar
            nome={v.nome}
            fotoPath={v.foto_path}
            tamanho={v.posicao === 1 ? Math.round(tamanhoFoto * 1.25) : tamanhoFoto}
            className="rk-foto"
          />
          <strong className="rk-podio-nome">{v.nome}</strong>
          <span className="rk-podio-valor">{moeda0.format(v.valor)}</span>
          <span className="rk-podio-sub">{pedidos(v.pedidos)}</span>
          <MetaDoDia v={v} />
        </li>
      ))}
    </ol>
  )
}

/** Do 4º lugar em diante. */
export function ListaRanking({ vendedores }: { vendedores: VendedorRanking[] }) {
  const resto = vendedores.slice(3)
  if (resto.length === 0) return null
  return (
    <ol className="rk-lista" start={4} aria-label="Demais posições">
      {resto.map((v) => (
        <li key={v.vendedor_id} className="rk-linha">
          <span className="rk-linha-pos">{v.posicao}º</span>
          <Avatar nome={v.nome} fotoPath={v.foto_path} tamanho={44} className="rk-foto" />
          <span className="rk-linha-nome">
            <strong>{v.nome}</strong>
            <small>{pedidos(v.pedidos)}</small>
          </span>
          <MetaDoDia v={v} />
          <span className="rk-linha-valor">{moeda0.format(v.valor)}</span>
        </li>
      ))}
    </ol>
  )
}
