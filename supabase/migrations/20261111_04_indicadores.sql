/*
 * Avanzzi Agendamentos — Etapa 4: indicadores do Painel de controle.
 *
 * REGRA PROVISÓRIA (a validar com a gestão — docs/decisoes-pendentes.md):
 *
 *   Fora de todos os indicadores:
 *     - agendamentos futuros (ainda não aconteceram);
 *     - cancelados;
 *     - reagendados: a cadeia conta uma vez só, pelo horário final.
 *
 *   Pendentes de conclusão (aparecem à parte, fora das taxas):
 *     - horário já passou e ninguém registrou comparecimento/falta.
 *
 *   Taxa de comparecimento = compareceram ÷ (compareceram + não compareceram)
 *   Taxa de conversão      = vendas fechadas ÷ (vendas fechadas + não fechou)
 *     (quem compareceu mas ainda está com resultado pendente fica fora do
 *      denominador da conversão até o resultado ser registrado)
 *
 * Toda a regra está nesta função: mudar a fórmula = mudar só aqui.
 */

create or replace function public.rpc_indicadores(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_vendedor_id uuid default null,
  p_agrupar text default 'dia'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_papel public.papel_usuario := public.fn_papel_atual();
  v_resultado jsonb;
begin
  if v_papel is null or v_papel = 'vendedor' then
    raise exception 'Indicadores disponíveis para gerente e administrador.' using errcode = '42501';
  end if;

  if p_fim <= p_inicio then
    raise exception 'Período inválido.' using errcode = 'P0001';
  end if;

  if p_fim - p_inicio > interval '400 days' then
    raise exception 'Escolha um período de até 400 dias.' using errcode = 'P0001';
  end if;

  if p_agrupar not in ('dia', 'semana', 'mes') then
    raise exception 'Agrupamento inválido.' using errcode = 'P0001';
  end if;

  with base as (
    select
      a.*,
      case
        when a.status = 'cancelado' then 'cancelado'
        when a.status = 'reagendado' then 'reagendado'
        when a.inicio > now() then 'futuro'
        when a.status in ('agendado', 'confirmado') then 'pendente'
        when a.status = 'nao_compareceu' then 'faltou'
        when a.resultado = 'venda_fechada' then 'venda'
        when a.resultado = 'nao_fechou' then 'nao_fechou'
        else 'em_atendimento' -- compareceu, resultado pendente
      end as situacao
    from public.agendamentos a
    where a.inicio >= p_inicio
      and a.inicio < p_fim
      and (p_vendedor_id is null or a.vendedor_id = p_vendedor_id)
  ),
  -- Métricas de um conjunto qualquer de linhas (total, por vendedor, por período).
  metricas as (
    select
      grupo,
      chave,
      count(*) filter (where situacao not in ('cancelado', 'reagendado'))             as agendamentos,
      count(*) filter (where situacao = 'futuro')                                      as futuros,
      count(*) filter (where situacao = 'cancelado')                                   as cancelados,
      count(*) filter (where situacao = 'reagendado')                                  as reagendados,
      count(*) filter (where situacao = 'pendente')                                    as pendentes,
      count(*) filter (where situacao in ('venda', 'nao_fechou', 'em_atendimento'))   as compareceram,
      count(*) filter (where situacao = 'faltou')                                      as nao_compareceram,
      count(*) filter (where situacao = 'venda')                                       as vendas,
      count(*) filter (where situacao = 'nao_fechou')                                  as nao_fechou,
      count(*) filter (where situacao = 'em_atendimento')                              as resultado_pendente,
      coalesce(sum(valor_venda) filter (where situacao = 'venda'), 0)                  as valor_vendido
    from (
      select 'total' as grupo, null::text as chave, situacao, valor_venda from base
      union all
      select 'vendedor', vendedor_id::text, situacao, valor_venda from base
      union all
      select
        'serie',
        to_char(
          date_trunc(
            case p_agrupar when 'semana' then 'week' when 'mes' then 'month' else 'day' end,
            inicio at time zone 'America/Sao_Paulo'
          ),
          'YYYY-MM-DD'
        ),
        situacao,
        valor_venda
      from base
    ) linhas
    group by grupo, chave
  ),
  com_taxas as (
    select
      m.*,
      case when m.compareceram + m.nao_compareceram > 0
        then round(100.0 * m.compareceram / (m.compareceram + m.nao_compareceram), 1) end as taxa_comparecimento,
      case when m.vendas + m.nao_fechou > 0
        then round(100.0 * m.vendas / (m.vendas + m.nao_fechou), 1) end as taxa_conversao
    from metricas m
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'agrupar', p_agrupar),
    'resumo', (
      select to_jsonb(t) - 'grupo' - 'chave' from com_taxas t where grupo = 'total'
    ),
    'por_vendedor', coalesce((
      select jsonb_agg(
               (to_jsonb(t) - 'grupo' - 'chave')
               || jsonb_build_object('vendedor_id', t.chave, 'nome', p.nome)
               order by t.vendas desc, t.compareceram desc, p.nome
             )
      from com_taxas t
      join public.perfis p on p.id = t.chave::uuid
      where t.grupo = 'vendedor'
    ), '[]'::jsonb),
    'serie', coalesce((
      select jsonb_agg(
               (to_jsonb(t) - 'grupo' - 'chave') || jsonb_build_object('periodo', t.chave)
               order by t.chave
             )
      from com_taxas t
      where t.grupo = 'serie'
    ), '[]'::jsonb)
  )
  into v_resultado;

  -- Período sem nenhum agendamento: resumo zerado em vez de null.
  if v_resultado -> 'resumo' = 'null'::jsonb then
    v_resultado := jsonb_set(v_resultado, '{resumo}', jsonb_build_object(
      'agendamentos', 0, 'futuros', 0, 'cancelados', 0, 'reagendados', 0, 'pendentes', 0,
      'compareceram', 0, 'nao_compareceram', 0, 'vendas', 0, 'nao_fechou', 0,
      'resultado_pendente', 0, 'valor_vendido', 0,
      'taxa_comparecimento', null, 'taxa_conversao', null
    ));
  end if;

  return v_resultado;
end;
$$;

revoke all on function public.rpc_indicadores(timestamptz, timestamptz, uuid, text) from public, anon;
grant execute on function public.rpc_indicadores(timestamptz, timestamptz, uuid, text) to authenticated;
