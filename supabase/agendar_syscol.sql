/*
 * Integração com o Syscol: tokens e agendamentos.
 * Rode UMA vez no SQL Editor, depois da migração 08 e da implantação das funções
 * syscol-webhook, syscol-sync e syscol-avisos (todas com "Verify JWT" desligado).
 *
 * ANTES, troque:
 *   COLE_AQUI_O_TOKEN_DO_WEBHOOK  -> token que vai no final da URL cadastrada no Syscol
 *   COLE_AQUI_O_SEGREDO_DO_CRON   -> segredo usado pelo agendador para chamar as funções
 * Gere cada um com, por exemplo: openssl rand -hex 24
 * Nada disso vai para o GitHub: o banco guarda só o hash dos tokens, e o segredo
 * do agendador fica criptografado no Vault.
 *
 * URL para cadastrar no Syscol (Opções → WebHook/API → aba WebHook → Pedido de Venda):
 *   https://zfnnppvehwriijhqrsck.supabase.co/functions/v1/syscol-webhook?token=COLE_AQUI_O_TOKEN_DO_WEBHOOK
 *
 * Em Edge Functions → Secrets, cadastre também SYSCOL_API_KEY (chave da API de
 * Integração do Syscol). As chaves VAPID dos lembretes são reaproveitadas.
 */
insert into syscol.config (chave, valor) values
  ('webhook_token_sha256', encode(extensions.digest('COLE_AQUI_O_TOKEN_DO_WEBHOOK', 'sha256'), 'hex')),
  ('cron_segredo_sha256', encode(extensions.digest('COLE_AQUI_O_SEGREDO_DO_CRON', 'sha256'), 'hex'))
on conflict (chave) do update set valor = excluded.valor;

do $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'syscol_segredo';
  if v_id is null then
    perform vault.create_secret('COLE_AQUI_O_SEGREDO_DO_CRON', 'syscol_segredo', 'Segredo do cron das funções syscol-*');
  else
    perform vault.update_secret(v_id, 'COLE_AQUI_O_SEGREDO_DO_CRON');
  end if;
end;
$$;

-- Remove agendamentos anteriores com o mesmo nome (permite rodar de novo).
select cron.unschedule(jobid) from cron.job where jobname in ('syscol-sync', 'syscol-avisos');

-- API do Syscol a cada 10 minutos
select cron.schedule('syscol-sync', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://zfnnppvehwriijhqrsck.supabase.co/functions/v1/syscol-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'syscol_segredo')),
    body := '{}'::jsonb, timeout_milliseconds := 120000);
$$);

-- Avisos de ranking (novo 1º lugar, meta do dia) a cada 2 minutos
select cron.schedule('syscol-avisos', '*/2 * * * *', $$
  select net.http_post(
    url := 'https://zfnnppvehwriijhqrsck.supabase.co/functions/v1/syscol-avisos',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'syscol_segredo')),
    body := '{}'::jsonb, timeout_milliseconds := 30000);
$$);

-- Conferência: deve listar os dois jobs ativos.
select jobid, jobname, schedule, active from cron.job where jobname like 'syscol-%';
