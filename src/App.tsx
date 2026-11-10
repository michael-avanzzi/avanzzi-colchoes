import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { EmConstrucaoPage } from './pages/EmConstrucaoPage'
import { CalendarioPage } from './pages/CalendarioPage'
import { KanbanPage } from './pages/KanbanPage'
import { LoginPage } from './pages/LoginPage'
import { UsuariosPage } from './pages/UsuariosPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

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
              path="painel"
              element={
                <ProtectedRoute papeis={['gerente', 'admin']}>
                  <EmConstrucaoPage
                    titulo="Painel de controle"
                    etapa="Etapa 4"
                    descricao="Agendamentos, comparecimento e conversão por período e por vendedor."
                  />
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
