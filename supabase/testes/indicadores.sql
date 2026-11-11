/*
 * Testes dos indicadores do Painel (rpc_indicadores).
 *
 * Como rodar: cole tudo no SQL Editor e clique em Run (depois da migração 04).
 * Cria um cenário FICTÍCIO conhecido e confere cada número. No final lança um
 * erro de propósito para DESFAZER tudo. Esperado: erro começando com "TESTES OK".
 *
 * Cenário do vendedor 1, semana de 05 a 11/01/2026:
 *   2 vendas (R$ 1.000 + R$ 500) · 1 não fechou · 1 compareceu com resultado
 *   pendente · 1 falta · 1 sem registro (pendente de conclusão) · 1 cancelado ·
 *   1 reagendado
 *   => comparecimento 4 ÷ (4 + 1) = 80%   conversão 2 ÷ (2 + 1) = 66,7%
 */
do $testes$
declare
  v1 uuid := gen_random_uuid();
  v2 uuid := gen_random_uuid();
  g  uuid := gen_random_uuid();
  ini timestamptz := '2026-01-05 00:00:00-03';
  fim timestamptz := '2026-01-12 00:00:00-03';
  r jsonb;
  res jsonb;
  falhou boolean;
  codigo text;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ind-v1-' || v1 || '@exemplo.test', '{}', '{"nome":"Vendedor 1 (fictício)"}', now(), now()),
    (v2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ind-v2-' || v2 || '@exemplo.test', '{}', '{"nome":"Vendedor 2 (fictício)"}', now(), now()),
    (g, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ind-g-' || g || '@exemplo.test', '{}', '{"nome":"Gerente (fictício)"}', now(), now());
  update public.perfis set ativo = true where id in (v1, v2);
  update public.perfis set ativo = true, papel = 'gerente' where id = g;

  -- Inserção direta (como dono do banco) para poder usar datas passadas.
  insert into public.agendamentos
    (cliente_nome, inicio, vendedor_id, criado_por, status, resultado, valor_venda, motivo_cancelamento)
  values
    ('A (fictício)', '2026-01-05 10:00-03', v1, v1, 'compareceu', 'venda_fechada', 1000, null),
    ('B (fictício)', '2026-01-05 14:00-03', v1, v1, 'compareceu', 'venda_fechada', 500, null),
    ('C (fictício)', '2026-01-06 10:00-03', v1, v1, 'compareceu', 'nao_fechou', null, null),
    ('D (fictício)', '2026-01-07 10:00-03', v1, v1, 'compareceu', 'pendente', null, null),
    ('E (fictício)', '2026-01-07 15:00-03', v1, v1, 'nao_compareceu', 'pendente', null, null),
    ('F (fictício)', '2026-01-08 10:00-03', v1, v1, 'confirmado', 'pendente', null, null),
    ('G (fictício)', '2026-01-09 10:00-03', v1, v1, 'cancelado', 'pendente', null, 'desistiu'),
    ('H (fictício)', '2026-01-09 16:00-03', v1, v1, 'reagendado', 'pendente', null, null),
    -- fora do período (não pode contar)
    ('I (fictício)', '2026-01-12 10:00-03', v1, v1, 'compareceu', 'venda_fechada', 9999, null),
    -- vendedor 2 no período
    ('J (fictício)', '2026-01-06 11:00-03', v2, v2, 'compareceu', 'nao_fechou', null, null),
    -- futuro do vendedor 1
    ('K (fictício)', now() + interval '10 days', v1, v1, 'agendado', 'pendente', null, null);

  -- --------------------------------------------------------- permissões
  perform set_config('request.jwt.claims', json_build_object('sub', v1, 'role', 'authenticated')::text, true);
  falhou := false;
  begin
    perform public.rpc_indicadores(ini, fim);
  exception when others then falhou := true; codigo := sqlstate;
  end;
  assert falhou and codigo = '42501', 'I01: vendedor não acessa os indicadores gerais';

  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);

  -- ------------------------------------------------------- resumo do V1
  r := public.rpc_indicadores(ini, fim, v1, 'dia');
  res := r -> 'resumo';

  assert (res ->> 'agendamentos')::int = 6,       'I02: agendamentos = 6 (exclui cancelado e reagendado)';
  assert (res ->> 'cancelados')::int = 1,         'I03: cancelados = 1';
  assert (res ->> 'reagendados')::int = 1,        'I04: reagendados = 1';
  assert (res ->> 'pendentes')::int = 1,          'I05: pendentes de conclusão = 1';
  assert (res ->> 'compareceram')::int = 4,       'I06: compareceram = 4';
  assert (res ->> 'nao_compareceram')::int = 1,   'I07: não compareceram = 1';
  assert (res ->> 'vendas')::int = 2,             'I08: vendas = 2';
  assert (res ->> 'nao_fechou')::int = 1,         'I09: não fechou = 1';
  assert (res ->> 'resultado_pendente')::int = 1, 'I10: resultado pendente = 1';
  assert (res ->> 'valor_vendido')::numeric = 1500, 'I11: valor vendido = 1500 (não soma fora do período)';
  assert (res ->> 'taxa_comparecimento')::numeric = 80.0, 'I12: comparecimento = 80%';
  assert (res ->> 'taxa_conversao')::numeric = 66.7,      'I13: conversão = 66,7%';
  assert (res ->> 'futuros')::int = 0,            'I14: sem futuros neste período';

  -- série diária: 5 dias com agendamento (05, 06, 07, 08, 09)
  assert jsonb_array_length(r -> 'serie') = 5, 'I15: série deve ter um ponto por dia com agendamento';
  assert (r -> 'serie' -> 0 ->> 'periodo') = '2026-01-05'
     and (r -> 'serie' -> 0 ->> 'vendas')::int = 2, 'I16: dia 05/01 com 2 vendas';

  -- --------------------------------------------- todos os vendedores
  r := public.rpc_indicadores(ini, fim, null, 'semana');
  assert jsonb_array_length(r -> 'por_vendedor') >= 2, 'I17: tabela por vendedor inclui os dois vendedores';
  assert exists (
    select 1 from jsonb_array_elements(r -> 'por_vendedor') e
     where e ->> 'vendedor_id' = v2::text
       and (e ->> 'compareceram')::int = 1
       and (e ->> 'taxa_conversao')::numeric = 0
  ), 'I18: vendedor 2 com 1 comparecimento e conversão 0%';
  assert exists (
    select 1 from jsonb_array_elements(r -> 'por_vendedor') e
     where e ->> 'vendedor_id' = v1::text and e ->> 'nome' = 'Vendedor 1 (fictício)'
  ), 'I19: tabela por vendedor traz o nome';

  -- --------------------------------------------------- futuros
  r := public.rpc_indicadores(ini, now() + interval '30 days', v1, 'mes');
  assert (r -> 'resumo' ->> 'futuros')::int = 1, 'I20: agendamento futuro aparece só como futuro';
  assert (r -> 'resumo' ->> 'compareceram')::int = 5, 'I21: futuro não entra nas taxas (inclui o I de 12/01)';

  -- --------------------------------------------------- período vazio
  r := public.rpc_indicadores('2020-01-01', '2020-01-02', v1);
  assert (r -> 'resumo' ->> 'agendamentos')::int = 0
     and r -> 'resumo' -> 'taxa_comparecimento' = 'null'::jsonb
     and jsonb_array_length(r -> 'serie') = 0, 'I22: período vazio devolve zeros e taxa sem valor';

  falhou := false;
  begin
    perform public.rpc_indicadores(fim, ini);
  exception when others then falhou := true;
  end;
  assert falhou, 'I23: período invertido é recusado';

  raise exception 'TESTES OK: 23 verificações dos indicadores passaram. (Erro proposital para desfazer os dados de teste.)'
    using errcode = 'P0001';
end;
$testes$;
