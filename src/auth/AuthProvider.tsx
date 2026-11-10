import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'
import type { MeuPerfil } from '../types/auth'

type AuthContextValue = {
  loading: boolean
  session: Session | null
  perfil: MeuPerfil | null
  signIn: (email: string, password: string) => Promise<MeuPerfil>
  signOut: () => Promise<void>
  recarregarPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function buscarPerfil(): Promise<MeuPerfil> {
  const { data, error } = await supabase.rpc('rpc_meu_perfil')
  if (error) throw error
  return data as MeuPerfil
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<MeuPerfil | null>(null)

  useEffect(() => {
    let ativo = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!ativo) return
      setSession(nextSession)

      if (!nextSession) {
        setPerfil(null)
        setLoading(false)
        return
      }

      // Fora do callback: evita deadlock do supabase-js ao chamar o banco aqui dentro.
      window.setTimeout(() => {
        buscarPerfil()
          .then((p) => ativo && setPerfil(p))
          .catch((error) => {
            console.error('[Auth] Falha ao carregar perfil:', error)
            if (ativo) setPerfil({ allowed: false, message: 'Não foi possível carregar o seu perfil.' })
          })
          .finally(() => ativo && setLoading(false))
      }, 0)
    })

    return () => {
      ativo = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error

    const p = await buscarPerfil()
    setPerfil(p)

    if (!p.allowed) {
      await supabase.auth.signOut()
    }
    return p
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setPerfil(null)
  }, [])

  const recarregarPerfil = useCallback(async () => {
    setPerfil(await buscarPerfil())
  }, [])

  const value = useMemo(
    () => ({ loading, session, perfil, signIn, signOut, recarregarPerfil }),
    [loading, session, perfil, signIn, signOut, recarregarPerfil],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider.')
  return ctx
}
