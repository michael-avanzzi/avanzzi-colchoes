import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error(
    'Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.local (veja .env.example).',
  )
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** Converte erros do Supabase/Postgres em mensagens para o usuário. */
export function mensagemDeErro(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message)
    const code = 'code' in error ? String((error as { code: unknown }).code) : ''
    if (code === 'PGRST202') {
      return 'Função do banco não encontrada. Aplique as migrações pendentes no Supabase.'
    }
    if (message === 'Invalid login credentials') return 'E-mail ou senha incorretos.'
    if (message.includes('Failed to fetch')) return 'Sem conexão com o servidor. Verifique a internet.'
    return message
  }
  return 'Ocorreu um erro inesperado.'
}
