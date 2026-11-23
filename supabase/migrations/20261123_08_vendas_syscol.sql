-- ===========================================================================
-- VENDAS DO SYSCOL (ERP da Fábrica de Sistemas) e RANKING DE VENDEDORES
--
-- Entrada dos dados:
--   1. Webhook "Pedido de Venda" do Syscol  -> Edge Function syscol-webhook
--      -> public.syscol_registrar_evento -> syscol.webhook_eventos (gatilho
--      grava o pedido em syscol.pedidos na hora).
--   2. API do Syscol a cada 10 min          -> Edge Function syscol-sync
--      -> syscol.api_linhas (cópia bruta) -> public.syscol_aplicar_api
--      (histórico, cancelamentos, itens, vendedores e meta do mês).
--
-- Leitura pelo app: só por public.rpc_ranking_vendas (security definer).
-- O schema syscol não é acessível por anon/authenticated.
--
-- Tokens e segredos NÃO ficam neste arquivo (o repositório é público):
-- veja supabase/agendar_syscol.sql.
-- ===========================================================================

create schema if not exists syscol;
revoke all on schema syscol from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Papel "tv": sem acesso ao restante do app
-- ---------------------------------------------------------------------------
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
    and p.papel <> 'tv'
$$;

-- Vínculo do usuário do app com o vendedor do Syscol (funcionarios.id).
alter table public.perfis add column if not exists syscol_vendedor_id text;
create unique index if not exists ux_perfis_syscol_vendedor
  on public.perfis (syscol_vendedor_id) where syscol_vendedor_id is not null;
comment on column public.perfis.syscol_vendedor_id is
  'Id do vendedor no Syscol (tabela funcionarios). Liga foto e notificações ao ranking.';

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table syscol.config (
  chave text primary key,
  valor text
);

create table syscol.webhook_eventos (
  id bigint generated always as identity primary key,
  recebido_em timestamptz not null default now(),
  metodo text,
  content_type text,
  query_params jsonb,
  headers jsonb,
  corpo_texto text,
  payload jsonb,
  processado_em timestamptz,
  erro_processamento text
);
create index on syscol.webhook_eventos (recebido_em desc);

create table syscol.api_linhas (
  tabela text not null,
  id bigint not null,
  dados jsonb not null,
  sincronizado_em timestamptz not null default now(),
  primary key (tabela, id)
);

create table syscol.api_sync_log (
  id bigint generated always as identity primary key,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  resumo jsonb,
  erro text
);

create table syscol.vendedores (
  id text primary key,
  nome text not null,
  ativo boolean not null default true,
  visto_primeiro_em timestamptz not null default now(),
  visto_ultimo_em timestamptz not null default now()
);

create table syscol.pedidos (
  loja_empresa_id text not null,
  numero text not null,
  status text,
  status_codigo int,
  data_emissao date,
  registrado_em timestamptz,
  alterado_em timestamptz,
  total numeric(14,2),
  custo_total numeric(14,2),
  qtd_itens int,
  vendedor_01_id text,
  vendedor_02_id text,
  perc_vendedor_01 numeric,
  perc_vendedor_02 numeric,
  cancelado_em timestamptz,
  concluido_em timestamptz,
  cliente_id text,
  cliente_pessoa text,
  cliente_documento text,
  cliente_nome text,
  cliente_endereco text,
  cliente_complemento text,
  cliente_bairro text,
  cliente_cep text,
  cliente_municipio text,
  cliente_estado text,
  cliente_telefone_01 text,
  cliente_telefone_02 text,
  cliente_telefone_03 text,
  cliente_email text,
  ultimo_evento_id bigint,
  sincronizado_api_em timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (loja_empresa_id, numero)
);
create index on syscol.pedidos (data_emissao);
create index on syscol.pedidos (vendedor_01_id);
create index on syscol.pedidos (vendedor_02_id);
comment on table syscol.pedidos is
  'Pedidos de venda do Syscol. Dados de cliente guardados para o futuro planejamento de entregas; o ranking não os expõe.';

create table syscol.pedido_itens (
  id bigint primary key,
  pedido_id bigint not null,
  loja_empresa_id text,
  pedido_numero text,
  produto_id bigint,
  item int,
  descricao text,
  quantidade numeric,
  valor_unitario numeric(14,2),
  custo_reposicao numeric(14,2),
  vendedor_id text,
  cancelado_em timestamptz,
  largura text,
  comprimento text,
  altura text,
  brinde boolean,
  servico boolean,
  sincronizado_em timestamptz not null default now()
);
create index on syscol.pedido_itens (pedido_id);

create table syscol.metas_mensais (
  empresa_id text not null,
  mesref text not null,
  meta numeric(14,2),
  dias_venda text,
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, mesref)
);

create table syscol.metas_vendedor (
  vendedor_id text primary key,
  meta_diaria numeric(14,2),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create table syscol.estado (
  chave text primary key,
  valor text,
  atualizado_em timestamptz not null default now()
);

create table syscol.avisos_enviados (
  chave text primary key,
  tipo text not null,
  vendedor_id text,
  dados jsonb,
  criado_em timestamptz not null default now(),
  aparelhos int
);

-- Nada do schema syscol é lido direto pelo app.
alter table syscol.config enable row level security;
alter table syscol.webhook_eventos enable row level security;
alter table syscol.api_linhas enable row level security;
alter table syscol.api_sync_log enable row level security;
alter table syscol.vendedores enable row level security;
alter table syscol.pedidos enable row level security;
alter table syscol.pedido_itens enable row level security;
alter table syscol.metas_mensais enable row level security;
alter table syscol.metas_vendedor enable row level security;
alter table syscol.estado enable row level security;
alter table syscol.avisos_enviados enable row level security;

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------

-- '22/11/2026 15:25:45' (horário de Brasília) -> timestamptz
create function syscol.ts_br(t text) returns timestamptz
language sql stable set search_path = '' as $$
  select case when coalesce(t, '') = '' then null
    else (to_timestamp(t, 'DD/MM/YYYY HH24:MI:SS')::timestamp at time zone 'America/Sao_Paulo') end
$$;

create function syscol.hoje() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create function syscol.upsert_vendedor(p_id text, p_nome text) returns void
language plpgsql set search_path = '' as $$
begin
  if coalesce(p_id, '') in ('', '0') then return; end if;
  insert into syscol.vendedores (id, nome)
  values (p_id, coalesce(nullif(p_nome, '?'), 'Vendedor ' || p_id))
  on conflict (id) do update set
    nome = coalesce(nullif(nullif(excluded.nome, '?'), 'Vendedor ' || p_id), syscol.vendedores.nome),
    visto_ultimo_em = now();
end $$;

-- Pedido cancelado: status de cancelamento no Syscol ou data de cancelamento.
create function syscol.cancelado(p syscol.pedidos) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p.status, '') ~* 'CANCEL' or p.cancelado_em is not null or coalesce(p.status_codigo, 0) = 2
$$;

-- Venda de cada vendedor por pedido, dividida pelo percentual do Syscol
-- (50/50 só quando o pedido tem dois vendedores e nenhum percentual).
create view syscol.vendas_por_vendedor as
select p.loja_empresa_id, p.numero, p.data_emissao, v.vendedor_id,
       p.total * v.fator as valor,
       coalesce(p.custo_total, 0) * v.fator as custo,
       v.fator as participacao
from syscol.pedidos p
cross join lateral (
  select p.vendedor_01_id as vendedor_id,
         case when p.vendedor_02_id is null then 1.0
              when coalesce(p.perc_vendedor_01, 0) + coalesce(p.perc_vendedor_02, 0) > 0 then coalesce(p.perc_vendedor_01, 0) / 100.0
              else 0.5 end as fator
  where p.vendedor_01_id is not null
  union all
  select p.vendedor_02_id,
         case when coalesce(p.perc_vendedor_01, 0) + coalesce(p.perc_vendedor_02, 0) > 0 then coalesce(p.perc_vendedor_02, 0) / 100.0
              else 0.5 end
  where p.vendedor_02_id is not null
) v
where not syscol.cancelado(p);

-- ---------------------------------------------------------------------------
-- Webhook: grava o evento e, pelo gatilho, o pedido
-- ---------------------------------------------------------------------------
create function syscol.processar_evento() returns trigger
language plpgsql set search_path = '' as $$
declare
  p jsonb := new.payload;
  v_loja text; v_num text; v_alt timestamptz; v_atual timestamptz; v_v2 text;
begin
  if p is null or jsonb_typeof(p) <> 'object' or not (p ? 'pedido_numero') then
    return new;
  end if;
  begin
    v_loja := coalesce(nullif(p->>'loja_empresa_id', ''), '1');
    v_num  := lpad(ltrim(p->>'pedido_numero', '0'), 10, '0');
    v_alt  := syscol.ts_br(p->>'pedido_alterado_em');
    v_v2   := nullif(nullif(p->>'vendedor_02_id', ''), '0');

    select alterado_em into v_atual from syscol.pedidos where loja_empresa_id = v_loja and numero = v_num;
    if found and v_atual is not null and v_alt is not null and v_alt < v_atual then
      new.processado_em := now();
      new.erro_processamento := 'ignorado: evento mais antigo que o pedido já gravado';
      return new;
    end if;

    perform syscol.upsert_vendedor(p->>'vendedor_01_id', p->>'vendedor_01_nome');
    perform syscol.upsert_vendedor(v_v2, p->>'vendedor_02_nome');

    insert into syscol.pedidos as t (
      loja_empresa_id, numero, status, data_emissao, registrado_em, alterado_em, total, custo_total, qtd_itens,
      vendedor_01_id, vendedor_02_id, cliente_id, cliente_pessoa, cliente_documento, cliente_nome,
      cliente_endereco, cliente_complemento, cliente_bairro, cliente_cep, cliente_municipio, cliente_estado,
      cliente_telefone_01, cliente_telefone_02, cliente_telefone_03, cliente_email, ultimo_evento_id, atualizado_em)
    values (
      v_loja, v_num, p->>'pedido_status',
      case when (p->>'data_emissao') ~ '^\d{8}$' then to_date(p->>'data_emissao', 'YYYYMMDD') end,
      syscol.ts_br(p->>'pedido_registrado_em'), v_alt,
      nullif(p->>'pedido_total', '')::numeric,
      (select sum(coalesce(nullif(i->>'item_total_custo', '')::numeric, 0))
         from jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) i),
      jsonb_array_length(coalesce(p->'itens', '[]'::jsonb)),
      nullif(nullif(p->>'vendedor_01_id', ''), '0'), v_v2,
      nullif(nullif(p->>'cliente_id', ''), '0'), p->>'cliente_pessoa', p->>'cliente_documento', p->>'cliente_nome',
      p->>'cliente_endereco', p->>'complem_cliente', p->>'cliente_bairro', p->>'cliente_cep',
      p->>'cliente_municipio', p->>'cliente_estado',
      p->>'cliente_telefone_01', p->>'cliente_telefone_02', p->>'cliente_telefone_03', p->>'cliente_email',
      new.id, now())
    on conflict (loja_empresa_id, numero) do update set
      status = excluded.status,
      data_emissao = excluded.data_emissao,
      registrado_em = coalesce(excluded.registrado_em, t.registrado_em),
      alterado_em = excluded.alterado_em,
      total = excluded.total,
      custo_total = excluded.custo_total,
      qtd_itens = excluded.qtd_itens,
      vendedor_01_id = excluded.vendedor_01_id,
      vendedor_02_id = excluded.vendedor_02_id,
      cliente_id = excluded.cliente_id, cliente_pessoa = excluded.cliente_pessoa,
      cliente_documento = excluded.cliente_documento, cliente_nome = excluded.cliente_nome,
      cliente_endereco = excluded.cliente_endereco, cliente_complemento = excluded.cliente_complemento,
      cliente_bairro = excluded.cliente_bairro, cliente_cep = excluded.cliente_cep,
      cliente_municipio = excluded.cliente_municipio, cliente_estado = excluded.cliente_estado,
      cliente_telefone_01 = excluded.cliente_telefone_01, cliente_telefone_02 = excluded.cliente_telefone_02,
      cliente_telefone_03 = excluded.cliente_telefone_03, cliente_email = excluded.cliente_email,
      ultimo_evento_id = excluded.ultimo_evento_id, atualizado_em = now();

    new.processado_em := now();
    new.erro_processamento := null;
  exception when others then
    new.processado_em := now();
    new.erro_processamento := sqlerrm;
  end;
  return new;
end $$;

create trigger trg_processar_evento
before insert on syscol.webhook_eventos
for each row execute function syscol.processar_evento();

-- Confere um token pelo hash guardado em syscol.config.
create function public.syscol_validar_token(p_chave text, p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_token is not null and exists (
    select 1 from syscol.config
    where chave = p_chave and valor = encode(extensions.digest(p_token, 'sha256'), 'hex'))
$$;

create function public.syscol_registrar_evento(
  p_token text, p_metodo text, p_content_type text,
  p_query jsonb, p_headers jsonb, p_corpo text, p_payload jsonb
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if not public.syscol_validar_token('webhook_token_sha256', p_token) then
    raise exception 'token invalido' using errcode = '28000';
  end if;
  insert into syscol.webhook_eventos (metodo, content_type, query_params, headers, corpo_texto, payload)
  values (p_metodo, p_content_type, p_query, p_headers, p_corpo, p_payload)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- API do Syscol: cópia bruta e aplicação
-- ---------------------------------------------------------------------------
create function public.syscol_salvar_api(p_tabela text, p_linhas jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_tabela not in ('pedidos', 'pedidos_itens', 'funcionarios', 'mapa_metamensal') then
    raise exception 'tabela não permitida: %', p_tabela;
  end if;
  insert into syscol.api_linhas (tabela, id, dados, sincronizado_em)
  select p_tabela, (l->>'id')::bigint, l, now()
  from jsonb_array_elements(p_linhas) l
  where l ? 'id'
  on conflict (tabela, id) do update set dados = excluded.dados, sincronizado_em = now();
  get diagnostics n = row_count;
  return n;
end $$;

create function public.syscol_log_sync(p_id bigint, p_resumo jsonb, p_erro text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if p_id is null then
    insert into syscol.api_sync_log (resumo) values (p_resumo) returning id into v;
    return v;
  end if;
  update syscol.api_sync_log set finalizado_em = now(), resumo = p_resumo, erro = p_erro where id = p_id;
  return p_id;
end $$;

create function public.syscol_aplicar_api() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_vend int; n_ped int; n_meta int; n_itens int;
begin
  -- Vendedores (funcionarios). Quem foi desativado aqui continua desativado.
  insert into syscol.vendedores as v (id, nome, ativo)
  select l.id::text, l.dados->>'nome', not coalesce((l.dados->>'excluido')::boolean, false)
  from syscol.api_linhas l where l.tabela = 'funcionarios'
  on conflict (id) do update set nome = excluded.nome, ativo = v.ativo and excluded.ativo, visto_ultimo_em = now();
  get diagnostics n_vend = row_count;

  -- Meta do mês (mapa_metamensal, mesref = 'AAAAMM')
  insert into syscol.metas_mensais as m (empresa_id, mesref, meta, dias_venda, atualizado_em)
  select coalesce(l.dados->>'empresaid', '1'), l.dados->>'mesref', nullif(l.dados->>'meta', '')::numeric, l.dados->>'diasvenda', now()
  from syscol.api_linhas l where l.tabela = 'mapa_metamensal' and coalesce(l.dados->>'mesref', '') <> ''
  on conflict (empresa_id, mesref) do update set meta = excluded.meta, dias_venda = excluded.dias_venda, atualizado_em = now();
  get diagnostics n_meta = row_count;

  -- Pedidos. Custo = custo de reposição dos itens não cancelados.
  with itens as (
    select (i.dados->>'pedidoid')::bigint as pedidoid,
           count(*) filter (where i.dados->>'canceladoem' is null) as qtd,
           sum(coalesce(nullif(i.dados->>'custoreposicao', '')::numeric, 0) * coalesce(nullif(i.dados->>'quantidade', '')::numeric, 1))
             filter (where i.dados->>'canceladoem' is null) as custo
    from syscol.api_linhas i where i.tabela = 'pedidos_itens'
    group by 1
  ), p as (
    select l.dados d, it.qtd, it.custo
    from syscol.api_linhas l left join itens it on it.pedidoid = l.id
    where l.tabela = 'pedidos'
  )
  insert into syscol.pedidos as t (
    loja_empresa_id, numero, status, status_codigo, data_emissao, registrado_em, alterado_em, total, custo_total, qtd_itens,
    vendedor_01_id, vendedor_02_id, perc_vendedor_01, perc_vendedor_02, cancelado_em, concluido_em,
    cliente_id, cliente_cep, cliente_bairro, cliente_municipio, cliente_estado, sincronizado_api_em, atualizado_em)
  select
    coalesce(d->>'empresaid', '1'),
    lpad(d->>'pedidonumero', 10, '0'),
    case (d->>'status')::int when 1 then 'PENDENTE' when 2 then 'CANCELADO' when 3 then 'CONCLUIDO' else 'STATUS ' || (d->>'status') end,
    (d->>'status')::int,
    ((d->>'criadoem')::timestamptz at time zone 'America/Sao_Paulo')::date,
    (d->>'registradoem')::timestamptz,
    coalesce((d->>'alteradoem')::timestamptz, (d->>'sys_alteradoem')::timestamptz),
    nullif(d->>'valortotal', '')::numeric,
    p.custo, p.qtd,
    nullif(nullif(d->>'vendedorprincipal', ''), '0'),
    nullif(nullif(d->>'vendedorsecundario', ''), '0'),
    nullif(d->>'principalpercvenda', '')::numeric,
    nullif(d->>'secundariopercvenda', '')::numeric,
    (d->>'canceladoem')::timestamptz,
    (d->>'concluidoem')::timestamptz,
    nullif(nullif(d->>'clienteid', ''), '0'),
    nullif(d->>'cep', ''), nullif(d->>'bairro', ''), nullif(d->>'cidade', ''), nullif(d->>'estado', ''),
    now(), now()
  from p
  where d->>'pedidonumero' is not null
  on conflict (loja_empresa_id, numero) do update set
    status = excluded.status, status_codigo = excluded.status_codigo,
    data_emissao = excluded.data_emissao, registrado_em = excluded.registrado_em,
    alterado_em = greatest(t.alterado_em, excluded.alterado_em),
    total = excluded.total,
    custo_total = coalesce(excluded.custo_total, t.custo_total),
    qtd_itens = coalesce(excluded.qtd_itens, t.qtd_itens),
    vendedor_01_id = excluded.vendedor_01_id, vendedor_02_id = excluded.vendedor_02_id,
    perc_vendedor_01 = excluded.perc_vendedor_01, perc_vendedor_02 = excluded.perc_vendedor_02,
    cancelado_em = excluded.cancelado_em, concluido_em = excluded.concluido_em,
    cliente_id = coalesce(t.cliente_id, excluded.cliente_id),
    cliente_cep = coalesce(t.cliente_cep, excluded.cliente_cep),
    cliente_bairro = coalesce(t.cliente_bairro, excluded.cliente_bairro),
    cliente_municipio = coalesce(t.cliente_municipio, excluded.cliente_municipio),
    cliente_estado = coalesce(t.cliente_estado, excluded.cliente_estado),
    sincronizado_api_em = now(), atualizado_em = now();
  get diagnostics n_ped = row_count;

  -- Itens
  insert into syscol.pedido_itens as t (
    id, pedido_id, loja_empresa_id, pedido_numero, produto_id, item, descricao, quantidade, valor_unitario,
    custo_reposicao, vendedor_id, cancelado_em, largura, comprimento, altura, brinde, servico, sincronizado_em)
  select i.id, (d->>'pedidoid')::bigint, coalesce(d->>'empresaid', '1'),
         lpad(coalesce(pd.dados->>'pedidonumero', d->>'pedidoid'), 10, '0'),
         nullif(d->>'produtoid', '')::bigint, nullif(d->>'item', '')::int, d->>'descricao',
         nullif(d->>'quantidade', '')::numeric, nullif(d->>'valorunitario', '')::numeric,
         nullif(d->>'custoreposicao', '')::numeric, nullif(nullif(d->>'vendedorid', ''), '0'),
         (d->>'canceladoem')::timestamptz, d->>'largura', d->>'comprimento', d->>'altura',
         (d->>'brinde')::boolean, (d->>'servico')::boolean, now()
  from syscol.api_linhas i
  cross join lateral (select i.dados as d) x
  left join syscol.api_linhas pd on pd.tabela = 'pedidos' and pd.id = (d->>'pedidoid')::bigint
  where i.tabela = 'pedidos_itens'
  on conflict (id) do update set
    pedido_id = excluded.pedido_id, pedido_numero = excluded.pedido_numero, produto_id = excluded.produto_id,
    item = excluded.item, descricao = excluded.descricao, quantidade = excluded.quantidade,
    valor_unitario = excluded.valor_unitario, custo_reposicao = excluded.custo_reposicao,
    vendedor_id = excluded.vendedor_id, cancelado_em = excluded.cancelado_em, largura = excluded.largura,
    comprimento = excluded.comprimento, altura = excluded.altura, brinde = excluded.brinde,
    servico = excluded.servico, sincronizado_em = now();
  get diagnostics n_itens = row_count;

  return jsonb_build_object('vendedores', n_vend, 'pedidos', n_ped, 'itens', n_itens, 'metas', n_meta);
end $$;

-- ---------------------------------------------------------------------------
-- Ranking (leitura pelo app)
-- ---------------------------------------------------------------------------
create function public.rpc_ranking_vendas(p_inicio date, p_fim date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_papel public.papel_usuario;
  v_gestao boolean;
  v_hoje date := syscol.hoje();
  v_mes_ini date := date_trunc('month', syscol.hoje())::date;
  v_mes_fim date := (date_trunc('month', syscol.hoje()) + interval '1 month - 1 day')::date;
  v_dias int;
  v_meta_padrao numeric;
  v_meta_mes numeric;
  r jsonb;
begin
  select p.papel into v_papel from public.perfis p where p.id = auth.uid() and p.ativo;
  if v_papel is null then
    raise exception 'Acesso não liberado para este usuário.' using errcode = '42501';
  end if;
  v_gestao := v_papel::text in ('gerente', 'admin');

  if p_inicio is null or p_fim is null or p_fim < p_inicio then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  if p_fim - p_inicio > 366 then
    raise exception 'Escolha um período de até um ano.' using errcode = '22023';
  end if;
  v_dias := p_fim - p_inicio + 1;

  select nullif(valor, '')::numeric into v_meta_padrao from syscol.config where chave = 'meta_diaria_padrao';
  select coalesce(
           (select m.meta from syscol.metas_mensais m where m.empresa_id = '1' and m.mesref = to_char(v_hoje, 'YYYYMM')),
           (select nullif(valor, '')::numeric from syscol.config where chave = 'meta_mensal_manual'))
    into v_meta_mes;

  with
  periodo as (
    select vendedor_id, sum(valor) as valor, sum(custo) as custo, count(distinct numero) as pedidos
    from syscol.vendas_por_vendedor
    where data_emissao between p_inicio and p_fim
    group by vendedor_id
  ),
  dia as (
    select vendedor_id, sum(valor) as valor, count(distinct numero) as pedidos
    from syscol.vendas_por_vendedor
    where data_emissao = v_hoje
    group by vendedor_id
  ),
  vend as (
    select v.id as vendedor_id,
           coalesce(pf.nome, initcap(lower(v.nome))) as nome,
           v.nome as nome_syscol,
           pf.id as perfil_id,
           pf.foto_path,
           round(coalesce(pe.valor, 0), 2) as valor,
           coalesce(pe.pedidos, 0) as pedidos,
           round(pe.valor / nullif(pe.pedidos, 0), 2) as ticket_medio,
           case when v_gestao and pe.valor > 0 then round(100 * (1 - pe.custo / pe.valor), 1) end as margem_pct,
           round(coalesce(d.valor, 0), 2) as hoje_valor,
           coalesce(d.pedidos, 0) as hoje_pedidos,
           coalesce(mv.meta_diaria, v_meta_padrao) as meta_diaria,
           mv.meta_diaria is not null as meta_propria
    from syscol.vendedores v
    left join public.perfis pf on pf.syscol_vendedor_id = v.id and pf.ativo
    left join periodo pe on pe.vendedor_id = v.id
    left join dia d on d.vendedor_id = v.id
    left join syscol.metas_vendedor mv on mv.vendedor_id = v.id
    where v.ativo
  ),
  pedidos_validos as (
    select p.* from syscol.pedidos p where not syscol.cancelado(p)
  )
  select jsonb_build_object(
    'gerado_em', now(),
    'hoje', v_hoje,
    'gestao', v_gestao,
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'vendedores', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.posicao)
      from (select row_number() over (order by vend.valor desc, vend.pedidos desc, vend.nome) as posicao, vend.* from vend) x
    ), '[]'::jsonb),
    'resumo', (
      select jsonb_build_object(
        'valor', coalesce(sum(total) filter (where data_emissao between p_inicio and p_fim), 0),
        'pedidos', count(*) filter (where data_emissao between p_inicio and p_fim),
        'ticket_medio', round(sum(total) filter (where data_emissao between p_inicio and p_fim)
                              / nullif(count(*) filter (where data_emissao between p_inicio and p_fim), 0), 2),
        'margem_pct', case when v_gestao then round(100 * (1 - sum(coalesce(custo_total, 0)) filter (where data_emissao between p_inicio and p_fim)
                              / nullif(sum(total) filter (where data_emissao between p_inicio and p_fim), 0)), 1) end,
        'anterior_inicio', p_inicio - v_dias,
        'anterior_fim', p_inicio - 1,
        'anterior_valor', coalesce(sum(total) filter (where data_emissao between p_inicio - v_dias and p_inicio - 1), 0),
        'anterior_pedidos', count(*) filter (where data_emissao between p_inicio - v_dias and p_inicio - 1))
      from pedidos_validos
      where data_emissao between p_inicio - v_dias and p_fim),
    'mes', (
      select jsonb_build_object(
        'inicio', v_mes_ini, 'fim', v_mes_fim,
        'dias_mes', extract(day from v_mes_fim)::int,
        'dias_passados', extract(day from v_hoje)::int,
        'dias_restantes', (v_mes_fim - v_hoje + 1),
        'valor', coalesce(sum(total), 0),
        'pedidos', count(*),
        'meta', v_meta_mes)
      from pedidos_validos where data_emissao between v_mes_ini and v_hoje),
    'diario', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', g.d::date, 'valor', coalesce(s.valor, 0), 'pedidos', coalesce(s.pedidos, 0)) order by g.d), '[]'::jsonb)
      from generate_series(p_inicio, p_fim, interval '1 day') g(d)
      left join (select data_emissao, sum(total) as valor, count(*) as pedidos from pedidos_validos
                 where data_emissao between p_inicio and p_fim group by data_emissao) s on s.data_emissao = g.d::date),
    'pedidos', case when v_gestao then (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.data_emissao desc, x.numero desc), '[]'::jsonb)
      from (
        select p.numero, p.data_emissao, p.status, syscol.cancelado(p) as cancelado, p.total, p.qtd_itens,
               coalesce(pf1.nome, initcap(lower(v1.nome))) as vendedor,
               coalesce(pf2.nome, initcap(lower(v2.nome))) as vendedor_2
        from syscol.pedidos p
        left join syscol.vendedores v1 on v1.id = p.vendedor_01_id
        left join syscol.vendedores v2 on v2.id = p.vendedor_02_id
        left join public.perfis pf1 on pf1.syscol_vendedor_id = p.vendedor_01_id
        left join public.perfis pf2 on pf2.syscol_vendedor_id = p.vendedor_02_id
        where p.data_emissao between p_inicio and p_fim
        order by p.data_emissao desc, p.numero desc
        limit 200) x) end,
    'config', case when v_gestao then jsonb_build_object(
        'meta_diaria_padrao', v_meta_padrao,
        'meta_mensal_manual', (select nullif(valor, '')::numeric from syscol.config where chave = 'meta_mensal_manual'),
        'meta_mes_do_syscol', exists (select 1 from syscol.metas_mensais m where m.empresa_id = '1' and m.mesref = to_char(v_hoje, 'YYYYMM') and m.meta > 0),
        'ultima_sincronizacao', (select max(finalizado_em) from syscol.api_sync_log where erro is null),
        'ultimo_webhook', (select max(recebido_em) from syscol.webhook_eventos where payload ? 'pedido_numero'),
        'vendedores_syscol', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'nome', v.nome, 'ativo', v.ativo) order by v.nome), '[]'::jsonb) from syscol.vendedores v),
        'perfis', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'papel', p.papel, 'syscol_vendedor_id', p.syscol_vendedor_id) order by p.nome), '[]'::jsonb)
                   from public.perfis p where p.ativo and p.papel::text <> 'tv')) end
  ) into r;

  return r;
end $$;

-- Metas: padrão diária e manual do mês (gerente/admin)
create function public.rpc_ranking_salvar_metas(p_meta_diaria_padrao numeric, p_meta_mensal_manual numeric)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.fn_papel_atual()::text, '') not in ('gerente', 'admin') then
    raise exception 'Só gerentes e administradores alteram as metas.' using errcode = '42501';
  end if;
  if coalesce(p_meta_diaria_padrao, 0) < 0 or coalesce(p_meta_mensal_manual, 0) < 0 then
    raise exception 'A meta não pode ser negativa.' using errcode = '22023';
  end if;
  insert into syscol.config (chave, valor) values
    ('meta_diaria_padrao', nullif(p_meta_diaria_padrao, 0)::text),
    ('meta_mensal_manual', nullif(p_meta_mensal_manual, 0)::text)
  on conflict (chave) do update set valor = excluded.valor;
end $$;

-- Meta diária de um vendedor (null = usa a padrão)
create function public.rpc_ranking_meta_vendedor(p_vendedor_id text, p_meta_diaria numeric)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.fn_papel_atual()::text, '') not in ('gerente', 'admin') then
    raise exception 'Só gerentes e administradores alteram as metas.' using errcode = '42501';
  end if;
  if coalesce(p_meta_diaria, 0) < 0 then
    raise exception 'A meta não pode ser negativa.' using errcode = '22023';
  end if;
  if not exists (select 1 from syscol.vendedores where id = p_vendedor_id) then
    raise exception 'Vendedor não encontrado.' using errcode = '22023';
  end if;
  insert into syscol.metas_vendedor (vendedor_id, meta_diaria, atualizado_em, atualizado_por)
  values (p_vendedor_id, nullif(p_meta_diaria, 0), now(), auth.uid())
  on conflict (vendedor_id) do update set meta_diaria = excluded.meta_diaria, atualizado_em = now(), atualizado_por = auth.uid();
end $$;

-- Liga um usuário do app a um vendedor do Syscol (admin). p_vendedor_id null desliga.
create function public.rpc_ranking_vincular(p_perfil_id uuid, p_vendedor_id text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.fn_papel_atual() is distinct from 'admin' then
    raise exception 'Só administradores ligam usuários aos vendedores do Syscol.' using errcode = '42501';
  end if;
  if p_vendedor_id is not null and not exists (select 1 from syscol.vendedores where id = p_vendedor_id) then
    raise exception 'Vendedor do Syscol não encontrado.' using errcode = '22023';
  end if;
  update public.perfis set syscol_vendedor_id = null
   where syscol_vendedor_id = p_vendedor_id and id <> p_perfil_id;
  update public.perfis set syscol_vendedor_id = p_vendedor_id where id = p_perfil_id;
end $$;

-- Mostra ou esconde um vendedor do Syscol no ranking (admin)
create function public.rpc_ranking_vendedor_ativo(p_vendedor_id text, p_ativo boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.fn_papel_atual() is distinct from 'admin' then
    raise exception 'Só administradores escondem vendedores do ranking.' using errcode = '42501';
  end if;
  update syscol.vendedores set ativo = coalesce(p_ativo, true) where id = p_vendedor_id;
end $$;

-- ---------------------------------------------------------------------------
-- Avisos (novo 1º lugar do mês e meta do dia batida), enviados por push
-- pela Edge Function syscol-avisos. Cada aviso é reservado uma única vez.
-- ---------------------------------------------------------------------------
create function public.fn_reservar_avisos_vendas() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_hoje date := syscol.hoje();
  v_mes text := to_char(syscol.hoje(), 'YYYYMM');
  v_ini date := date_trunc('month', syscol.hoje())::date;
  v_meta_padrao numeric;
  v_lider record;
  v_anterior text;
  v_avisos jsonb := '[]'::jsonb;
  v_m record;
begin
  select nullif(valor, '')::numeric into v_meta_padrao from syscol.config where chave = 'meta_diaria_padrao';

  -- Líder do mês
  select v.id, coalesce(pf.nome, initcap(lower(v.nome))) as nome, sum(s.valor) as valor
    into v_lider
  from syscol.vendas_por_vendedor s
  join syscol.vendedores v on v.id = s.vendedor_id and v.ativo
  left join public.perfis pf on pf.syscol_vendedor_id = v.id and pf.ativo
  where s.data_emissao between v_ini and v_hoje
  group by v.id, pf.nome, v.nome
  having sum(s.valor) > 0
  order by sum(s.valor) desc, v.id
  limit 1;

  select valor into v_anterior from syscol.estado where chave = 'lider_mes';
  if v_lider.id is not null then
    if v_anterior is not null and split_part(v_anterior, ':', 1) = v_mes and split_part(v_anterior, ':', 2) <> v_lider.id then
      insert into syscol.avisos_enviados (chave, tipo, vendedor_id, dados)
      values ('lider:' || v_mes || ':' || v_lider.id || ':' || extract(epoch from now())::bigint, 'lider', v_lider.id,
              jsonb_build_object('nome', v_lider.nome, 'valor', round(v_lider.valor, 2)))
      on conflict do nothing;
      v_avisos := v_avisos || jsonb_build_array(jsonb_build_object(
        'tipo', 'lider', 'vendedor_id', v_lider.id, 'nome', v_lider.nome, 'valor', round(v_lider.valor, 2)));
    end if;
    insert into syscol.estado (chave, valor, atualizado_em) values ('lider_mes', v_mes || ':' || v_lider.id, now())
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
  end if;

  -- Meta do dia
  for v_m in
    with dia as (
      select vendedor_id, sum(valor) as valor from syscol.vendas_por_vendedor
      where data_emissao = v_hoje group by vendedor_id
    )
    select v.id, coalesce(pf.nome, initcap(lower(v.nome))) as nome, round(d.valor, 2) as valor,
           coalesce(mv.meta_diaria, v_meta_padrao) as meta
    from dia d
    join syscol.vendedores v on v.id = d.vendedor_id and v.ativo
    left join public.perfis pf on pf.syscol_vendedor_id = v.id and pf.ativo
    left join syscol.metas_vendedor mv on mv.vendedor_id = v.id
    where coalesce(mv.meta_diaria, v_meta_padrao) > 0 and d.valor >= coalesce(mv.meta_diaria, v_meta_padrao)
  loop
    insert into syscol.avisos_enviados (chave, tipo, vendedor_id, dados)
    values ('meta:' || v_hoje || ':' || v_m.id, 'meta', v_m.id, jsonb_build_object('nome', v_m.nome, 'valor', v_m.valor, 'meta', v_m.meta))
    on conflict do nothing;
    if found then
      v_avisos := v_avisos || jsonb_build_array(jsonb_build_object(
        'tipo', 'meta', 'vendedor_id', v_m.id, 'nome', v_m.nome, 'valor', v_m.valor, 'meta', v_m.meta));
    end if;
  end loop;

  return v_avisos;
end $$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke all on function public.syscol_validar_token(text, text) from public, anon, authenticated;
revoke all on function public.syscol_registrar_evento(text, text, text, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.syscol_salvar_api(text, jsonb) from public, anon, authenticated;
revoke all on function public.syscol_log_sync(bigint, jsonb, text) from public, anon, authenticated;
revoke all on function public.syscol_aplicar_api() from public, anon, authenticated;
revoke all on function public.fn_reservar_avisos_vendas() from public, anon, authenticated;
grant execute on function public.syscol_validar_token(text, text) to service_role;
grant execute on function public.syscol_registrar_evento(text, text, text, jsonb, jsonb, text, jsonb) to service_role;
grant execute on function public.syscol_salvar_api(text, jsonb) to service_role;
grant execute on function public.syscol_log_sync(bigint, jsonb, text) to service_role;
grant execute on function public.syscol_aplicar_api() to service_role;
grant execute on function public.fn_reservar_avisos_vendas() to service_role;

revoke all on function public.rpc_ranking_vendas(date, date) from public, anon;
revoke all on function public.rpc_ranking_salvar_metas(numeric, numeric) from public, anon;
revoke all on function public.rpc_ranking_meta_vendedor(text, numeric) from public, anon;
revoke all on function public.rpc_ranking_vincular(uuid, text) from public, anon;
revoke all on function public.rpc_ranking_vendedor_ativo(text, boolean) from public, anon;
grant execute on function public.rpc_ranking_vendas(date, date) to authenticated;
grant execute on function public.rpc_ranking_salvar_metas(numeric, numeric) to authenticated;
grant execute on function public.rpc_ranking_meta_vendedor(text, numeric) to authenticated;
grant execute on function public.rpc_ranking_vincular(uuid, text) to authenticated;
grant execute on function public.rpc_ranking_vendedor_ativo(text, boolean) to authenticated;
