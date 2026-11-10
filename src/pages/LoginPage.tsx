import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'

import { useAuth } from '../auth/AuthProvider'
import { mensagemDeErro } from '../lib/supabase'
import { Logo } from '../components/layout/Logo'

export function LoginPage() {
  const { session, perfil, loading, signIn } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (!loading && session && perfil?.allowed) {
    return <Navigate to="/" replace />
  }

  async function entrar(event: FormEvent) {
    event.preventDefault()
    setErro(null)
    setEnviando(true)

    try {
      const p = await signIn(email, senha)
      if (!p.allowed) {
        setErro(p.message)
        return
      }
      navigate('/', { replace: true })
    } catch (error) {
      setErro(mensagemDeErro(error))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="login">
      <section className="login-card">
        <Logo grande />
        <p className="login-subtitulo">Agenda de atendimentos da loja</p>

        <form onSubmit={entrar} className="form" noValidate>
          <label className="campo">
            <span>E-mail</span>
            <input
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="campo">
            <span>Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />
          </label>

          {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}

          <button
            type="submit"
            className="botao botao-primario botao-largo"
            disabled={enviando || !email || !senha}
          >
            {enviando ? <span className="spinner" aria-hidden /> : <LogIn size={18} aria-hidden />}
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  )
}
