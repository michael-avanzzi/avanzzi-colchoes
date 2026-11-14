/**
 * Ranking de vendedores no Painel (ordem por valor vendido: src/lib/ranking.ts).
 * Com false, a tabela por vendedor fica em ordem alfabética, sem posição.
 */
export const RANKING_HABILITADO = true

/** Dados da loja usados na mensagem de confirmação enviada ao cliente pelo WhatsApp. */
export const LOJA = {
  nome: 'Avanzzi Colchões',
  /** Preencha para incluir o endereço na mensagem (ex.: 'Av. Brasil, 1000 - Centro'). Vazio = não envia. */
  endereco: 'Av. da Saudade, 1177 - Pte. Preta, Campinas - SP, 13041-670',
}

/**
 * Expediente usado na imagem de horários do dia (Calendário → Dia).
 * Os horários vão de `abre` até o último que ainda cabe antes de `fecha`.
 */
export const EXPEDIENTE = {
  abre: '08:00',
  fecha: '20:00',
  intervaloMin: 30,
}
