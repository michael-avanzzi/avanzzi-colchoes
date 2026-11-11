# Roteiro de homologação

Use este roteiro com a equipe da loja antes de liberar o uso real. **Use apenas dados fictícios**, com “(fictício)” no nome do cliente, para que o script de limpeza remova tudo depois.

Para cada item, marque ✅ (funcionou), ❌ (não funcionou, anote o que aconteceu) ou ➖ (não se aplica).

## Preparação (administrador)

- [ ] Criar 2 vendedores e 1 gerente de teste na tela **Usuários** e anotar as senhas temporárias.
- [ ] Cada pessoa entra no celular e no computador com o próprio usuário e troca a senha no primeiro acesso.
- [ ] No celular: instalar o app (Chrome no Android: menu → **Instalar app**; Safari no iPhone: **Compartilhar → Adicionar à Tela de Início**).

## Vendedor

- [ ] Criar um agendamento para hoje. O vendedor responsável aparece preenchido com o próprio nome.
- [ ] Criar outro agendamento no mesmo horário: o sistema avisa o conflito.
- [ ] Arrastar o cartão de **Agendado** para **Confirmado** (no celular, segure o cartão um instante antes de arrastar).
- [ ] Abrir o agendamento, **Editar** as observações e conferir a aba **Histórico**.
- [ ] **Reagendar** para amanhã com motivo. O horário original vai para **Reagendado** e o botão leva ao novo.
- [ ] **Cancelar** um agendamento com motivo.
- [ ] Marcar **Compareceu** e depois **Venda fechada** com valor.
- [ ] Tentar alterar um agendamento de **outro** vendedor: a tela não deve permitir.
- [ ] Ver o mesmo agendamento no **Calendário** (dia, semana e mês).
- [ ] Desligar a internet do celular: aparece o aviso “Sem conexão”.

## Gerente

- [ ] Criar um agendamento escolhendo o vendedor.
- [ ] **Trocar vendedor** de um agendamento (pede justificativa) e conferir o histórico.
- [ ] **Painel:** os números do dia batem com o que foi feito? (Compareceram, faltas, vendas, taxas.)
- [ ] Filtrar o painel por vendedor e por período.
- [ ] Ranking: a ordem faz sentido?

## Tempo real (duas pessoas ao mesmo tempo)

- [ ] Pessoa A move um cartão no Kanban; o cartão muda sozinho na tela da pessoa B, em poucos segundos.
- [ ] As duas abrem o mesmo agendamento; A salva uma alteração e depois B tenta salvar outra: B recebe o aviso “alterado por outra pessoa”.

## Decisões para a gestão confirmar

Durante a homologação, confirme as regras provisórias de [decisoes-pendentes.md](decisoes-pendentes.md), principalmente:
- quem pode alterar agendamentos de outros vendedores;
- horário de funcionamento e duração padrão;
- como tratar cancelamentos e reagendamentos nos indicadores;
- se a falta pode ser marcada antes do horário.

## Encerramento

- [ ] Rodar `supabase/limpar_dados_teste.sql` no SQL Editor.
- [ ] Remover o acesso dos usuários de teste na tela **Usuários**.
- [ ] Registrar abaixo os problemas encontrados.

| # | Tela | O que aconteceu | Quem | Resolvido? |
|---|---|---|---|---|
| | | | | |
