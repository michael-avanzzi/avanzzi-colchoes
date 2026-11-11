/*
 * Verificação de segurança do banco. Rode no SQL Editor sempre que aplicar
 * uma migração nova. Resultado esperado: TODAS as linhas com situacao = 'ok'.
 */
with
tabelas as (
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
sem_rls as (
  select string_agg(c.relname, ', ') as itens
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
),
escrita_direta as (
  select string_agg(distinct table_name || ' (' || grantee || ': ' || privilege_type || ')', ', ') as itens
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
),
leitura_anonima as (
  select string_agg(distinct table_name, ', ') as itens
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'
),
definer_sem_search_path as (
  select string_agg(p.proname, ', ') as itens
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
    )
),
funcoes_anonimas as (
  select string_agg(p.proname, ', ') as itens
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'execute')
),
historico_protegido as (
  select count(*) as qtd
  from pg_trigger
  where not tgisinternal
    and tgname in ('trg_agendamento_eventos_imutaveis', 'trg_perfil_eventos_imutaveis')
),
usuarios_sem_perfil as (
  select count(*) as qtd
  from auth.users u
  where not exists (select 1 from public.perfis p where p.id = u.id)
),
admins as (
  select count(*) as qtd from public.perfis where papel = 'admin' and ativo
)
select 'Todas as tabelas com RLS' as verificacao,
       case when (select itens from sem_rls) is null then 'ok' else 'FALHA: ' || (select itens from sem_rls) end as situacao
union all
select 'App não escreve direto nas tabelas',
       coalesce('FALHA: ' || (select itens from escrita_direta), 'ok')
union all
select 'Visitante sem login não lê tabelas',
       coalesce('FALHA: ' || (select itens from leitura_anonima), 'ok')
union all
select 'Funções privilegiadas com search_path fixo',
       coalesce('FALHA: ' || (select itens from definer_sem_search_path), 'ok')
union all
select 'Visitante sem login não executa funções',
       coalesce('FALHA: ' || (select itens from funcoes_anonimas), 'ok')
union all
select 'Histórico protegido contra alteração',
       case when (select qtd from historico_protegido) = 2 then 'ok' else 'FALHA: triggers ausentes' end
union all
select 'Todo usuário do Auth tem perfil',
       case when (select qtd from usuarios_sem_perfil) = 0 then 'ok'
            else 'ATENÇÃO: ' || (select qtd from usuarios_sem_perfil) || ' sem perfil' end
union all
select 'Existe ao menos um administrador ativo',
       case when (select qtd from admins) > 0 then 'ok' else 'FALHA: nenhum admin ativo' end;
