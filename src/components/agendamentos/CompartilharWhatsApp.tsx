import { useState } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'

import { useCadastros } from '../../hooks/useCadastros'
import { linkWhatsApp, montarMensagem, normalizarTelefoneBR } from '../../lib/whatsapp'
import type { Agendamento } from '../../types/agendamento'

type Props = { agendamento: Agendamento; destaque?: boolean }

/** Envia (ou copia) a confirmação do agendamento para o WhatsApp do cliente. */
export function CompartilharWhatsApp({ agendamento: a, destaque = false }: Props) {
  const { nomeVendedor } = useCadastros()
  const [copiado, setCopiado] = useState(false)

  const mensagem = montarMensagem({ inicio: a.inicio, vendedor: nomeVendedor(a.vendedor_id) })
  const temNumero = Boolean(normalizarTelefoneBR(a.cliente_telefone))

  function abrir() {
    window.open(linkWhatsApp(a.cliente_telefone, mensagem), '_blank', 'noopener,noreferrer')
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2500)
    } catch {
      window.prompt('Copie a mensagem:', mensagem)
    }
  }

  return (
    <section className={destaque ? 'detalhe-bloco whatsapp whatsapp-destaque' : 'detalhe-bloco whatsapp'}>
      <h3>{destaque ? 'Agendado! Avise o cliente' : 'Enviar confirmação ao cliente'}</h3>
      <div className="detalhe-acoes">
        <button type="button" className="botao botao-whatsapp" onClick={abrir}>
          <MessageCircle size={18} aria-hidden />
          {temNumero ? 'Enviar no WhatsApp' : 'Escolher contato no WhatsApp'}
        </button>
        <button type="button" className="botao botao-secundario" onClick={() => void copiar()}>
          {copiado ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copiado ? 'Copiada' : 'Copiar mensagem'}
        </button>
      </div>
      {!temNumero && (
        <p className="texto-suave">
          {a.cliente_telefone
            ? 'O telefone cadastrado parece incompleto (precisa de DDD). Corrija em “Editar” para abrir a conversa direto.'
            : 'Sem telefone cadastrado: o WhatsApp abre para você escolher o contato. Cadastre o telefone em “Editar” para abrir direto.'}
        </p>
      )}
      <details className="previa-mensagem">
        <summary>Ver mensagem</summary>
        <pre>{mensagem}</pre>
      </details>
    </section>
  )
}
