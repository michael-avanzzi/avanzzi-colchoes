-- Trocas: o crédito do cliente não conta como venda nova.
--
-- No Syscol, o pedido de troca tem pedidocomtroca = true e valordevolucao =
-- valor dos itens devolvidos de um pedido anterior (vinculodevolucao lista os
-- itens). Exemplo: pedido 168 (R$ 3.250) com devolução de R$ 2.650 dos itens do
-- pedido 107. O pedido original continua contando; o de troca conta só a
-- diferença paga (R$ 600). Decisão da gestão em 25/11/2026.
--
-- Como funciona: quem grava em syscol.pedidos (webhook e sincronização) grava
-- o valor CHEIO em total / custo_total. O gatilho abaixo guarda o cheio em
-- total_bruto / custo_bruto, lê a devolução da cópia da API (syscol.api_linhas)
-- e deixa em total o valor que conta como venda: total_bruto - devolução
-- (nunca negativo). O custo cai na mesma proporção.
-- Pedido recém-chegado pelo webhook conta cheio até a próxima sincronização
-- (até 10 minutos), quando a devolução chega pela API.

alter table syscol.pedidos
  add column valor_venda numeric(14,2),
  add column custo_venda numeric(14,2),
  add column troca boolean not null default false,
  add column valor_devolucao numeric(14,2) not null default 0,
  add column vinculo_devolucao text;

comment on column syscol.pedidos.total is 'Total do pedido no Syscol (valortotal), sem abater troca.';
comment on column syscol.pedidos.valor_venda is
  'Valor que conta como venda: total menos a devolução de troca (crédito do cliente), nunca negativo.';
comment on column syscol.pedidos.custo_venda is 'Custo na mesma proporção de valor_venda / total.';
comment on column syscol.pedidos.valor_devolucao is 'Crédito de itens devolvidos usado neste pedido (valordevolucao).';

create index if not exists ix_api_linhas_pedidonumero
  on syscol.api_linhas ((dados->>'pedidonumero')) where tabela = 'pedidos';

-- Calcula valor_venda / custo_venda a partir de total / custo_total e da
-- devolução lida da cópia da API. Não altera total nem custo_total, então pode
-- rodar quantas vezes for preciso (inclusive duas vezes num upsert).
create or replace function syscol.aplicar_troca() returns trigger
language plpgsql set search_path = '' as $$
declare
  d jsonb;
begin
  select l.dados into d
  from syscol.api_linhas l
  where l.tabela = 'pedidos'
    and l.dados->>'pedidonumero' = ltrim(new.numero, '0')
    and coalesce(l.dados->>'empresaid', '1') = new.loja_empresa_id
  limit 1;

  if d is not null then
    new.troca := coalesce((d->>'pedidocomtroca')::boolean, false);
    new.valor_devolucao := greatest(coalesce(nullif(d->>'valordevolucao', '')::numeric, 0), 0);
    new.vinculo_devolucao := nullif(d->>'vinculodevolucao', '');
  end if;

  new.valor_venda := greatest(coalesce(new.total, 0) - coalesce(new.valor_devolucao, 0), 0);
  new.custo_venda := case
    when new.custo_total is null then null
    when coalesce(new.total, 0) > 0 then round(new.custo_total * new.valor_venda / new.total, 2)
    else new.custo_total end;
  return new;
end $$;

create trigger trg_aplicar_troca
before insert or update on syscol.pedidos
for each row execute function syscol.aplicar_troca();

-- Venda por vendedor (regras da migração 10) com o custo dos itens na mesma
-- proporção do valor quando o pedido é de troca.
create or replace view syscol.vendas_por_vendedor as
with divididos as (
  select p.* from syscol.pedidos p
  where not syscol.cancelado(p) and p.vendedor_01_id is not null and p.vendedor_02_id is not null
),
itens as (
  select i.loja_empresa_id, i.pedido_numero,
         coalesce(i.vendedor_id, p.vendedor_01_id) as vendedor_id,
         sum(coalesce(i.valor_unitario, 0) * coalesce(i.quantidade, 1)) as valor_itens,
         sum(coalesce(i.custo_reposicao, 0) * coalesce(i.quantidade, 1)) as custo_itens
  from syscol.pedido_itens i
  join syscol.pedidos p on p.loja_empresa_id = i.loja_empresa_id and p.numero = i.pedido_numero
  where i.cancelado_em is null and p.vendedor_02_id is null
  group by 1, 2, 3
),
totais as (
  select loja_empresa_id, pedido_numero, sum(valor_itens) as valor_itens
  from itens group by 1, 2
)
select p.loja_empresa_id, p.numero, p.data_emissao, v.vendedor_id,
       p.valor_venda * v.fator as valor,
       coalesce(p.custo_venda, 0) * v.fator as custo,
       v.fator as participacao
from divididos p
cross join lateral (
  select p.vendedor_01_id as vendedor_id,
         case when coalesce(p.perc_vendedor_01, 0) + coalesce(p.perc_vendedor_02, 0) > 0
              then coalesce(p.perc_vendedor_01, 0) / (coalesce(p.perc_vendedor_01, 0) + coalesce(p.perc_vendedor_02, 0))
              else 0.5 end as fator
  union all
  select p.vendedor_02_id,
         case when coalesce(p.perc_vendedor_01, 0) + coalesce(p.perc_vendedor_02, 0) > 0
              then coalesce(p.perc_vendedor_02, 0) / (coalesce(p.perc_vendedor_01, 0) + coalesce(p.perc_vendedor_02, 0))
              else 0.5 end
) v
union all
select p.loja_empresa_id, p.numero, p.data_emissao, i.vendedor_id,
       case when t.valor_itens > 0 then p.valor_venda * i.valor_itens / t.valor_itens else 0 end,
       i.custo_itens * case when coalesce(p.total, 0) > 0 then p.valor_venda / p.total else 1 end,
       case when t.valor_itens > 0 then i.valor_itens / t.valor_itens else 0 end
from syscol.pedidos p
join itens i on i.loja_empresa_id = p.loja_empresa_id and i.pedido_numero = p.numero
join totais t on t.loja_empresa_id = p.loja_empresa_id and t.pedido_numero = p.numero
where not syscol.cancelado(p) and i.vendedor_id is not null
union all
select p.loja_empresa_id, p.numero, p.data_emissao, p.vendedor_01_id,
       p.valor_venda, coalesce(p.custo_venda, 0), 1.0
from syscol.pedidos p
where not syscol.cancelado(p)
  and p.vendedor_01_id is not null
  and p.vendedor_02_id is null
  and not exists (
    select 1 from syscol.pedido_itens i
    where i.loja_empresa_id = p.loja_empresa_id and i.pedido_numero = p.numero and i.cancelado_em is null);

-- Ranking: totais, mês e dia pelo valor que conta como venda; lista de pedidos
-- mostra também o total do Syscol e a troca.
create or replace function public.rpc_ranking_vendas(p_inicio date, p_fim date)
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
        'valor', coalesce(sum(valor_venda) filter (where data_emissao between p_inicio and p_fim), 0),
        'pedidos', count(*) filter (where data_emissao between p_inicio and p_fim),
        'ticket_medio', round(sum(valor_venda) filter (where data_emissao between p_inicio and p_fim)
                              / nullif(count(*) filter (where data_emissao between p_inicio and p_fim), 0), 2),
        'margem_pct', case when v_gestao then round(100 * (1 - sum(coalesce(custo_venda, 0)) filter (where data_emissao between p_inicio and p_fim)
                              / nullif(sum(valor_venda) filter (where data_emissao between p_inicio and p_fim), 0)), 1) end,
        'anterior_inicio', p_inicio - v_dias,
        'anterior_fim', p_inicio - 1,
        'anterior_valor', coalesce(sum(valor_venda) filter (where data_emissao between p_inicio - v_dias and p_inicio - 1), 0),
        'anterior_pedidos', count(*) filter (where data_emissao between p_inicio - v_dias and p_inicio - 1))
      from pedidos_validos
      where data_emissao between p_inicio - v_dias and p_fim),
    'mes', (
      select jsonb_build_object(
        'inicio', v_mes_ini, 'fim', v_mes_fim,
        'dias_mes', extract(day from v_mes_fim)::int,
        'dias_passados', extract(day from v_hoje)::int,
        'dias_restantes', (v_mes_fim - v_hoje + 1),
        'valor', coalesce(sum(valor_venda), 0),
        'pedidos', count(*),
        'meta', v_meta_mes)
      from pedidos_validos where data_emissao between v_mes_ini and v_hoje),
    'diario', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', g.d::date, 'valor', coalesce(s.valor, 0), 'pedidos', coalesce(s.pedidos, 0)) order by g.d), '[]'::jsonb)
      from generate_series(p_inicio, p_fim, interval '1 day') g(d)
      left join (select data_emissao, sum(valor_venda) as valor, count(*) as pedidos from pedidos_validos
                 where data_emissao between p_inicio and p_fim group by data_emissao) s on s.data_emissao = g.d::date),
    'pedidos', case when v_gestao then (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.data_emissao desc, x.numero desc), '[]'::jsonb)
      from (
        select p.numero, p.data_emissao, p.status, syscol.cancelado(p) as cancelado,
               p.valor_venda as total, p.total as total_pedido, p.troca, p.valor_devolucao, p.qtd_itens,
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

-- Pedidos já gravados: calcula valor_venda / custo_venda.
update syscol.pedidos set atualizado_em = atualizado_em;
