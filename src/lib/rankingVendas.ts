import type { RankingVendas, VendedorRanking } from '../services/ranking.service'

/** Data de hoje em Brasília, no formato AAAA-MM-DD (independe do fuso do aparelho). */
export function hojeBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora)
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export type PresetPeriodo = 'hoje' | '7d' | 'mes' | 'mes-passado' | 'ano'

export const PRESETS: [PresetPeriodo, string][] = [
  ['hoje', 'Hoje'],
  ['7d', '7 dias'],
  ['mes', 'Este mês'],
  ['mes-passado', 'Mês passado'],
  ['ano', 'Este ano'],
]

/** Início e fim (inclusive) de um período rápido, a partir de "hoje" em AAAA-MM-DD. */
export function periodoDoPreset(preset: PresetPeriodo, hoje: string): { inicio: string; fim: string } {
  const [a, m, d] = hoje.split('-').map(Number)
  if (preset === 'hoje') return { inicio: hoje, fim: hoje }
  if (preset === '7d') return { inicio: iso(new Date(Date.UTC(a, m - 1, d - 6))), fim: hoje }
  if (preset === 'mes-passado') {
    return { inicio: iso(new Date(Date.UTC(a, m - 2, 1))), fim: iso(new Date(Date.UTC(a, m - 1, 0))) }
  }
  if (preset === 'ano') return { inicio: `${a}-01-01`, fim: hoje }
  return { inicio: iso(new Date(Date.UTC(a, m - 1, 1))), fim: hoje }
}

export type MetaLoja = {
  meta: number | null
  vendido: number
  pct: number | null
  falta: number | null
  porDia: number | null
  diasRestantes: number
  /** Onde a loja deveria estar hoje, em % da meta, vendendo o mesmo valor todo dia. */
  ritmoPct: number
  noRitmo: boolean
}

export function calcularMetaLoja(mes: RankingVendas['mes']): MetaLoja {
  const meta = mes.meta && mes.meta > 0 ? mes.meta : null
  const pct = meta ? (100 * mes.valor) / meta : null
  const falta = meta ? Math.max(0, meta - mes.valor) : null
  const porDia = meta && falta && mes.dias_restantes > 0 ? falta / mes.dias_restantes : null
  const ritmoPct = mes.dias_mes > 0 ? (100 * mes.dias_passados) / mes.dias_mes : 0
  return {
    meta,
    vendido: mes.valor,
    pct,
    falta,
    porDia,
    diasRestantes: mes.dias_restantes,
    ritmoPct,
    noRitmo: pct !== null && pct >= ritmoPct,
  }
}

/** Variação percentual; null quando não há base de comparação. */
export function variacao(atual: number, anterior: number) {
  return anterior > 0 ? (100 * (atual - anterior)) / anterior : null
}

export function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] || nome
}

export function bateuMetaDoDia(v: Pick<VendedorRanking, 'hoje_valor' | 'meta_diaria'>) {
  return v.meta_diaria !== null && v.meta_diaria > 0 && v.hoje_valor >= v.meta_diaria
}

export type AvisoRanking =
  | { tipo: 'lider'; vendedor: VendedorRanking; chave: string }
  | { tipo: 'meta'; vendedor: VendedorRanking; chave: string }

/**
 * Avisos para mostrar na tela, comparando com o que esta tela já viu:
 * - "lider": o 1º lugar do período mudou desde a última atualização;
 * - "meta": um vendedor bateu a meta do dia e esta tela ainda não comemorou.
 * O primeiro carregamento de um período só registra o líder, sem aviso.
 */
export function detectarAvisos(
  dados: RankingVendas,
  liderAnterior: string | null | undefined,
  metasJaVistas: ReadonlySet<string>,
): { avisos: AvisoRanking[]; lider: string | null } {
  const avisos: AvisoRanking[] = []
  const lider = dados.vendedores.find((v) => v.posicao === 1 && v.valor > 0) ?? null
  if (lider && liderAnterior && liderAnterior !== lider.vendedor_id) {
    avisos.push({ tipo: 'lider', vendedor: lider, chave: `lider:${dados.periodo.inicio}:${lider.vendedor_id}` })
  }
  for (const v of dados.vendedores) {
    const chave = `meta:${dados.hoje}:${v.vendedor_id}`
    if (bateuMetaDoDia(v) && !metasJaVistas.has(chave)) avisos.push({ tipo: 'meta', vendedor: v, chave })
  }
  return { avisos, lider: lider?.vendedor_id ?? null }
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_LONGOS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** '2026-11-23' -> '23 nov' */
export function dataCurta(d: string) {
  const [, m, dia] = d.split('-').map(Number)
  return `${dia} ${MESES[m - 1]}`
}

/** '2026-11-23' -> 'novembro' */
export function nomeDoMes(d: string) {
  return MESES_LONGOS[Number(d.slice(5, 7)) - 1] ?? ''
}

export function textoPeriodo(inicio: string, fim: string) {
  if (inicio === fim) return dataCurta(inicio)
  return `${dataCurta(inicio)} a ${dataCurta(fim)}`
}

const moedaMsg = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const pctMsg = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const horaMsg = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const MEDALHAS = ['🥇', '🥈', '🥉']

/**
 * Mensagem do ranking atual para o grupo de vendas no WhatsApp
 * (*negrito* e _itálico_ no formato do WhatsApp). Não inclui margem nem custo.
 */
export function montarMensagemRanking(dados: RankingVendas) {
  const { periodo, vendedores, mes } = dados
  const linhas: string[] = [
    '🏆 *Ranking de vendas · Avanzzi*',
    `📅 ${textoPeriodo(periodo.inicio, periodo.fim)} · atualizado às ${horaMsg.format(new Date(dados.gerado_em))}`,
    '',
  ]

  const comVenda = vendedores.filter((v) => v.valor > 0)
  if (comVenda.length === 0) {
    linhas.push('Nenhuma venda no período ainda.')
  } else {
    for (const v of vendedores) {
      const posicao = MEDALHAS[v.posicao - 1] ?? `${v.posicao}º`
      const pedidos = v.pedidos === 1 ? '1 pedido' : `${v.pedidos} pedidos`
      const texto = `${posicao} ${v.posicao <= 3 ? `*${primeiroNome(v.nome)}*` : primeiroNome(v.nome)} · ${moedaMsg.format(v.valor)} (${pedidos})`
      linhas.push(texto)
    }
  }

  if (mes.meta && mes.meta > 0) {
    const pct = (100 * mes.valor) / mes.meta
    const falta = Math.max(0, mes.meta - mes.valor)
    linhas.push('', `🎯 *Meta de ${nomeDoMes(mes.inicio)}:* ${moedaMsg.format(mes.valor)} de ${moedaMsg.format(mes.meta)} (${pctMsg.format(pct)}%)`)
    if (falta === 0) {
      linhas.push('✅ Meta do mês batida!')
    } else {
      linhas.push(`Faltam ${moedaMsg.format(falta)}`)
      if (mes.meta_dia_loja && mes.meta_dia_loja > 0) {
        const porVendedor = mes.meta_dia_vendedor ? ` · ${moedaMsg.format(mes.meta_dia_vendedor)} por vendedor` : ''
        linhas.push(`Meta de hoje: ${moedaMsg.format(mes.meta_dia_loja)}${porVendedor}`)
      }
    }
  }

  const bateram = vendedores.filter((v) => bateuMetaDoDia(v))
  if (bateram.length > 0) {
    linhas.push(
      '',
      `🔥 *Bateram a meta de hoje:* ${bateram.map((v) => `${primeiroNome(v.nome)} (${moedaMsg.format(v.hoje_valor)})`).join(', ')}`,
    )
  }

  linhas.push('', '_Enviado pelo Avanzzi Mobile_')
  return linhas.join('\n')
}
