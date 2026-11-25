-- Meta diária automática dos vendedores (decisão da gestão em 25/11/2026).
-- A meta do dia sai da meta do mês e é dividida igualmente entre os vendedores
-- do app (papel "vendedor"). A meta própria definida em Ranking → Configurar
-- continua valendo por cima; a "meta diária padrão" só vale quando não há meta
-- do mês.

-- Meta diária automática.
--
-- Meta do dia da loja = (meta do mês - o que a loja vendeu ATÉ ONTEM) ÷ dias de
-- venda que faltam, contando hoje. Usar as vendas até ontem deixa a meta fixa
-- durante o dia (não encolhe conforme a equipe vende).
-- Dias de venda: lista "diasvenda" do mapa de meta mensal do Syscol
-- ("01,02,...,30,"); sem lista, todos os dias do mês. Se hoje não é dia de
-- venda, não há meta do dia.
-- Meta de cada vendedor = meta do dia da loja ÷ número de vendedores: usuários
-- ativos do app com papel "vendedor" ligados a um vendedor ativo do Syscol.
-- Administradores e gerentes ficam de fora. Valores arredondados para cima, em reais.
create or replace function syscol.meta_do_dia(p_hoje date)
returns table (
  meta_mes numeric,
  vendido_ate_ontem numeric,
  dias_restantes int,
  hoje_e_dia_de_venda boolean,
  meta_dia_loja numeric,
  vendedores int,
  meta_dia_vendedor numeric
)
language sql stable set search_path = '' as $$
  with
  mes as (
    select date_trunc('month', p_hoje)::date as ini,
           (date_trunc('month', p_hoje) + interval '1 month - 1 day')::date as fim
  ),
  meta as (
    select coalesce(
             (select m.meta from syscol.metas_mensais m where m.empresa_id = '1' and m.mesref = to_char(p_hoje, 'YYYYMM')),
             (select nullif(c.valor, '')::numeric from syscol.config c where c.chave = 'meta_mensal_manual')) as valor,
           (select nullif(trim(m.dias_venda), '') from syscol.metas_mensais m
             where m.empresa_id = '1' and m.mesref = to_char(p_hoje, 'YYYYMM')) as dias
  ),
  dias as (
    select g::date as dia
    from mes, meta, generate_series(p_hoje, mes.fim, interval '1 day') g
    where meta.dias is null or to_char(g, 'DD') = any (string_to_array(meta.dias, ','))
  ),
  vendido as (
    select coalesce(sum(p.valor_venda), 0) as valor
    from syscol.pedidos p, mes
    where not syscol.cancelado(p) and p.data_emissao >= mes.ini and p.data_emissao < p_hoje
  ),
  equipe as (
    select count(*)::int as n
    from public.perfis pf
    join syscol.vendedores v on v.id = pf.syscol_vendedor_id and v.ativo
    where pf.ativo and pf.papel::text = 'vendedor'
  ),
  calc as (
    select meta.valor as meta_mes,
           vendido.valor as vendido,
           (select count(*)::int from dias) as dias_restantes,
           exists (select 1 from dias where dia = p_hoje) as hoje,
           equipe.n as vendedores
    from meta, vendido, equipe
  ),
  loja as (
    select calc.*,
           case when calc.hoje and calc.meta_mes > 0 and calc.dias_restantes > 0 and calc.meta_mes > calc.vendido
                then ceil((calc.meta_mes - calc.vendido) / calc.dias_restantes) end as meta_dia_loja
    from calc
  )
  select meta_mes, vendido, dias_restantes, hoje, meta_dia_loja, vendedores,
         case when vendedores > 0 then ceil(meta_dia_loja / vendedores) end
  from loja
$$;

-- Ranking: meta de cada vendedor e meta do dia da loja.
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
  v_md record;
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

  select * into v_md from syscol.meta_do_dia(v_hoje);

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
           -- Meta própria (Configurar) > automática (meta do dia da loja ÷ vendedores) > padrão manual.
           -- Só usuários com papel "vendedor" entram na meta automática; administradores ficam de fora.
           coalesce(mv.meta_diaria,
                    case when pf.papel::text = 'vendedor' then coalesce(v_md.meta_dia_vendedor, v_meta_padrao) end) as meta_diaria,
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
        'meta', v_meta_mes,
        'meta_dia_loja', v_md.meta_dia_loja,
        'meta_dia_vendedor', v_md.meta_dia_vendedor,
        'vendedores_na_meta', v_md.vendedores,
        'dias_de_venda_restantes', v_md.dias_restantes,
        'hoje_e_dia_de_venda', v_md.hoje_e_dia_de_venda)
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

-- Avisos de meta do dia batida com a mesma regra.
create or replace function public.fn_reservar_avisos_vendas() returns jsonb
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
  v_md record;
begin
  select nullif(valor, '')::numeric into v_meta_padrao from syscol.config where chave = 'meta_diaria_padrao';
  select * into v_md from syscol.meta_do_dia(v_hoje);

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
    select x.id, x.nome, x.valor, x.meta
    from (
      select v.id, coalesce(pf.nome, initcap(lower(v.nome))) as nome, round(d.valor, 2) as valor,
             coalesce(mv.meta_diaria,
                      case when pf.papel::text = 'vendedor' then coalesce(v_md.meta_dia_vendedor, v_meta_padrao) end) as meta
      from dia d
      join syscol.vendedores v on v.id = d.vendedor_id and v.ativo
      left join public.perfis pf on pf.syscol_vendedor_id = v.id and pf.ativo
      left join syscol.metas_vendedor mv on mv.vendedor_id = v.id
    ) x
    where x.meta > 0 and x.valor >= x.meta
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
