import { LOJA } from '../config'

/**
 * Converte um telefone brasileiro digitado de qualquer jeito
 * ("(11) 98765-4321", "11987654321", "+55 11 98765-4321") para o formato
 * do WhatsApp: 55 + DDD + número. Devolve null se não parecer válido.
 */
export function normalizarTelefoneBR(telefone: string | null | undefined): string | null {
  let digitos = (telefone ?? '').replace(/\D/g, '')
  if (!digitos) return null
  if (digitos.startsWith('00')) digitos = digitos.slice(2)
  if (digitos.startsWith('0')) digitos = digitos.replace(/^0+/, '')
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return digitos
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  return null
}

const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

type Dados = {
  cliente: string
  inicio: string
  vendedor: string | null
  produto: string | null
  observacao?: string | null
}

/** Mensagem de confirmação do agendamento para o cliente. */
export function montarMensagem({ cliente, inicio, vendedor, produto }: Dados) {
  const primeiroNome = cliente.replace(/\(fict[ií]cio\)/i, '').trim().split(/\s+/)[0] ?? ''
  const nome = primeiroNome ? primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase() : ''
  const data = new Date(inicio)
  const dia = fmtDia.format(data)

  const linhas = [
    `Olá${nome ? `, ${nome}` : ''}! Tudo bem?`,
    vendedor && vendedor !== '—'
      ? `Aqui é ${vendedor}, da ${LOJA.nome}.`
      : `Aqui é da ${LOJA.nome}.`,
    '',
    'Seu atendimento está agendado:',
    `📅 ${dia.charAt(0).toUpperCase()}${dia.slice(1)}`,
    `🕒 ${fmtHora.format(data)}`,
  ]
  if (produto) linhas.push(`🛏️ Interesse: ${produto}`)
  if (LOJA.endereco) linhas.push(`📍 ${LOJA.endereco}`)
  linhas.push('', 'Qualquer dúvida ou se precisar remarcar, é só responder esta mensagem. Até lá!')

  return linhas.join('\n')
}

/** Link que abre a conversa (com o número, se houver) já com a mensagem escrita. */
export function linkWhatsApp(telefone: string | null | undefined, mensagem: string) {
  const numero = normalizarTelefoneBR(telefone)
  const texto = encodeURIComponent(mensagem)
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`
}
