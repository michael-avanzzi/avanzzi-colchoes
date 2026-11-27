-- Papel "logistica": equipe de entregas. Vê todas as entregas (tela Entregas)
-- e fica fora da agenda e do ranking (ver fn_papel_atual na migração 15).
-- Em arquivo próprio: valor novo de enum só pode ser usado depois do commit.
alter type public.papel_usuario add value if not exists 'logistica';
