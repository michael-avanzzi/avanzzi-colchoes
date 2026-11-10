-- Rode no SQL Editor depois das duas migrações. Todas as linhas devem vir com "ok".
select 'tabelas' as item,
       case when count(*) = 4 then 'ok' else 'FALTANDO: ' || count(*) || '/4' end as resultado
from information_schema.tables
where table_schema = 'public'
  and table_name in ('perfis', 'categorias_produto', 'agendamentos', 'agendamento_eventos')
union all
select 'rls ativa',
       case when bool_and(c.relrowsecurity) then 'ok' else 'RLS DESLIGADA' end
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('perfis', 'categorias_produto', 'agendamentos', 'agendamento_eventos')
union all
select 'funcoes rpc',
       case when count(*) = 10 then 'ok' else 'FALTANDO: ' || count(*) || '/10' end
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'rpc\_%'
union all
select 'triggers',
       case when count(*) = 4 then 'ok' else 'FALTANDO: ' || count(*) || '/4' end
from pg_trigger
where not tgisinternal
  and tgname in ('trg_auth_users_criar_perfil', 'trg_agendamentos_antes_update',
                 'trg_agendamentos_auditoria', 'trg_agendamento_eventos_imutaveis')
union all
select 'categorias',
       case when count(*) >= 4 then 'ok' else 'FALTANDO' end
from public.categorias_produto
union all
select 'realtime',
       case when count(*) = 1 then 'ok' else 'FALTANDO' end
from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'agendamentos';
