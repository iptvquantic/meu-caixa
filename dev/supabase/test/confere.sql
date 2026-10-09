-- Confere que os dados continuam exatamente iguais à foto tirada pelo dados.sql
-- (coluna nova pode aparecer; valor existente não muda, linha não some, linha não aparece do nada).
\set ON_ERROR_STOP 1
set client_min_messages = warning;
do $$
declare tb text; mudaram bigint; diferenca bigint; erros int := 0;
begin
  foreach tb in array array['profiles', 'categories', 'cards', 'transactions', 'recurring', 'goals', 'ai_usage'] loop
    execute format('select count(*) from foto.linhas f where f.tb = %L and not exists (select 1 from public.%I x where to_jsonb(x) @> f.j)', tb, tb) into mudaram;
    execute format('select (select count(*) from public.%I) - (select count(*) from foto.linhas where tb = %L)', tb, tb) into diferenca;
    if mudaram > 0 or diferenca <> 0 then
      raise warning '❌ %: % linha(s) mudaram ou sumiram; % linha(s) de diferença no total', tb, mudaram, diferenca;
      erros := erros + 1;
    end if;
  end loop;
  if erros > 0 then raise exception 'os dados mudaram'; end if;
end $$;
\pset tuples_only on
\pset format unaligned
select '✅ dados intactos: ' || count(*) || ' linhas iguais à foto' from foto.linhas;
