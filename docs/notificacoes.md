# Lembretes por notificação (Web Push)

O vendedor recebe um aviso **1 hora antes** de cada agendamento dele que ainda está como **Agendado**, ou seja, que ainda não foi confirmado com o cliente. O aviso chega **mesmo com o app fechado**. Tocar no aviso abre o app direto no agendamento.

Com o app aberto, há também o **sino** no topo, com contador e lista, e um aviso na tela com o botão **Confirmado**.

## Como funciona

```
pg_cron (a cada 5 min) ──HTTP + segredo──▶ Edge Function lembretes-push
                                             │ fn_reservar_lembretes(): "Agendado" na próxima hora, ainda não lembrado
                                             └─▶ Web Push para os aparelhos do vendedor (push_inscricoes)
```

- Cada agendamento é lembrado **uma única vez**: a tabela `lembretes_enviados` impede duplicidade.
- Aparelhos que desinstalaram o app ou bloquearam as notificações são removidos automaticamente.
- Ao **sair da conta**, o aparelho deixa de receber os lembretes daquela conta.

## Configuração (uma vez, no painel do Supabase)

As chaves foram geradas no arquivo local **`.env.vapid.local`**, que **não vai para o GitHub**. Guarde uma cópia em local seguro.

1. **SQL Editor:** rode `supabase/migrations/20261111_06_fotos_e_lembretes.sql`.
2. **Edge Functions → Secrets:** cadastre as 4 variáveis do `.env.vapid.local`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` e `LEMBRETES_SEGREDO`.
   - Em `VAPID_SUBJECT`, use um e-mail real da empresa no formato `mailto:...`.
3. **Edge Functions → Deploy a new function → Via Editor:**
   - Nome: `lembretes-push`.
   - Código: cole o conteúdo de `supabase/functions/lembretes-push/index.ts`.
   - **Desligue “Verify JWT”**: quem chama é o agendador, autenticado pelo segredo.
4. **SQL Editor:** abra `supabase/agendar_lembretes.sql`, troque `COLE_AQUI_O_SEGREDO` pelo valor de `LEMBRETES_SEGREDO` e rode. A última consulta deve mostrar o job `lembretes-push` ativo.
5. **Cloudflare:** a variável de build `VITE_VAPID_PUBLIC_KEY` já está cadastrada. Ela vale a partir do próximo deploy.

## Como cada vendedor ativa

**Meu perfil** (toque na foto ou na inicial do nome) ou **sino** → **Ativar notificações** → permitir.

| Aparelho | Observação |
|---|---|
| Android (Chrome) | Funciona no navegador ou com o app instalado |
| iPhone/iPad (iOS 16.4+) | **Só com o app instalado na Tela de Início** (Safari → Compartilhar → Adicionar à Tela de Início), aberto por lá |
| Computador (Chrome/Edge) | Funciona enquanto o navegador estiver aberto, mesmo sem a aba do app |

## Conferir se está funcionando

```sql
-- Últimas execuções do agendador (status 200 = ok)
select status_code, content::text, created
from net._http_response order by created desc limit 5;

-- Lembretes enviados hoje e para quantos aparelhos
select a.cliente_nome, a.inicio, l.enviado_em, l.aparelhos
from public.lembretes_enviados l
join public.agendamentos a on a.id = l.agendamento_id
where l.enviado_em::date = current_date
order by l.enviado_em desc;

-- Aparelhos inscritos por usuário
select p.nome, count(*) from public.push_inscricoes i
join public.perfis p on p.id = i.usuario_id group by p.nome;
```

Para **pausar** os lembretes: `select cron.unschedule('lembretes-push');`. Para religar, rode de novo `agendar_lembretes.sql`.
