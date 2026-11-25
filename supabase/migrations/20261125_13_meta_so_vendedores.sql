-- Meta do dia só para vendedores: administradores e gerentes não têm meta do
-- dia, nem própria (decisão da gestão). Limpa as metas próprias que existirem
-- para vendedores do Syscol ligados a quem não tem papel "vendedor" e passa a
-- recusar novas.

update syscol.metas_vendedor mv
   set meta_diaria = null, atualizado_em = now()
 where mv.meta_diaria is not null
   and exists (
     select 1 from public.perfis pf
      where pf.syscol_vendedor_id = mv.vendedor_id and pf.papel::text <> 'vendedor');

create or replace function public.rpc_ranking_meta_vendedor(p_vendedor_id text, p_meta_diaria numeric)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.fn_papel_atual()::text, '') not in ('gerente', 'admin') then
    raise exception 'Só gerentes e administradores alteram as metas.' using errcode = '42501';
  end if;
  if coalesce(p_meta_diaria, 0) < 0 then
    raise exception 'A meta não pode ser negativa.' using errcode = '22023';
  end if;
  if not exists (select 1 from syscol.vendedores where id = p_vendedor_id) then
    raise exception 'Vendedor não encontrado.' using errcode = '22023';
  end if;
  if coalesce(p_meta_diaria, 0) > 0 and exists (
    select 1 from public.perfis pf
     where pf.syscol_vendedor_id = p_vendedor_id and pf.papel::text <> 'vendedor') then
    raise exception 'Administradores e gerentes ficam fora da meta do dia.' using errcode = '22023';
  end if;
  insert into syscol.metas_vendedor (vendedor_id, meta_diaria, atualizado_em, atualizado_por)
  values (p_vendedor_id, nullif(p_meta_diaria, 0), now(), auth.uid())
  on conflict (vendedor_id) do update set meta_diaria = excluded.meta_diaria, atualizado_em = now(), atualizado_por = auth.uid();
end $$;
