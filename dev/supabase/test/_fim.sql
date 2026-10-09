-- Fim comum dos testes de segurança: mostra o resultado, falha se algo deu errado e desfaz tudo.
-- Antes de incluir, defina o nome do teste:  \set teste 'segurança do banco'
reset role;
\o
\pset tuples_only on
\pset format unaligned
select '❌ ' || msg from t.results where not ok order by n;
select format('%s %s (%s): %s ok, %s falha(s)', case when bool_and(ok) then '✅' else '❌' end, :'teste', :'fase',
  count(*) filter (where ok), count(*) filter (where not ok)) from t.results;
do $$ begin if exists (select 1 from t.results where not ok) then raise exception 'teste com falhas'; end if; end $$;
rollback;
