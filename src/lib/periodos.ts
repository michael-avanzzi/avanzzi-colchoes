import { inicioDaSemana, inicioDoDia, paraInputData, somarDias } from './datas'
import type { Agrupamento } from '../services/indicadores.service'

/** Primeiro instante do grupo (dia, semana a partir de segunda, ou mês) que contém d. */
export function inicioDoGrupo(d: Date, agrupar: Agrupamento) {
  if (agrupar === 'semana') return inicioDaSemana(d)
  if (agrupar === 'mes') return new Date(d.getFullYear(), d.getMonth(), 1)
  return inicioDoDia(d)
}

export function proximoGrupo(d: Date, agrupar: Agrupamento) {
  if (agrupar === 'semana') return somarDias(d, 7)
  if (agrupar === 'mes') return new Date(d.getFullYear(), d.getMonth() + 1, 1)
  return somarDias(d, 1)
}

/**
 * Todas as chaves (yyyy-mm-dd) do período, inclusive as sem agendamento,
 * para o gráfico não "pular" dias vazios. Mesmo formato do banco.
 */
export function chavesDoPeriodo(inicio: Date, fim: Date, agrupar: Agrupamento): string[] {
  const chaves: string[] = []
  for (let d = inicioDoGrupo(inicio, agrupar); d < fim; d = proximoGrupo(d, agrupar)) {
    chaves.push(paraInputData(d))
    if (chaves.length > 500) break
  }
  return chaves
}

/** Agrupamento adequado ao tamanho do período. */
export function agrupamentoPara(inicio: Date, fim: Date): Agrupamento {
  const dias = (fim.getTime() - inicio.getTime()) / 86_400_000
  if (dias > 180) return 'mes'
  if (dias > 62) return 'semana'
  return 'dia'
}

const fmtDiaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const fmtMesAno = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' })
const fmtDiaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })

/** Rótulo curto de uma chave yyyy-mm-dd. */
export function rotuloDoGrupo(chave: string, agrupar: Agrupamento, longo = false) {
  const [a, m, d] = chave.split('-').map(Number)
  const data = new Date(a, m - 1, d)
  if (agrupar === 'mes') return fmtMesAno.format(data).replace('.', '')
  if (agrupar === 'semana') return `${longo ? 'Semana de ' : ''}${fmtDiaMes.format(data)}`
  return longo ? fmtDiaSemana.format(data) : fmtDiaMes.format(data)
}
