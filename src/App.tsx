import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { EmConstrucaoPage } from './pages/EmConstrucaoPage'
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
            <Route
              index
              element={
                <EmConstrucaoPage
                  titulo="Kanban"
                  etapa="Etapa 2"
                  descricao="Cartões dos agendamentos organizados por etapa do atendimento."
                />
              }
            />
            <Route
              path="calendario"
              element={
                <EmConstrucaoPage
                  titulo="Calendário"
                  etapa="Etapa 2"
                  descricao="Visões diária, semanal e mensal, com filtro por vendedor e status."
                />
              }
            />
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
