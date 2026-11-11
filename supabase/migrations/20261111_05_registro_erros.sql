/*
 * Avanzzi Agendamentos — Etapa 5: registro de erros do aplicativo.
 *
 * O front envia erros inesperados (tela quebrada, falha não tratada) para
 * esta tabela, para a equipe investigar sem depender de print do usuário.
 * Não guarda dados de clientes: só mensagem técnica, tela e navegador.
 * Leitura restrita ao administrador. Registros com mais de 90 dias podem
 * ser apagados com: delete from public.erros_app where ocorrido_em < now() - interval '90 days';
 */

create table public.erros_app (
  id bigint generated always as identity primary key,
  usuario_id uuid references public.perfis (id),
  mensagem text not null,
  detalhe text,
  tela text,
  navegador text,
  versao_app text,
  ocorrido_em timestamptz not null default now()
);

create index ix_erros_app_ocorrido on public.erros_app (ocorrido_em desc);

alter table public.erros_app enable row level security;
revoke all on public.erros_app from anon, authenticated;
grant select on public.erros_app to authenticated;

create policy erros_app_leitura on public.erros_app
  for select to authenticated
  using (public.fn_papel_atual() = 'admin');

create or replace function public.rpc_registrar_erro(
  p_mensagem text,
  p_detalhe text default null,
  p_tela text default null,
  p_navegador text default null,
  p_versao_app text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  -- Limite simples contra laço de erros: no máximo 30 por usuário a cada 10 minutos.
  if (
    select count(*) from public.erros_app
     where usuario_id = auth.uid() and ocorrido_em > now() - interval '10 minutes'
  ) >= 30 then
    return;
  end if;

  insert into public.erros_app (usuario_id, mensagem, detalhe, tela, navegador, versao_app)
  values (
    (select id from public.perfis where id = auth.uid()),
    left(coalesce(nullif(trim(p_mensagem), ''), 'Erro sem mensagem'), 500),
    left(p_detalhe, 4000),
    left(p_tela, 200),
    left(p_navegador, 300),
    left(p_versao_app, 50)
  );
end;
$$;

revoke all on function public.rpc_registrar_erro(text, text, text, text, text) from public, anon;
grant execute on function public.rpc_registrar_erro(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Endurecimento: no Supabase, toda função criada em "public" nasce executável
-- por "anon" (visitante sem login). Nenhuma função deste sistema é usada antes
-- do login, então o visitante perde o acesso a todas. Quem precisa (usuário
-- logado) já recebeu GRANT explícito em cada rpc_* e em fn_papel_atual.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
  end loop;
end;
$$;

alter default privileges in schema public revoke execute on functions from public, anon;
