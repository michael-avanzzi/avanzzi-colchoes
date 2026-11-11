import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, Check, Copy, KeyRound, Pencil, Trash2, UserPlus } from 'lucide-react'

import { useAuth } from '../auth/AuthProvider'
import { Avatar } from '../components/ui/Avatar'
import { Modal } from '../components/ui/Modal'
import { invalidarCadastros } from '../hooks/useCadastros'
import { removerFoto, trocarFoto } from '../lib/fotos'
import { mensagemDeErro } from '../lib/supabase'
import {
  atualizarUsuario,
  criarUsuario,
  listarUsuarios,
  redefinirSenha,
  type SenhaGerada,
  type Usuario,
} from '../services/usuarios.service'
import { PAPEL_ROTULO, type Papel } from '../types/auth'

const PAPEIS: Papel[] = ['vendedor', 'gerente', 'admin']

type Formulario = {
  id?: string
  nome: string
  email: string
  telefone: string
  papel: Papel
  ativo: boolean
  foto_path?: string | null
}

const VAZIO: Formulario = { nome: '', email: '', telefone: '', papel: 'vendedor', ativo: true }

export function UsuariosPage() {
  const { perfil, recarregarPerfil } = useAuth()
  const entradaFoto = useRef<HTMLInputElement>(null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const meuId = perfil?.allowed ? perfil.id : null

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroLista, setErroLista] = useState<string | null>(null)

  const [form, setForm] = useState<Formulario | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)

  const [senha, setSenha] = useState<SenhaGerada | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [redefinindo, setRedefinindo] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const lista = await listarUsuarios()
      setUsuarios(lista)
      setErroLista(null)
    } catch (error) {
      setErroLista(mensagemDeErro(error))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    let ativo = true
    listarUsuarios()
      .then((lista) => ativo && setUsuarios(lista))
      .catch((error) => ativo && setErroLista(mensagemDeErro(error)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [])

  function abrirNovo() {
    setErroForm(null)
    setForm(VAZIO)
  }

  function abrirEdicao(u: Usuario) {
    setErroForm(null)
    setForm({ id: u.id, nome: u.nome, email: u.email, telefone: u.telefone ?? '', papel: u.papel, ativo: u.ativo, foto_path: u.foto_path })
  }

  async function salvar(event: FormEvent) {
    event.preventDefault()
    if (!form) return
    setErroForm(null)

    if (form.nome.trim().length < 2) return setErroForm('Informe o nome.')
    if (!form.id && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return setErroForm('Informe um e-mail válido.')
    }

    setSalvando(true)
    try {
      if (form.id) {
        await atualizarUsuario({
          id: form.id,
          nome: form.nome,
          telefone: form.telefone,
          papel: form.papel,
          ativo: form.ativo,
        })
      } else {
        const gerada = await criarUsuario({
          nome: form.nome.trim(),
          email: form.email.trim(),
          telefone: form.telefone.trim(),
          papel: form.papel,
        })
        setCopiado(false)
        setSenha(gerada)
      }
      invalidarCadastros()
      setForm(null)
      await carregar()
    } catch (error) {
      setErroForm(mensagemDeErro(error))
    } finally {
      setSalvando(false)
    }
  }

  /** Troca (arquivo) ou remove (null) a foto do usuário em edição. Salva na hora. */
  async function mudarFoto(arquivo: File | null | undefined) {
    if (!form?.id || arquivo === undefined) return
    setErroForm(null)
    setEnviandoFoto(true)
    try {
      const novo = arquivo
        ? await trocarFoto(form.id, arquivo, form.foto_path ?? null)
        : (await removerFoto(form.id, form.foto_path ?? null), null)
      setForm({ ...form, foto_path: novo })
      invalidarCadastros()
      if (form.id === meuId) await recarregarPerfil()
      await carregar()
    } catch (error) {
      setErroForm(mensagemDeErro(error))
    } finally {
      setEnviandoFoto(false)
      if (entradaFoto.current) entradaFoto.current.value = ''
    }
  }

  async function gerarNovaSenha(u: Usuario) {
    if (!window.confirm(`Gerar uma nova senha temporária para ${u.nome}? A senha atual deixará de funcionar.`)) {
      return
    }
    setRedefinindo(u.id)
    try {
      setCopiado(false)
      setSenha(await redefinirSenha(u.id))
    } catch (error) {
      window.alert(mensagemDeErro(error))
    } finally {
      setRedefinindo(null)
    }
  }

  async function copiar() {
    if (!senha) return
    try {
      await navigator.clipboard.writeText(senha.senha_temporaria)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  const pendentes = usuarios.filter((u) => !u.ativo).length

  return (
    <section className="pagina">
      <header className="pagina-cabecalho pagina-cabecalho-acoes">
        <div>
          <h1>Usuários</h1>
          <p className="texto-suave">
            {usuarios.length} cadastrado(s){pendentes > 0 && ` · ${pendentes} sem acesso`}
          </p>
        </div>
        <button type="button" className="botao botao-primario" onClick={abrirNovo}>
          <UserPlus size={18} aria-hidden />
          Novo usuário
        </button>
      </header>

      {carregando && (
        <div className="carregando" role="status">
          <span className="spinner" aria-hidden /> Carregando usuários…
        </div>
      )}

      {erroLista && (
        <p className="alerta alerta-erro" role="alert">
          {erroLista}{' '}
          <button type="button" className="botao-link" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </p>
      )}

      {!carregando && !erroLista && (
        <ul className="lista-usuarios">
          {usuarios.map((u) => (
            <li key={u.id} className={u.ativo ? 'cartao-usuario' : 'cartao-usuario inativo'}>
              <Avatar nome={u.nome} fotoPath={u.foto_path} tamanho={36} className="usuario-avatar" />
              <div className="cartao-usuario-dados">
                <strong>
                  {u.nome}
                  {u.id === meuId && <span className="texto-suave"> (você)</span>}
                </strong>
                <span className="texto-suave">{u.email}</span>
                {u.telefone && <span className="texto-suave">{u.telefone}</span>}
              </div>
              <div className="cartao-usuario-etiquetas">
                <span className={`etiqueta etiqueta-${u.papel}`}>{PAPEL_ROTULO[u.papel]}</span>
                {!u.ativo && <span className="etiqueta etiqueta-inativo">Sem acesso</span>}
              </div>
              <div className="cartao-usuario-acoes">
                <button
                  type="button"
                  className="botao-icone escuro"
                  onClick={() => abrirEdicao(u)}
                  title="Editar"
                  aria-label={`Editar ${u.nome}`}
                >
                  <Pencil size={18} />
                </button>
                <button
                  type="button"
                  className="botao-icone escuro"
                  onClick={() => void gerarNovaSenha(u)}
                  disabled={redefinindo === u.id}
                  title="Gerar senha temporária"
                  aria-label={`Gerar senha temporária para ${u.nome}`}
                >
                  {redefinindo === u.id ? <span className="spinner" aria-hidden /> : <KeyRound size={18} />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal titulo={form?.id ? 'Editar usuário' : 'Novo usuário'} aberto={form !== null} onFechar={() => setForm(null)}>
        {form && (
          <form className="form" onSubmit={salvar} noValidate>
            {form.id && (
              <div className="foto-edicao">
                <Avatar nome={form.nome || '?'} fotoPath={form.foto_path} tamanho={64} />
                <input
                  ref={entradaFoto}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => void mudarFoto(e.target.files?.[0])}
                />
                <button type="button" className="botao botao-secundario botao-pequeno" onClick={() => entradaFoto.current?.click()} disabled={enviandoFoto}>
                  {enviandoFoto ? <span className="spinner" aria-hidden /> : <Camera size={16} aria-hidden />}
                  {form.foto_path ? 'Trocar foto' : 'Adicionar foto'}
                </button>
                {form.foto_path && (
                  <button type="button" className="botao-icone escuro" onClick={() => void mudarFoto(null)} disabled={enviandoFoto} aria-label="Remover foto" title="Remover foto">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            )}
            <label className="campo">
              <span>Nome</span>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus />
            </label>
            <label className="campo">
              <span>E-mail (login)</span>
              <input
                type="email"
                inputMode="email"
                value={form.email}
                disabled={Boolean(form.id)}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="campo">
              <span>Celular (WhatsApp)</span>
              <input
                type="tel"
                inputMode="tel"
                placeholder="(11) 99999-9999"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
            </label>
            <label className="campo">
              <span>Papel</span>
              <select
                value={form.papel}
                disabled={form.id === meuId}
                onChange={(e) => setForm({ ...form, papel: e.target.value as Papel })}
              >
                {PAPEIS.map((p) => (
                  <option key={p} value={p}>{PAPEL_ROTULO[p]}</option>
                ))}
              </select>
            </label>
            {form.id && (
              <label className="campo-check">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  disabled={form.id === meuId}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                />
                <span>Acesso liberado</span>
              </label>
            )}
            {!form.id && (
              <p className="texto-suave">
                Uma senha temporária será gerada. O usuário define a própria senha no primeiro acesso.
              </p>
            )}

            {erroForm && <p className="alerta alerta-erro" role="alert">{erroForm}</p>}

            <div className="modal-acoes">
              <button type="button" className="botao botao-secundario" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button type="submit" className="botao botao-primario" disabled={salvando}>
                {salvando && <span className="spinner" aria-hidden />}
                {form.id ? 'Salvar' : 'Criar usuário'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal titulo="Senha temporária" aberto={senha !== null} onFechar={() => setSenha(null)}>
        {senha && (
          <div className="form">
            <p>
              Repasse ao usuário <strong>{senha.email}</strong>. Ela aparece só agora e precisa ser
              trocada no primeiro acesso.
            </p>
            <div className="senha-gerada">
              <code>{senha.senha_temporaria}</code>
              <button type="button" className="botao botao-secundario" onClick={() => void copiar()}>
                {copiado ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
                {copiado ? 'Copiada' : 'Copiar'}
              </button>
            </div>
            <div className="modal-acoes">
              <button type="button" className="botao botao-primario" onClick={() => setSenha(null)}>
                Concluir
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
