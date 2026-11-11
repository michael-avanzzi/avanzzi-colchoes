/*
 * Remove os dados FICTÍCIOS de teste: tudo que tem "(fictício)" no nome.
 *   - agendamentos cujo cliente tem "(fictício)" no nome, com o histórico e
 *     os lembretes deles;
 *   - usuários cujo nome tem "(fictício)": perfil, histórico do perfil,
 *     aparelhos de notificação, registros de erro e a conta de login.
 *     (Fotos: remova antes pelo app, em Usuários; o Supabase não permite
 *     apagar arquivos do armazenamento direto por SQL.)
 *
 * Rode no SQL Editor. Tudo acontece numa única transação: se algo falhar,
 * nada é apagado. O histórico é imutável para o app; aqui as travas são
 * suspensas só durante esta limpeza, pelo dono do banco.
 *
 * O resultado final mostra o que foi apagado e confirma que não sobrou nada.
 */
begin;

-- ------------------------------------------------------------- o que apagar
create temp table _ag on commit drop as
  select id from public.agendamentos where cliente_nome ilike '%(fictício)%';

-- Usuário fictício só é apagado se nenhum agendamento REAL depender dele.
create temp table _usr on commit drop as
  select p.id
  from public.perfis p
  where p.nome ilike '%(fictício)%'
    and not exists (
      select 1 from public.agendamentos a
      where a.id not in (select id from _ag)
        and p.id in (a.vendedor_id, a.criado_por, a.atualizado_por, a.comparecimento_por, a.resultado_por)
    );

-- (sem "on commit drop": o resumo é exibido depois do commit)
create temp table _resumo as
  select
    (select count(*) from _ag) as agendamentos,
    (select count(*) from public.agendamento_eventos where agendamento_id in (select id from _ag)) as eventos_agendamento,
    (select count(*) from public.lembretes_enviados where agendamento_id in (select id from _ag)) as lembretes,
    (select count(*) from _usr) as usuarios,
    (select string_agg(nome, ', ') from public.perfis where id in (select id from _usr)) as nomes_usuarios;

-- --------------------------------------------- suspende travas e auditoria
alter table public.agendamento_eventos disable trigger trg_agendamento_eventos_imutaveis;
alter table public.perfil_eventos disable trigger trg_perfil_eventos_imutaveis;
alter table public.agendamentos disable trigger trg_agendamentos_auditoria;
alter table public.perfis disable trigger trg_perfis_auditoria;

-- ------------------------------------------------------------ agendamentos
delete from public.lembretes_enviados where agendamento_id in (select id from _ag);
delete from public.agendamento_eventos where agendamento_id in (select id from _ag);

-- desfaz vínculos de reagendamento (inclusive de agendamentos reais que apontem para fictícios)
update public.agendamentos set reagendado_de_id = null where reagendado_de_id in (select id from _ag);
update public.agendamentos set reagendado_para_id = null where reagendado_para_id in (select id from _ag);

delete from public.agendamentos where id in (select id from _ag);

-- ---------------------------------------------------------------- usuários
delete from public.agendamento_eventos where usuario_id in (select id from _usr);
delete from public.perfil_eventos where perfil_id in (select id from _usr) or usuario_id in (select id from _usr);
delete from public.erros_app where usuario_id in (select id from _usr);
delete from public.push_inscricoes where usuario_id in (select id from _usr);
update public.perfis set atualizado_por = null where atualizado_por in (select id from _usr);
delete from public.perfis where id in (select id from _usr);
delete from auth.users where id in (select id from _usr);

-- ------------------------------------------------------ religa as travas
alter table public.agendamento_eventos enable trigger trg_agendamento_eventos_imutaveis;
alter table public.perfil_eventos enable trigger trg_perfil_eventos_imutaveis;
alter table public.agendamentos enable trigger trg_agendamentos_auditoria;
alter table public.perfis enable trigger trg_perfis_auditoria;

commit;

-- ------------------------------------------------------------- resultado
select
  r.agendamentos as agendamentos_apagados,
  r.eventos_agendamento as eventos_apagados,
  r.lembretes as lembretes_apagados,
  r.usuarios as usuarios_apagados,
  r.nomes_usuarios,
  (select count(*) from public.agendamentos where cliente_nome ilike '%(fictício)%') as agendamentos_ficticios_restantes,
  (select count(*) from public.perfis where nome ilike '%(fictício)%') as usuarios_ficticios_restantes,
  (select count(*) from pg_trigger
    where tgname in ('trg_agendamento_eventos_imutaveis', 'trg_perfil_eventos_imutaveis',
                     'trg_agendamentos_auditoria', 'trg_perfis_auditoria')
      and tgenabled = 'O') as travas_religadas_de_4
from _resumo r;
