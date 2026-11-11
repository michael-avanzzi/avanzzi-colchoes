import { supabase } from './supabase'

const VERSAO_APP = import.meta.env.VITE_VERSAO_APP ?? 'dev'

/**
 * Envia um erro inesperado para a tabela erros_app (somente admin lê).
 * Nunca lança: falhar ao registrar não pode quebrar a tela.
 */
export function registrarErro(erro: unknown, contexto?: string) {
  try {
    const e = erro instanceof Error ? erro : new Error(String(erro))
    const mensagem = contexto ? `${contexto}: ${e.message}` : e.message
    console.error('[Erro]', mensagem, e)

    void supabase
      .rpc('rpc_registrar_erro', {
        p_mensagem: mensagem,
        p_detalhe: e.stack ?? null,
        p_tela: window.location.pathname,
        p_navegador: navigator.userAgent,
        p_versao_app: VERSAO_APP,
      })
      .then(({ error }) => {
        if (error) console.warn('[Erro] não registrado:', error.message)
      })
  } catch {
    // sem ação: o registro de erro é o melhor esforço
  }
}

/** Captura erros não tratados de toda a aplicação. */
export function instalarCapturaGlobal() {
  window.addEventListener('error', (evento) => registrarErro(evento.error ?? evento.message, 'window.error'))
  window.addEventListener('unhandledrejection', (evento) => registrarErro(evento.reason, 'promise'))
}
