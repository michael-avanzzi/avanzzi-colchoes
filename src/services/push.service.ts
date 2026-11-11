import { supabase } from '../lib/supabase'

const CHAVE_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

export type EstadoPush =
  | { tipo: 'indisponivel'; motivo: string }
  | { tipo: 'bloqueado' }
  | { tipo: 'inativo' }
  | { tipo: 'ativo' }

const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const instalado = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

function base64UrlParaBytes(base64: string) {
  const preenchido = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const bruto = atob(preenchido)
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0))
}

async function registro() {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export async function estadoPush(): Promise<EstadoPush> {
  if (!CHAVE_PUBLICA) return { tipo: 'indisponivel', motivo: 'Notificações ainda não configuradas neste ambiente.' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    if (ehIOS() && !instalado()) {
      return {
        tipo: 'indisponivel',
        motivo: 'No iPhone, instale o app na Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá.',
      }
    }
    return { tipo: 'indisponivel', motivo: 'Este navegador não recebe notificações.' }
  }
  const reg = await registro()
  if (!reg) return { tipo: 'indisponivel', motivo: 'Disponível no app publicado (não no ambiente de desenvolvimento).' }
  if (Notification.permission === 'denied') return { tipo: 'bloqueado' }
  const inscricao = await reg.pushManager.getSubscription()
  return inscricao && Notification.permission === 'granted' ? { tipo: 'ativo' } : { tipo: 'inativo' }
}

/** Pede permissão (precisa vir de um clique) e registra este aparelho para o usuário logado. */
export async function ativarPush() {
  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') throw new Error('Permissão de notificação não concedida.')

  const reg = await registro()
  if (!reg) throw new Error('Service worker não encontrado. Recarregue o app.')

  const inscricao =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlParaBytes(CHAVE_PUBLICA),
    }))

  const json = inscricao.toJSON()
  const { error } = await supabase.rpc('rpc_salvar_inscricao_push', {
    p_endpoint: inscricao.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_navegador: navigator.userAgent,
  })
  if (error) throw error
}

/** Para de receber neste aparelho (também usado ao sair da conta). */
export async function desativarPush() {
  const reg = await registro()
  const inscricao = await reg?.pushManager.getSubscription()
  if (!inscricao) return
  await supabase.rpc('rpc_remover_inscricao_push', { p_endpoint: inscricao.endpoint })
  await inscricao.unsubscribe()
}
