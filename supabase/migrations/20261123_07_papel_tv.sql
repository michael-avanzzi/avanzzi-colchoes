-- Papel "tv": conta da TV da sala de vendas. Só enxerga o Ranking de vendas
-- (rpc_ranking_vendas). Para o restante do app ela é tratada como sem acesso
-- (ver fn_papel_atual na migração 08).
--
-- Fica em arquivo próprio porque um valor novo de enum só pode ser usado
-- depois que a transação que o criou termina.
alter type public.papel_usuario add value if not exists 'tv';
