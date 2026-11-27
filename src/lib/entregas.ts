import type { Entrega, ItemEntrega } from '../services/entregas.service'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (s: string) => {
  const [a, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

/** Segunda-feira da semana de uma data AAAA-MM-DD. */
export function segundaDaSemana(dia: string) {
  const d = utc(dia)
  const deslocamento = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - deslocamento)
  return iso(d)
}

export function somarDiasIso(dia: string, n: number) {
  const d = utc(dia)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

/** Os 7 dias (segunda a domingo) da semana que começa em `segunda`. */
export function diasDaSemana(segunda: string) {
  return Array.from({ length: 7 }, (_, i) => somarDiasIso(segunda, i))
}

const fmtDiaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' })
const fmtDiaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
const fmtCurto = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** 'segunda-feira, 30/11' */
export function rotuloDia(dia: string) {
  const d = utc(dia)
  return `${fmtDiaSemana.format(d)}, ${fmtDiaMes.format(d)}`
}

/** '30/11' */
export function diaMes(dia: string) {
  return fmtDiaMes.format(utc(dia))
}

/** 'Semana de 30 de nov. a 6 de dez.' */
export function rotuloSemana(segunda: string) {
  return `Semana de ${fmtCurto.format(utc(segunda))} a ${fmtCurto.format(utc(somarDiasIso(segunda, 6)))}`
}

/** Selo da entrega para decisão rápida. "Tem no estoque" = aguarda fabricante, mas o depósito tem saldo livre para tudo. */
export type Selo = 'entregue' | 'pronto' | 'tem_no_estoque' | 'aguardando' | 'risco'

export function seloDaEntrega(e: Pick<Entrega, 'prontidao' | 'aguardando' | 'aguardando_com_estoque'>): Selo {
  if (e.prontidao === 'entregue' || e.prontidao === 'pronto') return e.prontidao
  if (e.aguardando > 0 && e.aguardando_com_estoque === e.aguardando) return 'tem_no_estoque'
  return e.prontidao
}

export const ROTULO_SELO: Record<Selo, string> = {
  entregue: 'Entregue',
  pronto: 'Pronto para entregar',
  tem_no_estoque: 'Tem no estoque',
  aguardando: 'Aguardando fabricante',
  risco: 'Risco de atraso',
}

/** Texto curto do estoque de um item. */
export function rotuloEstoqueItem(i: ItemEntrega): { classe: string; texto: string } {
  if (i.situacao === 'entregue') return { classe: 'ok', texto: 'Entregue' }
  if (i.situacao === 'em_carga') return { classe: 'ok', texto: 'Na carga' }
  if (i.situacao === 'brinde') return { classe: 'ok', texto: 'Brinde' }
  if (i.estoque === 'ok') return { classe: 'ok', texto: 'Em estoque' }
  if (i.estoque === 'tem_no_estoque') return { classe: 'livre', texto: `Tem no estoque (${formatarQtd(i.estoque_livre)} livre)` }
  if (i.previsao_fabricante) return { classe: 'falta', texto: `Sem estoque · fábrica ${diaMes(i.previsao_fabricante)}` }
  return { classe: 'falta', texto: i.tem_pedido_compra ? 'Sem estoque · fábrica sem data' : 'Sem estoque · sem pedido de compra' }
}

function formatarQtd(n: number) {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR')
}

export type ResumoEntregas = Record<Selo, number> & { total: number }

export function resumoEntregas(lista: Pick<Entrega, 'prontidao' | 'aguardando' | 'aguardando_com_estoque'>[]): ResumoEntregas {
  const r: ResumoEntregas = { total: 0, entregue: 0, pronto: 0, tem_no_estoque: 0, aguardando: 0, risco: 0 }
  for (const e of lista) {
    r.total++
    r[seloDaEntrega(e)]++
  }
  return r
}

/** Link do Google Maps para o endereço da entrega. */
export function linkMapa(e: Pick<Entrega, 'endereco' | 'bairro' | 'cidade' | 'estado' | 'cep'>) {
  const partes = [e.endereco, e.bairro, e.cidade, e.estado, e.cep].filter(Boolean).join(', ')
  return partes ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(partes)}` : null
}
