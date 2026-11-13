import type { Agendamento } from '../types/agendamento'

export type Horario = { inicio: Date; livre: boolean }

type Expediente = { abre: string; fecha: string; intervaloMin: number }

/** Cancelado, reagendado e falta liberam o horário; o resto ocupa. */
function ocupaHorario(a: Pick<Agendamento, 'status'>) {
  return a.status !== 'cancelado' && a.status !== 'reagendado' && a.status !== 'nao_compareceu'
}

function naHora(dia: Date, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(dia)
  d.setHours(h, m, 0, 0)
  return d
}

/**
 * Horários do expediente de um dia para um vendedor, marcando cada um como
 * livre ou ocupado. Um horário fica ocupado quando qualquer parte dele
 * coincide com um atendimento do vendedor. Se `agora` cair no próprio dia,
 * os horários que já começaram ficam de fora.
 */
export function horariosDoDia(
  dia: Date,
  vendedorId: string,
  agendamentos: Pick<Agendamento, 'vendedor_id' | 'inicio' | 'duracao_min' | 'status'>[],
  expediente: Expediente,
  agora: Date = new Date(),
): Horario[] {
  const passo = expediente.intervaloMin * 60000
  const abre = naHora(dia, expediente.abre).getTime()
  const fecha = naHora(dia, expediente.fecha).getTime()

  const ocupados = agendamentos
    .filter((a) => a.vendedor_id === vendedorId && ocupaHorario(a))
    .map((a) => {
      const ini = new Date(a.inicio).getTime()
      return [ini, ini + a.duracao_min * 60000] as const
    })

  const horarios: Horario[] = []
  for (let t = abre; t + passo <= fecha; t += passo) {
    if (t < agora.getTime()) continue
    const livre = !ocupados.some(([ini, fim]) => ini < t + passo && fim > t)
    horarios.push({ inicio: new Date(t), livre })
  }
  return horarios
}
