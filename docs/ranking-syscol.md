# Ranking de vendas (Syscol)

Página **Ranking** do app (`/ranking`) e tela cheia para a TV da sala de vendas (`/ranking/tv`), com os pedidos de venda do Syscol (ERP da Fábrica de Sistemas).

## De onde vêm os dados

```
Syscol ── webhook "Pedido de Venda" ──▶ Edge Function syscol-webhook ──▶ syscol.webhook_eventos ──(gatilho)──▶ syscol.pedidos
Syscol ── API (a cada 10 min) ◀────── Edge Function syscol-sync ──▶ syscol.api_linhas ──▶ syscol_aplicar_api()
pg_cron (a cada 2 min) ──▶ Edge Function syscol-avisos ──▶ Web Push (novo 1º lugar, meta do dia batida)
```

- O app só lê por `rpc_ranking_vendas`. O schema `syscol` não é acessível pelo navegador.
- Margem, custo e a lista de pedidos só voltam para **gerente** e **admin**.
- Dados de cliente dos pedidos ficam guardados (para o futuro planejamento de entregas), mas nenhuma tela os mostra.

## Regras

| Regra | Como funciona |
|---|---|
| Período | Data de emissão do pedido, no horário de Brasília |
| Cancelados | Fora de todos os totais (status 2 da API ou data de cancelamento) |
| Venda dividida | Pedido com vendedor secundário é repartido pelo percentual de venda de cada um (50/50 se não houver). Decisão da gestão: aqui o ranking difere do relatório do Syscol, que credita o pedido inteiro ao vendedor dos itens |
| Demais pedidos | Pelo vendedor marcado em cada item, como no Syscol |
| Custo / margem | Custo de reposição dos itens não cancelados |
| Meta do mês | Mapa de meta mensal do Syscol; a meta em **Configurar** só vale se o Syscol não tiver meta no mês |
| Meta do dia | Meta própria do vendedor ou a meta diária padrão (em **Configurar**) |

## Configuração (já feita no projeto Avanzzi agendamentos)

1. Migrações 07 e 08.
2. Funções `syscol-webhook`, `syscol-sync` e `syscol-avisos`, todas com **Verify JWT desligado**.
3. **Edge Functions → Secrets:** `SYSCOL_API_KEY` (Syscol → Opções → WebHook/API → API de Integração). As chaves VAPID são as mesmas dos lembretes.
4. `supabase/agendar_syscol.sql` (tokens e agendamentos). O banco guarda só o hash dos tokens.
5. No Syscol, aba **WebHook**, operação **Pedido de Venda**: a URL da função `syscol-webhook` com `?token=` no final.

## Conta da TV

Crie em **Usuários** um usuário com o papel **TV (só ranking)**, faça login com ele no navegador da TV e use **Tela cheia**. Essa conta não vê agenda, clientes nem margem, e não recebe notificações.

## Ligar usuários aos vendedores do Syscol

Em **Ranking → Configurar** (admin), escolha o usuário do app de cada vendedor do Syscol. A foto do ranking vem do perfil desse usuário, e o vendedor some do ranking se for desmarcado em **No ranking**.

## Conferir

```sql
-- Últimas sincronizações com a API
select iniciado_em, finalizado_em, resumo, erro from syscol.api_sync_log order by id desc limit 5;

-- Últimos eventos do webhook
select id, recebido_em, payload->>'pedido_numero' as pedido, erro_processamento
from syscol.webhook_eventos order by id desc limit 10;

-- Avisos enviados
select chave, tipo, dados, criado_em from syscol.avisos_enviados order by criado_em desc limit 10;
```
