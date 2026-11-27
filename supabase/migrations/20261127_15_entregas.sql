-- ===========================================================================
-- ENTREGAS: semana de entregas a partir do Syscol
--
-- Data da entrega = data da minuta (ficha de entrega) quando existe; senão, a
-- data prometida ao cliente no pedido (promessa_data1).
-- Quem vê: vendedor vê os pedidos dele (principal ou secundário); logística,
-- gerente e admin veem todos. A conta da TV não vê.
--
-- Situação de cada item (código "entrega" de pedidos_itens no Syscol, lido dos
-- dados; a confirmar com a Fábrica de Sistemas):
--   concluído (concluidoem) = entregue · 16 = em carga · 1 = disponível ·
--   2 = aguardando fabricar · 7 = vale brinde · outros = "outro".
-- Pronto para entregar: nenhum item aguardando fabricar. Risco de atraso:
-- algum item aguardando fabricar cujo pedido de compra ao fabricante tem
-- entrega prevista depois da data da entrega ao cliente.
-- ===========================================================================

-- Logística fica fora da agenda (as regras da agenda tratam qualquer papel
-- diferente de "vendedor" como gestão), como a conta da TV.
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
    and p.papel::text not in ('tv', 'logistica')
$$;

-- Notificações: qualquer usuário ativo (menos a TV) pode inscrever o aparelho.
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
  if not exists (select 1 from public.perfis p where p.id = auth.uid() and p.ativo and p.papel::text <> 'tv') then
    raise exception 'Acesso não liberado para este usuário.' using errcode = '42501';
  end if;

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

-- Sincronização: novas tabelas do Syscol na cópia bruta.
create or replace function public.syscol_salvar_api(p_tabela text, p_linhas jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_tabela not in ('pedidos', 'pedidos_itens', 'funcionarios', 'mapa_metamensal',
                      'minuta', 'cargas', 'estoque_posicao', 'pedidocompra', 'pedidocompra_itens', 'clientes') then
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

create index if not exists ix_api_linhas_pedidoid
  on syscol.api_linhas (((dados->>'pedidoid')::bigint)) where tabela in ('pedidos_itens', 'minuta', 'pedidocompra_itens');

-- Data (dia) em Brasília de um carimbo do Syscol ('2026-11-27T03:00:00Z' = dia 27).
create or replace function syscol.dia_br(t text) returns date
language sql immutable set search_path = '' as $$
  select case when coalesce(t, '') = '' then null else (t::timestamptz at time zone 'America/Sao_Paulo')::date end
$$;

create or replace function syscol.situacao_item(p_entrega text, p_concluido text) returns text
language sql immutable set search_path = '' as $$
  select case
    when coalesce(p_concluido, '') <> '' then 'entregue'
    when p_entrega = '16' then 'em_carga'
    when p_entrega = '1' then 'disponivel'
    when p_entrega = '2' then 'aguardando_fabricar'
    when p_entrega = '7' then 'brinde'
    else 'outro' end
$$;

-- Todas as entregas (um pedido = uma entrega), com itens e prontidão.
create or replace view syscol.entregas as
with
ped as (
  select l.id as pedido_id, l.dados d
  from syscol.api_linhas l
  where l.tabela = 'pedidos'
    and coalesce((l.dados->>'status')::int, 0) <> 2
    and l.dados->>'canceladoem' is null
),
min as (
  select distinct on ((m.dados->>'pedidoid')::bigint) (m.dados->>'pedidoid')::bigint as pedido_id, m.dados d
  from syscol.api_linhas m
  where m.tabela = 'minuta' and coalesce((m.dados->>'pedidoid')::bigint, 0) > 0
  order by (m.dados->>'pedidoid')::bigint, m.id desc
),
compra as (
  select ci.id as item_compra_id, syscol.dia_br(pc.dados->>'entregaprevista') as previsao,
         coalesce((pc.dados->>'concluido')::boolean, false) as concluido
  from syscol.api_linhas ci
  join syscol.api_linhas pc on pc.tabela = 'pedidocompra' and pc.id = (ci.dados->>'pedidoid')::bigint
  where ci.tabela = 'pedidocompra_itens'
),
itens as (
  select (i.dados->>'pedidoid')::bigint as pedido_id,
         i.id as item_id,
         coalesce(nullif(i.dados->>'item', '')::int, 0) as ordem,
         i.dados->>'descricao' as descricao,
         coalesce(nullif(i.dados->>'quantidade', '')::numeric, 1) as quantidade,
         syscol.situacao_item(i.dados->>'entrega', i.dados->>'concluidoem') as situacao,
         i.dados->>'entrega' as codigo,
         nullif(nullif(i.dados->>'cargaid', ''), '0')::bigint as carga_id,
         c.previsao as previsao_fabricante
  from syscol.api_linhas i
  left join compra c on c.item_compra_id = nullif(nullif(i.dados->>'pedidocompraitemid', ''), '0')::bigint
  where i.tabela = 'pedidos_itens' and i.dados->>'canceladoem' is null
),
base as (
  select p.pedido_id,
         lpad(p.d->>'pedidonumero', 10, '0') as numero,
         coalesce(syscol.dia_br(m.d->>'dataentrega'), syscol.dia_br(p.d->>'promessa_data1')) as data_entrega,
         case when syscol.dia_br(m.d->>'dataentrega') is not null then 'minuta' else 'prometida' end as origem_data,
         case when p.d->>'promessa_horastatus' = '2' and coalesce(p.d->>'promessa_hora1', '') ~ '^\d{2}:\d{2}$'
              then p.d->>'promessa_hora1' end as hora,
         nullif(m.d->>'entregaagendada', '') as observacao_entrega,
         nullif(nullif(p.d->>'vendedorprincipal', ''), '0') as vendedor_01_id,
         nullif(nullif(p.d->>'vendedorsecundario', ''), '0') as vendedor_02_id,
         nullif(nullif(p.d->>'clienteid', ''), '0') as cliente_id,
         m.d as minuta,
         p.d as pedido
  from ped p
  left join min m on m.pedido_id = p.pedido_id
)
select b.pedido_id, b.numero, b.data_entrega, b.origem_data, b.hora, b.observacao_entrega,
       b.vendedor_01_id, b.vendedor_02_id,
       coalesce(nullif(b.minuta->>'clientenome', ''), sp.cliente_nome, cl.dados->>'nome') as cliente,
       coalesce(nullif(b.minuta->>'clientetelefone1', ''), nullif(b.pedido->>'fone1', ''), sp.cliente_telefone_01) as telefone,
       coalesce(nullif(b.minuta->>'clienteendereco', ''),
                nullif(concat_ws(', ', nullif(b.pedido->>'endereco', ''), nullif(b.pedido->>'numero', '')), ''),
                sp.cliente_endereco) as endereco,
       coalesce(nullif(b.minuta->>'clientecomplemento', ''), nullif(b.pedido->>'complemento', ''), sp.cliente_complemento) as complemento,
       coalesce(nullif(b.minuta->>'clientebairro', ''), nullif(b.pedido->>'bairro', ''), sp.cliente_bairro) as bairro,
       coalesce(nullif(b.minuta->>'clientecidade', ''), nullif(b.pedido->>'cidade', ''), sp.cliente_municipio) as cidade,
       coalesce(nullif(b.minuta->>'clienteestado', ''), nullif(b.pedido->>'estado', ''), sp.cliente_estado) as estado,
       coalesce(nullif(b.minuta->>'clientecep', ''), nullif(b.pedido->>'cep', ''), sp.cliente_cep) as cep,
       nullif(b.minuta->>'clientepontoreferencia', '') as ponto_referencia,
       nullif(nullif(b.minuta->>'cargaid', ''), '0')::bigint as carga_id,
       nullif(b.minuta->>'ordementrega', '')::int as ordem_entrega,
       ca.dados->>'descricao' as carga_descricao,
       (ca.dados->>'status')::int as carga_status,
       syscol.dia_br(ca.dados->>'datasaida') as carga_saida,
       ca.dados->>'conclusaodata' is not null as carga_concluida,
       nullif(ca.dados->>'distanciaestimada', '')::numeric as carga_km,
       it.itens,
       it.total_itens,
       it.entregues,
       it.aguardando,
       it.em_carga,
       it.previsao_fabricante,
       case
         when it.total_itens > 0 and it.entregues = it.total_itens then 'entregue'
         when it.aguardando > 0 and it.previsao_fabricante is not null and b.data_entrega is not null
              and it.previsao_fabricante > b.data_entrega then 'risco'
         when it.aguardando > 0 then 'aguardando'
         else 'pronto' end as prontidao
from base b
left join syscol.pedidos sp on sp.numero = b.numero
left join syscol.api_linhas cl on cl.tabela = 'clientes' and cl.id = b.cliente_id::bigint
left join syscol.api_linhas ca on ca.tabela = 'cargas' and ca.id = nullif(nullif(b.minuta->>'cargaid', ''), '0')::bigint
left join lateral (
  select coalesce(jsonb_agg(jsonb_build_object(
           'descricao', i.descricao, 'quantidade', i.quantidade, 'situacao', i.situacao, 'codigo', i.codigo,
           'previsao_fabricante', i.previsao_fabricante) order by i.ordem, i.item_id), '[]'::jsonb) as itens,
         count(*) as total_itens,
         count(*) filter (where i.situacao = 'entregue') as entregues,
         count(*) filter (where i.situacao = 'aguardando_fabricar') as aguardando,
         count(*) filter (where i.situacao = 'em_carga') as em_carga,
         max(i.previsao_fabricante) filter (where i.situacao = 'aguardando_fabricar') as previsao_fabricante
  from itens i where i.pedido_id = b.pedido_id
) it on true;

-- Leitura pelo app: entregas do período + atrasadas (data passada, não entregues).
create or replace function public.rpc_entregas(p_inicio date, p_fim date, p_vendedor_id text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_papel text;
  v_meu_vendedor text;
  v_todos boolean;
  v_hoje date := syscol.hoje();
  r jsonb;
begin
  select p.papel::text, p.syscol_vendedor_id into v_papel, v_meu_vendedor
  from public.perfis p where p.id = auth.uid() and p.ativo;
  if v_papel is null or v_papel = 'tv' then
    raise exception 'Acesso não liberado para este usuário.' using errcode = '42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 62 then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  v_todos := v_papel in ('admin', 'gerente', 'logistica');

  with
  visiveis as (
    select e.* from syscol.entregas e
    where e.data_entrega is not null
      and (
        (v_todos and (p_vendedor_id is null or p_vendedor_id in (e.vendedor_01_id, e.vendedor_02_id)))
        or (not v_todos and v_meu_vendedor is not null and v_meu_vendedor in (e.vendedor_01_id, e.vendedor_02_id))
      )
  ),
  linhas as (
    select v.*,
           coalesce(pf.nome, initcap(lower(sv.nome))) as vendedor,
           v.data_entrega < v_hoje and v.prontidao <> 'entregue' as atrasada
    from visiveis v
    left join syscol.vendedores sv on sv.id = v.vendedor_01_id
    left join public.perfis pf on pf.syscol_vendedor_id = v.vendedor_01_id and pf.ativo
  )
  select jsonb_build_object(
    'hoje', v_hoje,
    'papel', v_papel,
    'todos', v_todos,
    'vinculado', v_todos or v_meu_vendedor is not null,
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'entregas', coalesce((
      select jsonb_agg(to_jsonb(l) - 'vendedor_01_id' - 'vendedor_02_id' - 'pedido_id'
                       order by l.data_entrega, l.carga_id nulls last, l.ordem_entrega nulls last, l.hora nulls last, l.numero)
      from linhas l where l.data_entrega between p_inicio and p_fim), '[]'::jsonb),
    'atrasadas', coalesce((
      select jsonb_agg(to_jsonb(l) - 'vendedor_01_id' - 'vendedor_02_id' - 'pedido_id' order by l.data_entrega, l.numero)
      from (select * from linhas where atrasada and data_entrega < p_inicio order by data_entrega desc limit 100) l), '[]'::jsonb),
    'vendedores', case when v_todos then (
      select coalesce(jsonb_agg(jsonb_build_object('id', sv.id, 'nome', coalesce(pf.nome, initcap(lower(sv.nome)))) order by coalesce(pf.nome, sv.nome)), '[]'::jsonb)
      from syscol.vendedores sv
      left join public.perfis pf on pf.syscol_vendedor_id = sv.id and pf.ativo
      where sv.ativo) end
  ) into r;
  return r;
end $$;

revoke all on function public.rpc_entregas(date, date, text) from public, anon;
grant execute on function public.rpc_entregas(date, date, text) to authenticated;
