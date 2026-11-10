/*
 * Remove os agendamentos FICTÍCIOS criados em testes (cliente com "(fictício)"
 * no nome) e o histórico deles. Rode no SQL Editor antes de colocar em uso real.
 *
 * O histórico é imutável para o app; aqui o bloqueio é suspenso apenas dentro
 * desta transação, pelo dono do banco.
 */
begin;

alter table public.agendamento_eventos disable trigger trg_agendamento_eventos_imutaveis;

create temp table _teste on commit drop as
  select id from public.agendamentos where cliente_nome ilike '%(fictício)%';

delete from public.agendamento_eventos where agendamento_id in (select id from _teste);

update public.agendamentos
   set reagendado_de_id = null, reagendado_para_id = null
 where id in (select id from _teste);

delete from public.agendamentos where id in (select id from _teste);

alter table public.agendamento_eventos enable trigger trg_agendamento_eventos_imutaveis;

commit;
