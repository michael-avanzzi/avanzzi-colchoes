/*
 * Avanzzi Agendamentos — fotos de perfil e lembretes por notificação (Web Push).
 *
 * FOTOS
 *   - Bucket público "avatares": arquivo em <id do usuário>/<carimbo>.webp.
 *     O nome inclui o id (UUID), então não dá para adivinhar endereços.
 *   - Cada usuário envia/apaga só na própria pasta; o admin, em qualquer uma.
 *   - perfis.foto_path guarda o caminho; muda só por rpc_definir_foto.
 *
 * LEMBRETES
 *   - push_inscricoes: aparelhos de cada usuário que aceitaram notificações.
 *   - lembretes_enviados: impede lembrete duplicado do mesmo agendamento.
 *   - fn_reservar_lembretes(): usada SÓ pela Edge Function lembretes-push
 *     (chave secreta); devolve os agendamentos "Agendado" (ainda não
 *     confirmados) que começam na próxima hora e ainda não foram lembrados.
 */

-- ===========================================================================
-- FOTOS
-- ===========================================================================

alter table public.perfis add column if not exists foto_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 524288, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy avatares_ler on storage.objects
  for select to authenticated
  using (bucket_id = 'avatares');

create policy avatares_enviar on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatares'
    and public.fn_papel_atual() is not null
    and ((storage.foldername(name))[1] = auth.uid()::text or public.fn_papel_atual() = 'admin')
  );

create policy avatares_apagar on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatares'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.fn_papel_atual() = 'admin')
  );

create or replace function public.rpc_definir_foto(p_perfil_id uuid, p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_papel public.papel_usuario := public.fn_exigir_papel();
begin
  if p_perfil_id <> auth.uid() and v_papel <> 'admin' then
    raise exception 'Você só pode alterar a sua própria foto.' using errcode = '42501';
  end if;

  if p_path is not null and split_part(p_path, '/', 1) <> p_perfil_id::text then
    raise exception 'Arquivo de foto inválido.' using errcode = 'P0001';
  end if;

  update public.perfis
     set foto_path = p_path,
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where id = p_perfil_id;

  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'PT404';
  end if;

  return p_path;
end;
$$;

revoke all on function public.rpc_definir_foto(uuid, text) from public, anon;
grant execute on function public.rpc_definir_foto(uuid, text) to authenticated;

-- O perfil do usuário logado passa a trazer a foto.
create or replace function public.rpc_meu_perfil()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfis;
  v_trocar_senha boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('allowed', false, 'message', 'Sessão não autenticada.');
  end if;

  select * into v_perfil from public.perfis where id = auth.uid();

  if not found then
    return jsonb_build_object('allowed', false, 'message', 'Perfil não encontrado.');
  end if;

  if not v_perfil.ativo then
    return jsonb_build_object(
      'allowed', false,
      'nome', v_perfil.nome,
      'email', v_perfil.email,
      'message', 'Seu acesso ainda não foi liberado. Fale com o administrador.'
    );
  end if;

  select coalesce((u.raw_app_meta_data ->> 'trocar_senha')::boolean, false)
    into v_trocar_senha
  from auth.users u
  where u.id = auth.uid();

  return jsonb_build_object(
    'allowed', true,
    'id', v_perfil.id,
    'nome', v_perfil.nome,
    'email', v_perfil.email,
    'telefone', v_perfil.telefone,
    'papel', v_perfil.papel,
    'foto_path', v_perfil.foto_path,
    'trocar_senha', coalesce(v_trocar_senha, false)
  );
end;
$$;

revoke all on function public.rpc_meu_perfil() from public, anon;
grant execute on function public.rpc_meu_perfil() to authenticated;

-- ===========================================================================
-- LEMBRETES (Web Push)
-- ===========================================================================

create table public.push_inscricoes (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  navegador text,
  criado_em timestamptz not null default now(),
  ultimo_envio timestamptz
);

create index ix_push_inscricoes_usuario on public.push_inscricoes (usuario_id);

alter table public.push_inscricoes enable row level security;
revoke all on public.push_inscricoes from anon, authenticated;
grant select on public.push_inscricoes to authenticated;

create policy push_inscricoes_proprias on public.push_inscricoes
  for select to authenticated
  using (usuario_id = auth.uid());

create table public.lembretes_enviados (
  agendamento_id uuid primary key references public.agendamentos (id),
  enviado_em timestamptz not null default now(),
  aparelhos integer not null default 0
);

alter table public.lembretes_enviados enable row level security;
revoke all on public.lembretes_enviados from anon, authenticated;

-- Salva (ou move para o usuário atual) a inscrição deste aparelho.
create or replace function public.rpc_salvar_inscricao_push(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_navegador text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_exigir_papel();

  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then
    raise exception 'Inscrição de notificação inválida.' using errcode = 'P0001';
  end if;

  insert into public.push_inscricoes (usuario_id, endpoint, p256dh, auth, navegador)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_navegador, 300))
  on conflict (endpoint) do update
    set usuario_id = excluded.usuario_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        navegador = excluded.navegador,
        criado_em = now();
end;
$$;

-- Remove a inscrição deste aparelho (ao sair ou desativar).
create or replace function public.rpc_remover_inscricao_push(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_inscricoes
   where endpoint = p_endpoint and usuario_id = auth.uid();
end;
$$;

revoke all on function public.rpc_salvar_inscricao_push(text, text, text, text) from public, anon;
revoke all on function public.rpc_remover_inscricao_push(text) from public, anon;
grant execute on function public.rpc_salvar_inscricao_push(text, text, text, text) to authenticated;
grant execute on function public.rpc_remover_inscricao_push(text) to authenticated;

/*
 * Reserva os lembretes a enviar agora: agendamentos ainda "Agendado" que
 * começam dentro da próxima hora, de vendedores ativos, nunca lembrados.
 * A reserva (insert) acontece antes do envio, então duas execuções
 * simultâneas nunca enviam o mesmo lembrete.
 */
create or replace function public.fn_reservar_lembretes(p_antecedencia_min integer default 60)
returns table (
  agendamento_id uuid,
  vendedor_id uuid,
  cliente_nome text,
  inicio timestamptz
)
language sql
security definer
set search_path = ''
as $$
  with candidatos as (
    select a.id, a.vendedor_id, a.cliente_nome, a.inicio
    from public.agendamentos a
    join public.perfis p on p.id = a.vendedor_id and p.ativo
    where a.status = 'agendado'
      and a.inicio > now()
      and a.inicio <= now() + make_interval(mins => p_antecedencia_min)
  ),
  reservados as (
    insert into public.lembretes_enviados (agendamento_id)
    select id from candidatos
    on conflict (agendamento_id) do nothing
    returning lembretes_enviados.agendamento_id
  )
  select c.id, c.vendedor_id, c.cliente_nome, c.inicio
  from candidatos c
  join reservados r on r.agendamento_id = c.id;
$$;

revoke all on function public.fn_reservar_lembretes(integer) from public, anon, authenticated;
grant execute on function public.fn_reservar_lembretes(integer) to service_role;

grant select, insert, update, delete on public.push_inscricoes to service_role;
grant select, insert, update on public.lembretes_enviados to service_role;
