-- Conferências de estrutura do banco no estado final do repositório (depois de todas as migrações):
-- o que o Performance/Security Advisor do Supabase cobra, verificado antes de ir para a produção.
\set ON_ERROR_STOP 1
\o /dev/null
begin;
create temp table problemas on commit drop as
  -- chave estrangeira sem índice (apagar o registro pai varreria a tabela inteira)
  select 'chave estrangeira sem índice: ' || c.conrelid::regclass || ' (' || a.attname || ')' as msg
  from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  union all
  -- regra de acesso que recalcula auth.uid()/has_access() a cada linha
  select 'regra recalcula por linha: ' || tablename || '.' || policyname
  from pg_policies
  where schemaname = 'public'
    and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
          '\( SELECT (auth\.uid\(\) AS uid|(public\.)?has_access\(\) AS has_access)\)', '', 'g') ~ '(auth\.uid\(\)|has_access\(\))'
  union all
  -- usuário logado/visitante só com ler/criar/alterar/apagar
  select 'privilégio a mais: ' || c.relname || ' ' || r.rolname || ' ' || p
  from pg_class c cross join (values ('anon'), ('authenticated')) r(rolname)
    cross join unnest(array['truncate', 'references', 'trigger']) p
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and has_table_privilege(r.rolname, c.oid, p);
\o
\pset tuples_only on
\pset format unaligned
select '❌ ' || msg from problemas order by msg;
select case when count(*) = 0 then '✅ estrutura do banco (índices, regras e privilégios): ok'
            else '❌ estrutura do banco: ' || count(*) || ' problema(s)' end from problemas;
do $$ begin if exists (select 1 from problemas) then raise exception 'estrutura do banco com problemas'; end if; end $$;
rollback;
