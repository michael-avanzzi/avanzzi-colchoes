import { useEffect, useState } from 'react'
import { BellOff, BellRing } from 'lucide-react'

import { mensagemDeErro } from '../../lib/supabase'
import { ativarPush, desativarPush, estadoPush, type EstadoPush } from '../../services/push.service'

/** Liga/desliga os lembretes por notificação neste aparelho (funciona com o app fechado). */
export function AtivarNotificacoes() {
  const [estado, setEstado] = useState<EstadoPush | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    estadoPush()
      .then((e) => ativo && setEstado(e))
      .catch(() => ativo && setEstado({ tipo: 'indisponivel', motivo: 'Não foi possível verificar as notificações.' }))
    return () => {
      ativo = false
    }
  }, [])

  async function alternar(ligar: boolean) {
    setErro(null)
    setOcupado(true)
    try {
      if (ligar) await ativarPush()
      else await desativarPush()
      setEstado(await estadoPush())
    } catch (error) {
      setErro(mensagemDeErro(error))
      setEstado(await estadoPush().catch(() => null))
    } finally {
      setOcupado(false)
    }
  }

  if (!estado) return null

  return (
    <section className="detalhe-bloco notificacoes">
      <h3>Notificações neste aparelho</h3>
      {estado.tipo === 'ativo' && (
        <>
          <p className="texto-suave">
            <BellRing size={16} aria-hidden /> Ativas: você recebe um aviso 1 hora antes de cada agendamento ainda não
            confirmado, mesmo com o app fechado.
          </p>
          <button type="button" className="botao botao-secundario" onClick={() => void alternar(false)} disabled={ocupado}>
            <BellOff size={16} aria-hidden /> Desativar neste aparelho
          </button>
        </>
      )}
      {estado.tipo === 'inativo' && (
        <>
          <p className="texto-suave">Ative para receber um aviso 1 hora antes dos agendamentos, mesmo com o app fechado.</p>
          <button type="button" className="botao botao-primario" onClick={() => void alternar(true)} disabled={ocupado}>
            {ocupado && <span className="spinner" aria-hidden />}
            <BellRing size={16} aria-hidden /> Ativar notificações
          </button>
        </>
      )}
      {estado.tipo === 'bloqueado' && (
        <p className="texto-suave">
          As notificações estão bloqueadas para este site. Libere nas configurações do navegador (ícone de cadeado ao lado do
          endereço → Notificações → Permitir) e volte aqui.
        </p>
      )}
      {estado.tipo === 'indisponivel' && <p className="texto-suave">{estado.motivo}</p>}
      {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}
    </section>
  )
}
