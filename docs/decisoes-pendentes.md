# Decisões pendentes

Regras que foram implementadas com um **padrão provisório** e precisam de validação da gestão. Cada item indica onde a regra está no código, para que a troca seja simples.

| # | Tema | Padrão provisório adotado | Onde está |
|---|---|---|---|
| 1 | Quantidade de vendedores | Sem limite | — |
| 2 | Perfis e permissões | O vendedor cria para si e altera só os próprios agendamentos. Gerente e admin alteram qualquer um. Só gerente e admin trocam o vendedor, sempre com justificativa. | `fn_carregar_para_alterar`, `rpc_criar_agendamento`, `rpc_transferir_vendedor` |
| 3 | Horários | Horário livre, com duração padrão de 60 minutos (de 10 a 480 min). Ainda não há bloqueio por expediente. | `agendamentos.duracao_min`, `rpc_criar_agendamento` |
| 4 | Conflito de horário | O mesmo vendedor não pode ter dois agendamentos em aberto sobrepostos. | `fn_validar_conflito` |
| 5 | Dados da venda | Resultado com valor opcional. A tabela de itens vendidos ainda não foi criada. | `rpc_registrar_resultado` |
| 6 | Quem marca o comparecimento | Os mesmos usuários que podem alterar o agendamento (regra do item 2). Só a partir do dia do agendamento. | `rpc_atualizar_status` |
| 7 | Cancelamento, reagendamento, encaixe e duplicidade | Cancelar exige motivo e preserva o registro. Reagendar cria um novo registro vinculado ao anterior. Não há tratamento específico para encaixe nem para duplicidade. | `rpc_cancelar_agendamento`, `rpc_reagendar_agendamento` |
| 8 | Indicadores | Proposta: o denominador conta só agendamentos passados, sem cancelados, e cada cadeia de reagendamento conta uma vez (pelo registro final). | Etapa 4 |
| 9 | Lembrete de 1 hora antes | Só para o vendedor (etapa do WhatsApp) | Etapa 6 |
| 10 | Ranking por vendedor | Não exibir até que a gestão aprove | Etapa 4 |
| 11 | Consulta ao histórico | Qualquer usuário ativo consulta | policy `eventos_leitura` |
| 12 | Identidade visual | Ícone e logotipo provisórios (#FAA300, preto e branco) | `public/icons/icon.svg`, `Logo.tsx` |
