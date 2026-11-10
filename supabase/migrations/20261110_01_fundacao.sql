/*
 * Avanzzi Agendamentos — Etapa 1: fundação do banco.
 *
 * Princípios:
 * - A agenda é compartilhada: todo usuário ativo LÊ todos os agendamentos.
 * - Nenhuma escrita direta nas tabelas pelo app. Toda alteração passa por
 *   funções rpc_* (security definer) que validam papel, dono e versão.
 * - O histórico (agendamento_eventos) é gravado por trigger na MESMA
 *   transação da alteração e não pode ser alterado nem apagado.
 * - Reagendar não sobrescreve: cria um novo agendamento ligado ao anterior.
 *
 * Regras marcadas com "PENDENTE" dependem de validação da gestão
 * (ver docs/decisoes-pendentes.md).
 */

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.papel_usuario as enum ('vendedor', 'gerente', 'admin');

-- Andamento do atendimento (comparecimento).
create type public.status_atendimento as enum (
  'agendado',
  'confirmado',
  'compareceu',
  'nao_compareceu',
  'cancelado',
  'reagendado'
);

-- Resultado comercial. Só sai de "pendente" quando o cliente compareceu.
create type public.resultado_venda as enum (
  'pendente',
  'venda_fechada',
  'nao_fechou'
);

-- ---------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ---------------------------------------------------------------------------

create table public.perfis (
  id uuid primary key references auth.users (id) on delete restrict,
  nome text not null check (length(trim(nome)) between 2 and 120),
  email text not null,
  telefone text,
  papel public.papel_usuario not null default 'vendedor',
  ativo boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.perfis is
  'Usuários do sistema. Novo usuário nasce inativo; um admin libera o acesso.';
comment on column public.perfis.telefone is
  'Usado no futuro para identificar o vendedor pelo WhatsApp.';

-- Todo usuário criado no Supabase Auth ganha um perfil inativo.
create or replace function public.fn_criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfis (id, nome, email)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
      split_part(new.email, '@', 1)
    ),
    lower(new.email)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger trg_auth_users_criar_perfil
after insert on auth.users
for each row execute function public.fn_criar_perfil_novo_usuario();

-- Papel do usuário logado, apenas se ativo. Null = sem acesso.
create or replace function public.fn_papel_atual()
returns public.papel_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select p.papel
  from public.perfis p
  where p.id = auth.uid()
    and p.ativo
$$;

revoke all on function public.fn_papel_atual() from public, anon;
grant execute on function public.fn_papel_atual() to authenticated;

-- ---------------------------------------------------------------------------
-- Categorias de produto (configuráveis)
-- ---------------------------------------------------------------------------

create table public.categorias_produto (
  id smallint generated always as identity primary key,
  nome text not null unique check (length(trim(nome)) between 2 and 60),
  ordem smallint not null default 0,
  ativo boolean not null default true
);

insert into public.categorias_produto (nome, ordem) values
  ('Colchão', 1),
  ('Cama', 2),
  ('Box', 3),
  ('Outros', 99);

-- ---------------------------------------------------------------------------
-- Agendamentos
-- ---------------------------------------------------------------------------

create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),

  cliente_nome text not null check (length(trim(cliente_nome)) between 2 and 120),
  cliente_telefone text,

  inicio timestamptz not null,
  duracao_min integer not null default 60 check (duracao_min between 10 and 480),

  vendedor_id uuid not null references public.perfis (id),
  categoria_id smallint references public.categorias_produto (id),
  observacoes text check (length(observacoes) <= 2000),

  status public.status_atendimento not null default 'agendado',
  resultado public.resultado_venda not null default 'pendente',
  valor_venda numeric(12, 2) check (valor_venda >= 0),
  motivo_cancelamento text,

  -- Cadeia de reagendamento (o anterior aponta para o novo e vice-versa).
  reagendado_de_id uuid references public.agendamentos (id),
  reagendado_para_id uuid references public.agendamentos (id),

  comparecimento_por uuid references public.perfis (id),
  comparecimento_em timestamptz,
  resultado_por uuid references public.perfis (id),
  resultado_em timestamptz,

  -- Controle de edição simultânea (incrementado a cada UPDATE).
  versao integer not null default 1,

  criado_por uuid not null references public.perfis (id),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references public.perfis (id),
  atualizado_em timestamptz not null default now(),

  constraint ck_resultado_exige_comparecimento
    check (resultado = 'pendente' or status = 'compareceu'),
  constraint ck_valor_so_com_venda
    check (valor_venda is null or resultado = 'venda_fechada'),
  constraint ck_cancelamento_com_motivo
    check (status <> 'cancelado' or length(trim(coalesce(motivo_cancelamento, ''))) > 0)
);

create index ix_agendamentos_inicio on public.agendamentos (inicio);
create index ix_agendamentos_vendedor_inicio on public.agendamentos (vendedor_id, inicio);
create index ix_agendamentos_status on public.agendamentos (status);

-- Versão e carimbo de atualização.
create or replace function public.fn_agendamentos_antes_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.versao := old.versao + 1;
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end;
$$;

create trigger trg_agendamentos_antes_update
before update on public.agendamentos
for each row execute function public.fn_agendamentos_antes_update();

-- ---------------------------------------------------------------------------
-- Histórico / auditoria
-- ---------------------------------------------------------------------------

create table public.agendamento_eventos (
  id bigint generated always as identity primary key,
  agendamento_id uuid not null references public.agendamentos (id),
  tipo text not null,
  dados_anteriores jsonb,
  dados_novos jsonb,
  motivo text,
  usuario_id uuid references public.perfis (id),
  ocorrido_em timestamptz not null default now()
);

create index ix_agendamento_eventos_agendamento
  on public.agendamento_eventos (agendamento_id, ocorrido_em);

comment on table public.agendamento_eventos is
  'Histórico imutável. Gravado por trigger; UPDATE e DELETE são bloqueados.';

-- Bloqueia alteração/remoção do histórico, inclusive por funções do sistema.
create or replace function public.fn_eventos_imutaveis()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'O histórico de agendamentos não pode ser alterado nem apagado.'
    using errcode = '42501';
end;
$$;

create trigger trg_agendamento_eventos_imutaveis
before update or delete on public.agendamento_eventos
for each row execute function public.fn_eventos_imutaveis();

/*
 * Grava o evento de cada INSERT/UPDATE em agendamentos.
 * As rpc_* informam o tipo e o motivo via set_config local:
 *   app.evento  (ex.: 'reagendado', 'cancelado', 'status_alterado')
 *   app.motivo  (texto livre)
 * Só os campos que mudaram são guardados (anterior x novo).
 */
create or replace function public.fn_auditar_agendamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ignorar text[] := array['versao', 'atualizado_em', 'atualizado_por'];
  v_antes jsonb;
  v_depois jsonb;
  v_tipo text := nullif(current_setting('app.evento', true), '');
  v_motivo text := nullif(current_setting('app.motivo', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.agendamento_eventos
      (agendamento_id, tipo, dados_novos, motivo, usuario_id)
    values (
      new.id,
      coalesce(v_tipo, 'criado'),
      to_jsonb(new) - v_ignorar,
      v_motivo,
      auth.uid()
    );
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
    return new; -- nada relevante mudou
  end if;

  insert into public.agendamento_eventos
    (agendamento_id, tipo, dados_anteriores, dados_novos, motivo, usuario_id)
  values (
    new.id,
    coalesce(v_tipo, 'alterado'),
    v_antes,
    v_depois,
    v_motivo,
    auth.uid()
  );

  return new;
end;
$$;

create trigger trg_agendamentos_auditoria
after insert or update on public.agendamentos
for each row execute function public.fn_auditar_agendamento();

-- ---------------------------------------------------------------------------
-- RLS: leitura compartilhada para usuários ativos; nenhuma escrita direta.
-- ---------------------------------------------------------------------------

alter table public.perfis enable row level security;
alter table public.categorias_produto enable row level security;
alter table public.agendamentos enable row level security;
alter table public.agendamento_eventos enable row level security;

revoke all on public.perfis, public.categorias_produto,
  public.agendamentos, public.agendamento_eventos from anon, authenticated;

grant select on public.perfis, public.categorias_produto,
  public.agendamentos, public.agendamento_eventos to authenticated;

create policy perfis_leitura on public.perfis
  for select to authenticated
  using (id = auth.uid() or public.fn_papel_atual() is not null);

create policy categorias_leitura on public.categorias_produto
  for select to authenticated
  using (public.fn_papel_atual() is not null);

create policy agendamentos_leitura on public.agendamentos
  for select to authenticated
  using (public.fn_papel_atual() is not null);

-- PENDENTE: hoje qualquer usuário ativo consulta o histórico.
create policy eventos_leitura on public.agendamento_eventos
  for select to authenticated
  using (public.fn_papel_atual() is not null);

-- Kanban e calendário atualizam em tempo real (o Realtime respeita a RLS).
alter publication supabase_realtime add table public.agendamentos;
