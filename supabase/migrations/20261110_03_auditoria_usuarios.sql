/*
 * Avanzzi Agendamentos — Etapa 3: auditoria das alterações de usuários.
 *
 * Toda criação/alteração em perfis (papel, acesso, nome, telefone) gera um
 * evento imutável em perfil_eventos. Quem fez a alteração vem de auth.uid()
 * ou, quando a alteração parte da Edge Function admin-usuarios (que usa a
 * chave secreta e não tem auth.uid()), da coluna perfis.atualizado_por.
 */

alter table public.perfis
  add column if not exists atualizado_por uuid references public.perfis (id);

create table public.perfil_eventos (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfis (id),
  tipo text not null,
  dados_anteriores jsonb,
  dados_novos jsonb,
  usuario_id uuid references public.perfis (id),
  ocorrido_em timestamptz not null default now()
);

create index ix_perfil_eventos_perfil on public.perfil_eventos (perfil_id, ocorrido_em);

comment on table public.perfil_eventos is
  'Histórico imutável de alterações de usuários (papel, acesso, dados).';

create trigger trg_perfil_eventos_imutaveis
before update or delete on public.perfil_eventos
for each row execute function public.fn_eventos_imutaveis();

create or replace function public.fn_auditar_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ignorar text[] := array['atualizado_em', 'atualizado_por', 'criado_em'];
  v_autor uuid := coalesce(auth.uid(), new.atualizado_por);
  v_antes jsonb;
  v_depois jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.perfil_eventos (perfil_id, tipo, dados_novos, usuario_id)
    values (new.id, 'criado', to_jsonb(new) - v_ignorar, v_autor);
    return new;
  end if;

  select
    jsonb_object_agg(o.key, o.value),
    jsonb_object_agg(o.key, to_jsonb(new) -> o.key)
  into v_antes, v_depois
  from jsonb_each(to_jsonb(old)) o
  where o.key <> all (v_ignorar)
    and o.value is distinct from (to_jsonb(new) -> o.key);

  if v_antes is null then
    return new;
  end if;

  insert into public.perfil_eventos (perfil_id, tipo, dados_anteriores, dados_novos, usuario_id)
  values (
    new.id,
    case
      when v_antes ? 'ativo' and (new.ativo) then 'acesso_liberado'
      when v_antes ? 'ativo' then 'acesso_removido'
      when v_antes ? 'papel' then 'papel_alterado'
      else 'dados_alterados'
    end,
    v_antes,
    v_depois,
    v_autor
  );
  return new;
end;
$$;

create trigger trg_perfis_auditoria
after insert or update on public.perfis
for each row execute function public.fn_auditar_perfil();

alter table public.perfil_eventos enable row level security;
revoke all on public.perfil_eventos from anon, authenticated;
grant select on public.perfil_eventos to authenticated;

create policy perfil_eventos_leitura on public.perfil_eventos
  for select to authenticated
  using (public.fn_papel_atual() = 'admin');

-- Versão desatualizada passa a responder HTTP 409 (Conflict) em vez de 500:
-- no PostgREST, SQLSTATE "PTxyz" vira o status HTTP xyz.
create or replace function public.fn_carregar_para_alterar(
  p_id uuid,
  p_versao integer
)
returns public.agendamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_papel public.papel_usuario := public.fn_exigir_papel();
  v_ag public.agendamentos;
begin
  select * into v_ag
  from public.agendamentos
  where id = p_id
  for update;

  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = 'PT404';
  end if;

  if v_papel = 'vendedor' and v_ag.vendedor_id <> auth.uid() then
    raise exception 'Você só pode alterar os seus próprios agendamentos.'
      using errcode = '42501';
  end if;

  if v_ag.versao <> p_versao then
    raise exception 'Este agendamento foi alterado por outra pessoa. Recarregue e tente de novo.'
      using errcode = 'PT409';
  end if;

  return v_ag;
end;
$$;

revoke all on function public.fn_carregar_para_alterar(uuid, integer) from public, anon, authenticated;

-- A função administrativa passa a registrar o autor.
create or replace function public.rpc_admin_atualizar_perfil(
  p_id uuid,
  p_nome text,
  p_telefone text,
  p_papel public.papel_usuario,
  p_ativo boolean
)
returns public.perfis
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfis;
begin
  if public.fn_exigir_papel() <> 'admin' then
    raise exception 'Somente administrador pode alterar usuários.' using errcode = '42501';
  end if;

  if p_id = auth.uid() and (p_papel <> 'admin' or not p_ativo) then
    raise exception 'Você não pode remover o seu próprio acesso de administrador.'
      using errcode = 'P0001';
  end if;

  update public.perfis
     set nome = trim(p_nome),
         telefone = nullif(trim(p_telefone), ''),
         papel = p_papel,
         ativo = p_ativo,
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where id = p_id
  returning * into v_perfil;

  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  return v_perfil;
end;
$$;
