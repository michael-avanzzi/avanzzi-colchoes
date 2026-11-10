import { useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'

import { useAuth } from '../auth/AuthProvider'
import { mensagemDeErro, supabase } from '../lib/supabase'
import { Logo } from '../components/layout/Logo'

/** Exibida quando o usuário entrou com senha temporária. */
export function TrocarSenhaPage() {
  const { recarregarPerfil, signOut } = useAuth()
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(event: FormEvent) {
    event.preventDefault()
    setErro(null)

    if (senha.length < 8) return setErro('A nova senha precisa ter pelo menos 8 caracteres.')
    if (senha !== confirmacao) return setErro('As senhas não conferem.')

    setEnviando(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error

      const { error: rpcError } = await supabase.rpc('rpc_senha_alterada')
      if (rpcError) throw rpcError

      await supabase.auth.refreshSession()
      await recarregarPerfil()
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
        <h1 className="login-titulo">Crie sua senha</h1>
        <p className="login-subtitulo">
          Você entrou com uma senha temporária. Defina uma senha pessoal para continuar.
        </p>

        <form onSubmit={salvar} className="form" noValidate>
          <label className="campo">
            <span>Nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </label>
          <label className="campo">
            <span>Confirme a nova senha</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
            />
          </label>

          {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}

          <button type="submit" className="botao botao-primario botao-largo" disabled={enviando}>
            <KeyRound size={18} aria-hidden />
            {enviando ? 'Salvando…' : 'Salvar nova senha'}
          </button>
          <button type="button" className="botao botao-texto" onClick={() => void signOut()}>
            Sair
          </button>
        </form>
      </section>
    </main>
  )
}
