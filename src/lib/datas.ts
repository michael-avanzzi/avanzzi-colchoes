/** Datas no padrão brasileiro. O app usa o fuso do aparelho (a loja fica no Brasil). */

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
const fmtDiaCurto = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const fmtCompleto = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatarDataHora = (iso: string) => fmtDataHora.format(new Date(iso))
export const formatarHora = (iso: string) => fmtHora.format(new Date(iso))
export const formatarDia = (d: Date) => fmtDia.format(d)
export const formatarDiaCurto = (d: Date) => fmtDiaCurto.format(d)
export const formatarCompleto = (iso: string) => fmtCompleto.format(new Date(iso))
export const formatarMoeda = (v: number) => fmtMoeda.format(v)

export function inicioDoDia(d: Date) {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export function somarDias(d: Date, dias: number) {
  const r = new Date(d)
  r.setDate(r.getDate() + dias)
  return r
}

/** Segunda-feira da semana de d. */
export function inicioDaSemana(d: Date) {
  const r = inicioDoDia(d)
  const dia = (r.getDay() + 6) % 7
  return somarDias(r, -dia)
}

const dois = (n: number) => String(n).padStart(2, '0')

/** yyyy-mm-dd para <input type="date">. */
export function paraInputData(d: Date) {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

/** hh:mm para <input type="time">. */
export function paraInputHora(d: Date) {
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`
}

/** Junta data e hora locais em ISO (UTC) para o banco. */
export function combinarDataHora(data: string, hora: string) {
  const [a, m, d] = data.split('-').map(Number)
  const [h, min] = hora.split(':').map(Number)
  return new Date(a, m - 1, d, h, min).toISOString()
}

/** Próximo horário "redondo" (de 30 em 30 min) a partir de agora. */
export function proximoHorario() {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60)
  return d
}
