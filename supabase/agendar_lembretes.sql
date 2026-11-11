/*
 * Agenda a Edge Function lembretes-push para rodar a cada 5 minutos.
 * Rode UMA vez no SQL Editor, depois da migração 06 e da implantação da função.
 *
 * ANTES: troque COLE_AQUI_O_SEGREDO pelo valor de LEMBRETES_SEGREDO do arquivo
 * .env.vapid.local (o mesmo cadastrado em Edge Functions → Secrets).
 * O segredo fica guardado criptografado no Vault do Supabase, não neste script.
 */
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guarda o segredo no Vault (se já existir, atualiza).
do $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'lembretes_segredo';
  if v_id is null then
    perform vault.create_secret('COLE_AQUI_O_SEGREDO', 'lembretes_segredo', 'Segredo do cron de lembretes');
  else
    perform vault.update_secret(v_id, 'COLE_AQUI_O_SEGREDO');
  end if;
end;
$$;

-- Remove agendamento anterior com o mesmo nome (permite rodar de novo).
select cron.unschedule(jobid) from cron.job where jobname = 'lembretes-push';

select cron.schedule(
  'lembretes-push',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://zfnnppvehwriijhqrsck.supabase.co/functions/v1/lembretes-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'lembretes_segredo')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Conferência: deve listar o job ativo.
select jobid, jobname, schedule, active from cron.job where jobname = 'lembretes-push';
