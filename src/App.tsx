import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { CalendarioPage } from './pages/CalendarioPage'
import { KanbanPage } from './pages/KanbanPage'
import { LoginPage } from './pages/LoginPage'
import { PainelPage } from './pages/PainelPage'
import { RankingPage } from './pages/RankingPage'
import { RankingTvPage } from './pages/RankingTvPage'
import { UsuariosPage } from './pages/UsuariosPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Tela cheia para a TV da sala de vendas (fora do menu). */}
          <Route
            path="/ranking/tv"
            element={
              <ProtectedRoute>
                <RankingTvPage />
              </ProtectedRoute>
            }
          />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<KanbanPage />} />
            <Route path="calendario" element={<CalendarioPage />} />
            <Route
              path="ranking"
              element={
                <ProtectedRoute papeis={['vendedor', 'gerente', 'admin']}>
                  <RankingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="painel"
              element={
                <ProtectedRoute papeis={['gerente', 'admin']}>
                  <PainelPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="usuarios"
              element={
                <ProtectedRoute papeis={['admin']}>
                  <UsuariosPage />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
