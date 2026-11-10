/*
 * Avanzzi Agendamentos — funções de escrita (rpc_*).
 *
 * Regra de permissão padrão (PENDENTE de validação com a gestão):
 * - vendedor: cria para si e altera apenas os próprios agendamentos;
 * - gerente/admin: criam para qualquer vendedor e alteram qualquer um;
 * - trocar o vendedor responsável: só gerente/admin, com justificativa.
 *
 * Toda função recebe a "versao" que a tela leu. Se outra pessoa alterou o
 * registro nesse meio tempo, a função recusa (errcode P0409) em vez de
 * sobrescrever.
 */

-- ---------------------------------------------------------------------------
-- Auxiliares internas
-- ---------------------------------------------------------------------------

create or replace function public.fn_exigir_papel()
returns public.papel_usuario
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_papel public.papel_usuario := public.fn_papel_atual();
begin
  if v_papel is null then
    raise exception 'Acesso não liberado para este usuário.' using errcode = '42501';
  end if;
  return v_papel;
end;
$$;

-- Carrega o agendamento travando a linha e valida versão e permissão.
create or replace function public.fn_carregar_para_alterar(
  p_id uuid,
  p_versao integer
)
returns public.agendamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_papel public.papel_usuario := public.fn_exigir_papel();
  v_ag public.agendamentos;
begin
  select * into v_ag
  from public.agendamentos
  where id = p_id
  for update;

  if not found then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
  end if;

  if v_papel = 'vendedor' and v_ag.vendedor_id <> auth.uid() then
    raise exception 'Você só pode alterar os seus próprios agendamentos.'
      using errcode = '42501';
  end if;

  if v_ag.versao <> p_versao then
    raise exception 'Este agendamento foi alterado por outra pessoa. Recarregue e tente de novo.'
      using errcode = 'P0409';
  end if;

  return v_ag;
end;
$$;

-- Agendamentos que ainda ocupam a agenda.
create or replace function public.fn_status_ativo(p_status public.status_atendimento)
returns boolean
language sql
immutable
as $$
  select p_status in ('agendado', 'confirmado')
$$;

-- Conflito de horário do mesmo vendedor (PENDENTE: confirmar a regra).
create or replace function public.fn_validar_conflito(
  p_vendedor_id uuid,
  p_inicio timestamptz,
  p_duracao_min integer,
  p_ignorar_id uuid default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conflito public.agendamentos;
begin
  select * into v_conflito
  from public.agendamentos a
  where a.vendedor_id = p_vendedor_id
    and public.fn_status_ativo(a.status)
    and a.id is distinct from p_ignorar_id
    and tstzrange(a.inicio, a.inicio + make_interval(mins => a.duracao_min))
        && tstzrange(p_inicio, p_inicio + make_interval(mins => p_duracao_min))
  limit 1;

  if found then
    raise exception 'Conflito de horário: o vendedor já tem % às %.',
      v_conflito.cliente_nome,
      to_char(v_conflito.inicio at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.fn_marcar_evento(p_tipo text, p_motivo text)
returns void
language sql
as $$
  select
    set_config('app.evento', coalesce(p_tipo, ''), true),
    set_config('app.motivo', coalesce(nullif(trim(p_motivo), ''), ''), true);
$$;

revoke all on function
  public.fn_exigir_papel(),
  public.fn_carregar_para_alterar(uuid, integer),
  public.fn_validar_conflito(uuid, timestamptz, integer, uuid),
  public.fn_marcar_evento(text, text)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Perfil do usuário logado
-- ---------------------------------------------------------------------------

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
    'trocar_senha', coalesce(v_trocar_senha, false)
  );
end;
$$;

-- Limpa a marca de senha temporária depois que o usuário troca a senha.
create or replace function public.rpc_senha_alterada()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessão não autenticada.' using errcode = '42501';
  end if;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'trocar_senha'
   where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Criar
-- ---------------------------------------------------------------------------

create or replace function public.rpc_criar_agendamento(
  p_cliente_nome text,
  p_inicio timestamptz,
  p_duracao_min integer default 60,
  p_categoria_id smallint default null,
  p_observacoes text default null,
  p_cliente_telefone text default null,
  p_vendedor_id uuid default null
)
returns public.agendamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_papel public.papel_usuario := public.fn_exigir_papel();
  v_vendedor uuid := coalesce(p_vendedor_id, auth.uid());
  v_ag public.agendamentos;
begin
  if v_papel = 'vendedor' and v_vendedor <> auth.uid() then
    raise exception 'Vendedor só pode criar agendamentos para si mesmo.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.perfis where id = v_vendedor and ativo) then
    raise exception 'Vendedor responsável inválido ou inativo.' using errcode = 'P0001';
  end if;

  if p_inicio < now() - interval '5 minutes' then
    raise exception 'Não é possível agendar em data/horário que já passou.'
      using errcode = 'P0001';
  end if;

  perform public.fn_validar_conflito(v_vendedor, p_inicio, coalesce(p_duracao_min, 60));
  perform public.fn_marcar_evento('criado', null);

  insert into public.agendamentos (
    cliente_nome, cliente_telefone, inicio, duracao_min,
    vendedor_id, categoria_id, observacoes, criado_por
  )
  values (
    trim(p_cliente_nome), nullif(trim(p_cliente_telefone), ''), p_inicio,
    coalesce(p_duracao_min, 60), v_vendedor, p_categoria_id,
    nullif(trim(p_observacoes), ''), auth.uid()
  )
  returning * into v_ag;

  return v_ag;
end;
$$;

-- ---------------------------------------------------------------------------
-- Editar dados (cliente, produto, observações, duração)
-- Data/horário NÃO muda aqui: use rpc_reagendar_agendamento.
-- ---------------------------------------------------------------------------

create or replace function public.rpc_editar_agendamento(
  p_id uuid,
  p_versao integer,
  p_cliente_nome text,
  p_cliente_telefone text,
  p_categoria_id smallint,
  p_observacoes text,
  p_duracao_min integer,
  p_motivo text default null
)
returns public.agendamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ag public.agendamentos := public.fn_carregar_para_alterar(p_id, p_versao);
begin
  if v_ag.status in ('cancelado', 'reagendado') then
    raise exception 'Agendamento encerrado (%): não pode ser editado.', v_ag.status
      using errcode = 'P0001';
  end if;

  if p_duracao_min is distinct from v_ag.duracao_min and public.fn_status_ativo(v_ag.status) then
    perform public.fn_validar_conflito(v_ag.vendedor_id, v_ag.inicio, p_duracao_min, v_ag.id);
  end if;

  perform public.fn_marcar_evento('editado', p_motivo);

  update public.agendamentos
     set cliente_nome = trim(p_cliente_nome),
         cliente_telefone = nullif(trim(p_cliente_telefone), ''),
         categoria_id = p_categoria_id,
         observacoes = nullif(trim(p_observacoes), ''),
         duracao_min = p_duracao_min
   where id = p_id
  returning * into v_ag;

  return v_ag;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reagendar: encerra o atual como "reagendado" e cria um novo vinculado.
-- ---------------------------------------------------------------------------

create or replace function public.rpc_reagendar_agendamento(
  p_id uuid,
  p_versao integer,
  p_novo_inicio timestamptz,
  p_motivo text default null,
  p_duracao_min integer default null
)
returns public.agendamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ag public.agendamentos := public.fn_carregar_para_alterar(p_id, p_versao);
  v_novo public.agendamentos;
  v_duracao integer := coalesce(p_duracao_min, v_ag.duracao_min);
begin
  if not public.fn_status_ativo(v_ag.status) and v_ag.status <> 'nao_compareceu' then
    raise exception 'Só é possível reagendar agendamentos em aberto ou de clientes que não compareceram.'
      using errcode = 'P0001';
  end if;

  if p_novo_inicio < now() - interval '5 minutes' then
    raise exception 'O novo horário já passou.' using errcode = 'P0001';
  end if;

  perform public.fn_validar_conflito(v_ag.vendedor_id, p_novo_inicio, v_duracao, v_ag.id);

  perform public.fn_marcar_evento('criado_por_reagendamento', p_motivo);

  insert into public.agendamentos (
    cliente_nome, cliente_telefone, inicio, duracao_min, vendedor_id,
    categoria_id, observacoes, reagendado_de_id, criado_por
  )
  values (
    v_ag.cliente_nome, v_ag.cliente_telefone, p_novo_inicio, v_duracao,
    v_ag.vendedor_id, v_ag.categoria_id, v_ag.observacoes, v_ag.id, auth.uid()
  )
  returning * into v_novo;

  perform public.fn_marcar_evento('reagendado', p_motivo);

  update public.agendamentos
     set status = 'reagendado',
         reagendado_para_id = v_novo.id
   where id = v_ag.id;

  return v_novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelar (exige motivo; o registro é preservado)
-- ---------------------------------------------------------------------------

create or replace function public.rpc_cancelar_agendamento(
  p_id uuid,
  p_versao integer,
  p_motivo text
)
returns public.agendamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ag public.agendamentos := public.fn_carregar_para_alterar(p_id, p_versao);
begin
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe o motivo do cancelamento.' using errcode = 'P0001';
  end if;

  if not public.fn_status_ativo(v_ag.status) then
    raise exception 'Só é possível cancelar agendamentos em aberto.' using errcode = 'P0001';
  end if;

  perform public.fn_marcar_evento('cancelado', p_motivo);

  update public.agendamentos
     set status = 'cancelado',
         motivo_cancelamento = trim(p_motivo)
   where id = p_id
  returning * into v_ag;

  return v_ag;
end;
$$;

-- ---------------------------------------------------------------------------
-- Status de atendimento: agendado / confirmado / compareceu / nao_compareceu
-- ---------------------------------------------------------------------------

create or replace function public.rpc_atualizar_status(
  p_id uuid,
  p_versao integer,
  p_status public.status_atendimento,
  p_motivo text default null
)
returns public.agendamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ag public.agendamentos := public.fn_carregar_para_alterar(p_id, p_versao);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date := (v_ag.inicio at time zone 'America/Sao_Paulo')::date;
begin
  if p_status not in ('agendado', 'confirmado', 'compareceu', 'nao_compareceu') then
    raise exception 'Use as ações de cancelar ou reagendar para esse status.'
      using errcode = 'P0001';
  end if;

  if v_ag.status in ('cancelado', 'reagendado') then
    raise exception 'Agendamento encerrado (%): status não pode mudar.', v_ag.status
      using errcode = 'P0001';
  end if;

  if p_status in ('compareceu', 'nao_compareceu') and v_dia > v_hoje then
    raise exception 'Comparecimento só pode ser registrado no dia do agendamento ou depois.'
      using errcode = 'P0001';
  end if;

  if v_ag.status = 'compareceu' and p_status <> 'compareceu' and v_ag.resultado <> 'pendente' then
    raise exception 'Desfaça primeiro o resultado da venda.' using errcode = 'P0001';
  end if;

  if p_status = v_ag.status then
    return v_ag;
  end if;

  perform public.fn_marcar_evento('status_alterado', p_motivo);

  update public.agendamentos
     set status = p_status,
         comparecimento_por = case
           when p_status in ('compareceu', 'nao_compareceu') then auth.uid() end,
         comparecimento_em = case
           when p_status in ('compareceu', 'nao_compareceu') then now() end
   where id = p_id
  returning * into v_ag;

  return v_ag;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resultado comercial
-- ---------------------------------------------------------------------------

create or replace function public.rpc_registrar_resultado(
  p_id uuid,
  p_versao integer,
  p_resultado public.resultado_venda,
  p_valor_venda numeric default null,
  p_motivo text default null
)
returns public.agendamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ag public.agendamentos := public.fn_carregar_para_alterar(p_id, p_versao);
begin
  if v_ag.status <> 'compareceu' then
    raise exception 'Registre primeiro que o cliente compareceu.' using errcode = 'P0001';
  end if;

  perform public.fn_marcar_evento('resultado_registrado', p_motivo);

  update public.agendamentos
     set resultado = p_resultado,
         valor_venda = case when p_resultado = 'venda_fechada' then p_valor_venda end,
         resultado_por = case when p_resultado <> 'pendente' then auth.uid() end,
         resultado_em = case when p_resultado <> 'pendente' then now() end
   where id = p_id
  returning * into v_ag;

  return v_ag;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trocar vendedor responsável (gerente/admin, com justificativa)
-- ---------------------------------------------------------------------------

create or replace function public.rpc_transferir_vendedor(
  p_id uuid,
  p_versao integer,
  p_novo_vendedor_id uuid,
  p_motivo text
)
returns public.agendamentos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ag public.agendamentos;
begin
  if public.fn_exigir_papel() not in ('gerente', 'admin') then
    raise exception 'Somente gerente ou administrador pode trocar o vendedor.'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Informe a justificativa da troca de vendedor.' using errcode = 'P0001';
  end if;

  v_ag := public.fn_carregar_para_alterar(p_id, p_versao);

  if not exists (select 1 from public.perfis where id = p_novo_vendedor_id and ativo) then
    raise exception 'Novo vendedor inválido ou inativo.' using errcode = 'P0001';
  end if;

  if public.fn_status_ativo(v_ag.status) then
    perform public.fn_validar_conflito(p_novo_vendedor_id, v_ag.inicio, v_ag.duracao_min, v_ag.id);
  end if;

  perform public.fn_marcar_evento('vendedor_alterado', p_motivo);

  update public.agendamentos
     set vendedor_id = p_novo_vendedor_id
   where id = p_id
  returning * into v_ag;

  return v_ag;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administração de perfis (admin)
-- ---------------------------------------------------------------------------

create or replace function public.rpc_admin_atualizar_perfil(
  p_id uuid,
  p_nome text,
  p_telefone text,
  p_papel public.papel_usuario,
  p_ativo boolean
)
returns public.perfis
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfis;
begin
  if public.fn_exigir_papel() <> 'admin' then
    raise exception 'Somente administrador pode alterar usuários.' using errcode = '42501';
  end if;

  if p_id = auth.uid() and (p_papel <> 'admin' or not p_ativo) then
    raise exception 'Você não pode remover o seu próprio acesso de administrador.'
      using errcode = 'P0001';
  end if;

  update public.perfis
     set nome = trim(p_nome),
         telefone = nullif(trim(p_telefone), ''),
         papel = p_papel,
         ativo = p_ativo,
         atualizado_em = now()
   where id = p_id
  returning * into v_perfil;

  if not found then
    raise exception 'Usuário não encontrado.' using errcode = 'P0002';
  end if;

  return v_perfil;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: só usuários autenticados executam as rpc_*.
-- ---------------------------------------------------------------------------

revoke all on function
  public.rpc_meu_perfil(),
  public.rpc_senha_alterada(),
  public.rpc_criar_agendamento(text, timestamptz, integer, smallint, text, text, uuid),
  public.rpc_editar_agendamento(uuid, integer, text, text, smallint, text, integer, text),
  public.rpc_reagendar_agendamento(uuid, integer, timestamptz, text, integer),
  public.rpc_cancelar_agendamento(uuid, integer, text),
  public.rpc_atualizar_status(uuid, integer, public.status_atendimento, text),
  public.rpc_registrar_resultado(uuid, integer, public.resultado_venda, numeric, text),
  public.rpc_transferir_vendedor(uuid, integer, uuid, text),
  public.rpc_admin_atualizar_perfil(uuid, text, text, public.papel_usuario, boolean)
from public, anon;

grant execute on function
  public.rpc_meu_perfil(),
  public.rpc_senha_alterada(),
  public.rpc_criar_agendamento(text, timestamptz, integer, smallint, text, text, uuid),
  public.rpc_editar_agendamento(uuid, integer, text, text, smallint, text, integer, text),
  public.rpc_reagendar_agendamento(uuid, integer, timestamptz, text, integer),
  public.rpc_cancelar_agendamento(uuid, integer, text),
  public.rpc_atualizar_status(uuid, integer, public.status_atendimento, text),
  public.rpc_registrar_resultado(uuid, integer, public.resultado_venda, numeric, text),
  public.rpc_transferir_vendedor(uuid, integer, uuid, text),
  public.rpc_admin_atualizar_perfil(uuid, text, text, public.papel_usuario, boolean)
to authenticated;
