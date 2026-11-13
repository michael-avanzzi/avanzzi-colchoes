/**
 * Ranking de vendedores no Painel. Desligado até a gestão aprovar
 * (docs/decisoes-pendentes.md). Com true, a tabela por vendedor passa a ser
 * ordenada por vendas e exibe a posição de cada um.
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
