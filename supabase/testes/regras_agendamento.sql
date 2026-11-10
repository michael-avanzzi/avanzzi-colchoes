/*
 * Testes automatizados das regras do banco (Avanzzi Agendamentos).
 *
 * Como rodar: cole tudo no SQL Editor do Supabase e clique em Run.
 * - Cria usuários e agendamentos FICTÍCIOS e, no final, lança um erro de
 *   propósito para DESFAZER tudo: nada fica gravado.
 * - Sucesso: o erro mostrado começa com "TESTES OK".
 * - Falha: o erro mostra o número do teste que falhou (ex.: "T05: ...").
 *
 * Simula o usuário logado preenchendo request.jwt.claims, que é de onde
 * auth.uid() lê o id.
 */
do $testes$
declare
  v1 uuid := gen_random_uuid();   -- vendedor 1
  v2 uuid := gen_random_uuid();   -- vendedor 2
  g  uuid := gen_random_uuid();   -- gerente
  amanha timestamptz := date_trunc('day', now()) + interval '1 day 10 hours';
  ag public.agendamentos;
  ag2 public.agendamentos;
  novo public.agendamentos;
  hoje public.agendamentos;
  falhou boolean;
  codigo text;
  qtd integer;
  evento public.agendamento_eventos;
begin
  -- ---------------------------------------------------------------- preparação
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'teste-v1-' || v1 || '@exemplo.test', '{}', '{"nome":"Vendedor 1 (fictício)"}', now(), now()),
    (v2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'teste-v2-' || v2 || '@exemplo.test', '{}', '{"nome":"Vendedor 2 (fictício)"}', now(), now()),
    (g, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'teste-g-' || g || '@exemplo.test', '{}', '{"nome":"Gerente (fictício)"}', now(), now());

  select count(*) into qtd from public.perfis where id in (v1, v2, g) and not ativo;
  assert qtd = 3, 'T01: todo usuário novo deve nascer com perfil inativo';

  update public.perfis set ativo = true where id in (v1, v2);
  update public.perfis set ativo = true, papel = 'gerente' where id = g;

  select count(*) into qtd from public.perfil_eventos where perfil_id = v1 and tipo = 'acesso_liberado';
  assert qtd = 1, 'T02: liberar acesso deve gerar evento de auditoria do usuário';

  -- --------------------------------------------------------------- criação
  perform set_config('request.jwt.claims', json_build_object('sub', v1, 'role', 'authenticated')::text, true);

  ag := public.rpc_criar_agendamento('Cliente A (fictício)', amanha, 60, null, 'obs inicial');
  assert ag.vendedor_id = v1 and ag.criado_por = v1, 'T03: vendedor deve vir do usuário logado';
  assert ag.status = 'agendado' and ag.resultado = 'pendente' and ag.versao = 1, 'T03: estado inicial';

  select count(*) into qtd from public.agendamento_eventos where agendamento_id = ag.id and tipo = 'criado';
  assert qtd = 1, 'T04: criação deve gerar evento no histórico';

  falhou := false;
  begin
    perform public.rpc_criar_agendamento('Cliente X (fictício)', amanha + interval '3 hours', 60, null, null, null, v2);
  exception when others then falhou := true; codigo := sqlstate;
  end;
  assert falhou and codigo = '42501', 'T05: vendedor não pode criar agendamento para outro vendedor';

  falhou := false;
  begin
    perform public.rpc_criar_agendamento('Cliente B (fictício)', amanha + interval '30 minutes', 60);
  exception when others then falhou := true;
  end;
  assert falhou, 'T06: horário sobreposto do mesmo vendedor deve ser recusado';

  falhou := false;
  begin
    perform public.rpc_criar_agendamento('Cliente C (fictício)', now() - interval '1 day', 60);
  exception when others then falhou := true;
  end;
  assert falhou, 'T07: não pode agendar no passado';

  -- ----------------------------------------------------- edição e concorrência
  falhou := false;
  begin
    perform public.rpc_editar_agendamento(ag.id, ag.versao + 5, 'Cliente A (fictício)', null, null, 'x', 60);
  exception when others then falhou := true; codigo := sqlstate;
  end;
  assert falhou and codigo = 'PT409', 'T08: versão desatualizada deve ser recusada (edição simultânea)';

  ag := public.rpc_editar_agendamento(ag.id, ag.versao, 'Cliente A (fictício)', '11900000000', 1::smallint, 'obs nova', 60, 'cliente ligou');
  assert ag.versao = 2 and ag.observacoes = 'obs nova', 'T09: edição deve aplicar e incrementar a versão';

  select * into evento from public.agendamento_eventos
   where agendamento_id = ag.id and tipo = 'editado' order by id desc limit 1;
  assert evento.motivo = 'cliente ligou'
     and evento.usuario_id = v1
     and evento.dados_anteriores ->> 'observacoes' = 'obs inicial'
     and evento.dados_novos ->> 'observacoes' = 'obs nova',
     'T10: histórico deve guardar valor anterior, novo, motivo e usuário';

  perform set_config('request.jwt.claims', json_build_object('sub', v2, 'role', 'authenticated')::text, true);
  falhou := false;
  begin
    perform public.rpc_cancelar_agendamento(ag.id, ag.versao, 'tentativa indevida');
  exception when others then falhou := true; codigo := sqlstate;
  end;
  assert falhou and codigo = '42501', 'T11: vendedor não altera agendamento de outro vendedor';

  -- --------------------------------------------------------- comparecimento
  perform set_config('request.jwt.claims', json_build_object('sub', v1, 'role', 'authenticated')::text, true);
  falhou := false;
  begin
    perform public.rpc_atualizar_status(ag.id, ag.versao, 'compareceu');
  exception when others then falhou := true;
  end;
  assert falhou, 'T12: não registra comparecimento antes do dia do agendamento';

  falhou := false;
  begin
    perform public.rpc_registrar_resultado(ag.id, ag.versao, 'venda_fechada', 100);
  exception when others then falhou := true;
  end;
  assert falhou, 'T13: resultado exige comparecimento';

  -- ------------------------------------------------------------- reagendar
  novo := public.rpc_reagendar_agendamento(ag.id, ag.versao, amanha + interval '1 day', 'pediu outro dia');
  select * into ag from public.agendamentos where id = ag.id;
  assert ag.status = 'reagendado' and ag.reagendado_para_id = novo.id, 'T14: original vira Reagendado e aponta para o novo';
  assert novo.reagendado_de_id = ag.id and novo.status = 'agendado'
     and novo.cliente_nome = ag.cliente_nome and novo.vendedor_id = ag.vendedor_id,
     'T15: novo agendamento herda os dados e aponta para o original';

  select count(*) into qtd from public.agendamento_eventos where agendamento_id = ag.id and tipo = 'reagendado' and motivo = 'pediu outro dia';
  assert qtd = 1, 'T16: reagendamento registrado no histórico do original com motivo';
  select count(*) into qtd from public.agendamento_eventos where agendamento_id = novo.id and tipo = 'criado_por_reagendamento';
  assert qtd = 1, 'T16: novo agendamento registra que veio de reagendamento';

  falhou := false;
  begin
    perform public.rpc_editar_agendamento(ag.id, ag.versao, 'Outro nome', null, null, null, 60);
  exception when others then falhou := true;
  end;
  assert falhou, 'T17: agendamento reagendado (encerrado) não pode ser editado';

  -- -------------------------------------------------------------- cancelar
  falhou := false;
  begin
    perform public.rpc_cancelar_agendamento(novo.id, novo.versao, '');
  exception when others then falhou := true;
  end;
  assert falhou, 'T18: cancelamento exige motivo';

  novo := public.rpc_cancelar_agendamento(novo.id, novo.versao, 'desistiu');
  assert novo.status = 'cancelado' and novo.motivo_cancelamento = 'desistiu', 'T19: cancelamento preserva o registro com motivo';

  -- ------------------------------------------------- dia do atendimento e venda
  hoje := public.rpc_criar_agendamento('Cliente D (fictício)', now() + interval '2 minutes', 30);
  hoje := public.rpc_atualizar_status(hoje.id, hoje.versao, 'compareceu');
  assert hoje.comparecimento_por = v1 and hoje.comparecimento_em is not null, 'T20: guarda quem marcou o comparecimento';

  hoje := public.rpc_registrar_resultado(hoje.id, hoje.versao, 'venda_fechada', 1500.50);
  assert hoje.resultado = 'venda_fechada' and hoje.valor_venda = 1500.50 and hoje.resultado_por = v1,
    'T21: guarda resultado, valor e quem informou';

  falhou := false;
  begin
    perform public.rpc_atualizar_status(hoje.id, hoje.versao, 'nao_compareceu');
  exception when others then falhou := true;
  end;
  assert falhou, 'T22: não volta o comparecimento sem antes desfazer o resultado';

  -- ------------------------------------------------------ trocar vendedor
  falhou := false;
  begin
    perform public.rpc_transferir_vendedor(hoje.id, hoje.versao, v2, 'motivo');
  exception when others then falhou := true; codigo := sqlstate;
  end;
  assert falhou and codigo = '42501', 'T23: vendedor não troca o responsável';

  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated')::text, true);
  falhou := false;
  begin
    perform public.rpc_transferir_vendedor(hoje.id, hoje.versao, v2, '');
  exception when others then falhou := true;
  end;
  assert falhou, 'T24: troca de vendedor exige justificativa';

  hoje := public.rpc_transferir_vendedor(hoje.id, hoje.versao, v2, 'cliente atendido pelo vendedor 2');
  select * into evento from public.agendamento_eventos
   where agendamento_id = hoje.id and tipo = 'vendedor_alterado' order by id desc limit 1;
  assert hoje.vendedor_id = v2
     and evento.usuario_id = g
     and evento.dados_anteriores ->> 'vendedor_id' = v1::text
     and evento.dados_novos ->> 'vendedor_id' = v2::text
     and evento.motivo = 'cliente atendido pelo vendedor 2',
     'T25: troca de vendedor registra anterior, novo, quem trocou e justificativa';

  -- gerente altera agendamento de qualquer vendedor
  ag2 := public.rpc_criar_agendamento('Cliente E (fictício)', amanha + interval '5 hours', 60, null, null, null, v1);
  ag2 := public.rpc_atualizar_status(ag2.id, ag2.versao, 'confirmado');
  assert ag2.status = 'confirmado' and ag2.vendedor_id = v1, 'T26: gerente cria e altera para qualquer vendedor';

  -- ------------------------------------------------------- imutabilidade
  falhou := false;
  begin
    delete from public.agendamento_eventos where agendamento_id = hoje.id;
  exception when others then falhou := true;
  end;
  assert falhou, 'T27: histórico não pode ser apagado (nem pelo dono do banco)';

  falhou := false;
  begin
    update public.agendamento_eventos set motivo = 'adulterado' where agendamento_id = hoje.id;
  exception when others then falhou := true;
  end;
  assert falhou, 'T28: histórico não pode ser alterado';

  -- ------------------------------------- escrita direta pelo app é bloqueada
  execute 'set local role authenticated';
  falhou := false;
  begin
    update public.agendamentos set status = 'cancelado' where id = hoje.id;
  exception when others then falhou := true; codigo := sqlstate;
  end;
  assert falhou and codigo = '42501', 'T29: usuário logado não altera a tabela diretamente';

  falhou := false;
  begin
    insert into public.agendamento_eventos (agendamento_id, tipo) values (hoje.id, 'falso');
  exception when others then falhou := true; codigo := sqlstate;
  end;
  assert falhou and codigo = '42501', 'T30: usuário logado não grava no histórico diretamente';
  execute 'reset role';

  -- ------------------------------------------------------ usuário inativo
  update public.perfis set ativo = false where id = v2;
  perform set_config('request.jwt.claims', json_build_object('sub', v2, 'role', 'authenticated')::text, true);
  falhou := false;
  begin
    perform public.rpc_criar_agendamento('Cliente F (fictício)', amanha + interval '8 hours', 60);
  exception when others then falhou := true; codigo := sqlstate;
  end;
  assert falhou and codigo = '42501', 'T31: usuário sem acesso não cria agendamentos';

  select count(*) into qtd from public.perfil_eventos where perfil_id = v2 and tipo = 'acesso_removido';
  assert qtd = 1, 'T32: remover acesso gera evento de auditoria do usuário';

  raise exception 'TESTES OK: 32 verificações passaram. (Erro proposital para desfazer os dados de teste.)'
    using errcode = 'P0001';
end;
$testes$;
