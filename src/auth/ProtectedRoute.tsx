import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from './AuthProvider'
import { TrocarSenhaPage } from '../pages/TrocarSenhaPage'
import type { Papel } from '../types/auth'

type Props = {
  children: ReactNode
  /** Restringe a rota a estes papéis (a regra real é aplicada no banco). */
  papeis?: Papel[]
}

export function ProtectedRoute({ children, papeis }: Props) {
  const { loading, session, perfil } = useAuth()

  if (loading) {
    return (
      <div className="tela-cheia">
        <div className="carregando" role="status">
          <span className="spinner" aria-hidden />
          Verificando sua sessão…
        </div>
      </div>
    )
  }

  if (!session || !perfil?.allowed) {
    return <Navigate to="/login" replace />
  }

  if (perfil.trocar_senha) {
    return <TrocarSenhaPage />
  }

  if (papeis && !papeis.includes(perfil.papel)) {
    return <Navigate to="/" replace />
  }

  return children
}
