import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { AvisosApp } from './components/layout/AvisosApp'
import { LimiteDeErro } from './components/layout/LimiteDeErro'
import { instalarCapturaGlobal } from './lib/erros'
import './styles/index.css'
import './styles/agenda.css'
import './styles/painel.css'
import './styles/perfil.css'

instalarCapturaGlobal()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LimiteDeErro>
      <App />
      <AvisosApp />
    </LimiteDeErro>
  </StrictMode>,
)
