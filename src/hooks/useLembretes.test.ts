import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ perfil: null }) }))

const { filtrarLembretes } = await import('./useLembretes')

const AGORA = new Date('2026-11-11T14:00:00-03:00').getTime()
const minutos = (m: number) => new Date(AGORA + m * 60_000).toISOString()

function ag(id: string, inicio: string, extra: Record<string, unknown> = {}) {
  return { id, inicio, vendedor_id: 'eu', status: 'agendado', ...extra } as never
}

describe('filtrarLembretes', () => {
  it('pega só os meus, ainda "Agendado", que começam na próxima hora, em ordem', () => {
    const lista = [
      ag('daqui-50', minutos(50)),
      ag('daqui-10', minutos(10)),
      ag('daqui-60', minutos(60)),
      ag('daqui-61', minutos(61)),
      ag('ja-passou', minutos(-5)),
      ag('confirmado', minutos(20), { status: 'confirmado' }),
      ag('cancelado', minutos(20), { status: 'cancelado' }),
      ag('de-outro', minutos(20), { vendedor_id: 'outro' }),
    ]
    expect(filtrarLembretes(lista, 'eu', AGORA).map((a: { id: string }) => a.id)).toEqual([
      'daqui-10',
      'daqui-50',
      'daqui-60',
    ])
  })
})
