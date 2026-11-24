-- Venda de cada vendedor igual ao Syscol: pelo vendedor marcado em cada ITEM
-- do pedido (pedidos_itens.vendedorid), e não pelo percentual de divisão do
-- pedido (principalpercvenda/secundariopercvenda), que o Syscol usa para comissão.
--
-- Valor de cada vendedor = total do pedido × (valor dos itens dele ÷ valor de
-- todos os itens), o que reparte frete e desconto na mesma proporção.
-- Custo de cada vendedor = custo de reposição dos itens dele.
-- Pedido sem itens sincronizados (recém-chegado pelo webhook, antes da próxima
-- sincronização com a API): conta 100% para o vendedor principal.
create or replace view syscol.vendas_por_vendedor as
with itens as (
  select i.loja_empresa_id, i.pedido_numero,
         coalesce(i.vendedor_id, p.vendedor_01_id) as vendedor_id,
         sum(coalesce(i.valor_unitario, 0) * coalesce(i.quantidade, 1)) as valor_itens,
         sum(coalesce(i.custo_reposicao, 0) * coalesce(i.quantidade, 1)) as custo_itens
  from syscol.pedido_itens i
  join syscol.pedidos p on p.loja_empresa_id = i.loja_empresa_id and p.numero = i.pedido_numero
  where i.cancelado_em is null
  group by 1, 2, 3
),
totais as (
  select loja_empresa_id, pedido_numero, sum(valor_itens) as valor_itens
  from itens group by 1, 2
)
select p.loja_empresa_id, p.numero, p.data_emissao, i.vendedor_id,
       case when t.valor_itens > 0 then p.total * i.valor_itens / t.valor_itens else 0 end as valor,
       i.custo_itens as custo,
       case when t.valor_itens > 0 then i.valor_itens / t.valor_itens else 0 end as participacao
from syscol.pedidos p
join itens i on i.loja_empresa_id = p.loja_empresa_id and i.pedido_numero = p.numero
join totais t on t.loja_empresa_id = p.loja_empresa_id and t.pedido_numero = p.numero
where not syscol.cancelado(p) and i.vendedor_id is not null
union all
select p.loja_empresa_id, p.numero, p.data_emissao, p.vendedor_01_id,
       p.total, coalesce(p.custo_total, 0), 1.0
from syscol.pedidos p
where not syscol.cancelado(p)
  and p.vendedor_01_id is not null
  and not exists (
    select 1 from syscol.pedido_itens i
    where i.loja_empresa_id = p.loja_empresa_id and i.pedido_numero = p.numero and i.cancelado_em is null);
