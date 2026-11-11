/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /** Preenchida no build (commit ou data); aparece nos registros de erro. */
  readonly VITE_VERSAO_APP?: string
}
