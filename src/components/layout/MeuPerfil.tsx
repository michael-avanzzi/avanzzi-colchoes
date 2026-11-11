import { useRef, useState } from 'react'
import { Camera, LogOut, Trash2 } from 'lucide-react'

import { useAuth } from '../../auth/AuthProvider'
import { invalidarCadastros } from '../../hooks/useCadastros'
import { removerFoto, trocarFoto } from '../../lib/fotos'
import { mensagemDeErro } from '../../lib/supabase'
import { PAPEL_ROTULO } from '../../types/auth'
import { Avatar } from '../ui/Avatar'
import { Modal } from '../ui/Modal'
import { AtivarNotificacoes } from './AtivarNotificacoes'

type Props = { aberto: boolean; onFechar: () => void }

/** Foto, dados e notificações do usuário logado. */
export function MeuPerfil({ aberto, onFechar }: Props) {
  const { perfil, recarregarPerfil, signOut } = useAuth()
  const entrada = useRef<HTMLInputElement>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  if (!perfil?.allowed) return null
  const foto = perfil.foto_path ?? null

  async function escolher(arquivo: File | undefined) {
    if (!arquivo || !perfil?.allowed) return
    setErro(null)
    setOcupado(true)
    try {
      await trocarFoto(perfil.id, arquivo, foto)
      invalidarCadastros()
      await recarregarPerfil()
    } catch (error) {
      setErro(mensagemDeErro(error))
    } finally {
      setOcupado(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  async function remover() {
    if (!perfil?.allowed) return
    setErro(null)
    setOcupado(true)
    try {
      await removerFoto(perfil.id, foto)
      invalidarCadastros()
      await recarregarPerfil()
    } catch (error) {
      setErro(mensagemDeErro(error))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Modal titulo="Meu perfil" aberto={aberto} onFechar={onFechar}>
      {aberto && (
        <div className="form">
          <div className="perfil-topo">
            <Avatar nome={perfil.nome} fotoPath={foto} tamanho={88} />
            <div className="perfil-dados">
              <strong>{perfil.nome}</strong>
              <span className="texto-suave">{perfil.email}</span>
              <span className="texto-suave">{PAPEL_ROTULO[perfil.papel]}</span>
            </div>
          </div>

          <div className="detalhe-acoes">
            <input
              ref={entrada}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => void escolher(e.target.files?.[0])}
            />
            <button type="button" className="botao botao-secundario" onClick={() => entrada.current?.click()} disabled={ocupado}>
              {ocupado ? <span className="spinner" aria-hidden /> : <Camera size={16} aria-hidden />}
              {foto ? 'Trocar foto' : 'Adicionar foto'}
            </button>
            {foto && (
              <button type="button" className="botao botao-secundario botao-perigo" onClick={() => void remover()} disabled={ocupado}>
                <Trash2 size={16} aria-hidden /> Remover foto
              </button>
            )}
          </div>
          {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}

          <AtivarNotificacoes />

          <div className="modal-acoes">
            <button type="button" className="botao botao-secundario" onClick={() => void signOut()}>
              <LogOut size={16} aria-hidden /> Sair
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
