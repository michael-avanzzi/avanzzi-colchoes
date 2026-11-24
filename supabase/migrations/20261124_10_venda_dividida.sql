-- Venda dividida entre vendedores: decisão da gestão (24/11/2026).
--
-- Pedido com vendedor secundário: o valor e o custo são repartidos pelo
-- percentual de venda de cada um no Syscol (principalpercvenda /
-- secundariopercvenda; 50/50 se nenhum percentual vier preenchido).
-- Nesse caso o ranking difere de propósito do relatório do Syscol, que
-- credita o pedido inteiro ao vendedor dos itens.
--
-- Demais pedidos: pelo vendedor marcado em cada item (migração 09), com
-- 100% para o vendedor principal enquanto os itens não chegam pela API.
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
-- 1. Pedidos divididos: pelo percentual de cada vendedor
select p.loja_empresa_id, p.numero, p.data_emissao, v.vendedor_id,
       p.total * v.fator as valor,
       coalesce(p.custo_total, 0) * v.fator as custo,
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
-- 2. Demais pedidos com itens: pelo vendedor dos itens
select p.loja_empresa_id, p.numero, p.data_emissao, i.vendedor_id,
       case when t.valor_itens > 0 then p.total * i.valor_itens / t.valor_itens else 0 end,
       i.custo_itens,
       case when t.valor_itens > 0 then i.valor_itens / t.valor_itens else 0 end
from syscol.pedidos p
join itens i on i.loja_empresa_id = p.loja_empresa_id and i.pedido_numero = p.numero
join totais t on t.loja_empresa_id = p.loja_empresa_id and t.pedido_numero = p.numero
where not syscol.cancelado(p) and i.vendedor_id is not null
union all
-- 3. Pedidos sem itens ainda (recém-chegados pelo webhook): 100% do principal
select p.loja_empresa_id, p.numero, p.data_emissao, p.vendedor_01_id,
       p.total, coalesce(p.custo_total, 0), 1.0
from syscol.pedidos p
where not syscol.cancelado(p)
  and p.vendedor_01_id is not null
  and p.vendedor_02_id is null
  and not exists (
    select 1 from syscol.pedido_itens i
    where i.loja_empresa_id = p.loja_empresa_id and i.pedido_numero = p.numero and i.cancelado_em is null);
