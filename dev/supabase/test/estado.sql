-- Inventário da estrutura do banco (schema public + gatilho de cadastro em auth.users), resumido por tipo.
-- Serve para provar que o repositório descreve exatamente o que está na produção:
--   local:     banco montado só com o que já foi aplicado na produção →  psql -d <banco> -f test/estado.sql
--   produção:  o mesmo SELECT pelo conector do Supabase (somente leitura)
-- As assinaturas (md5) de cada tipo têm que ser iguais nos dois lados.
with inv(tipo, item, def) as (
  select 'coluna', c.relname || '.' || a.attname,
         format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' not null' else '' end
           || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')
  from pg_attribute a join pg_class c on c.oid = a.attrelid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
  union all
  select 'restricao', c.relname || '.' || con.conname, pg_get_constraintdef(con.oid)
  from pg_constraint con join pg_class c on c.oid = con.conrelid
  where c.relnamespace = 'public'::regnamespace
  union all
  select 'indice', c.relname || '.' || ic.relname, pg_get_indexdef(i.indexrelid)
  from pg_index i join pg_class c on c.oid = i.indrelid join pg_class ic on ic.oid = i.indexrelid
  where c.relnamespace = 'public'::regnamespace
  union all
  select 'rls', c.relname, c.relrowsecurity::text || '/' || c.relforcerowsecurity::text
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  union all
  select 'regra', c.relname || '.' || p.polname,
         p.polcmd::text || ' ' || p.polpermissive::text || ' '
           || (select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r where r.oid = any (p.polroles))
           || ' using(' || coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ') check(' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') || ')'
  from pg_policy p join pg_class c on c.oid = p.polrelid
  where c.relnamespace = 'public'::regnamespace
  union all
  select 'funcao', p.oid::regprocedure::text,
         md5(p.prosrc) || ' lang=' || l.lanname || ' definer=' || p.prosecdef::text || ' vol=' || p.provolatile::text
           || ' cfg=' || coalesce(array_to_string(p.proconfig, ','), '') || ' ret=' || format_type(p.prorettype, null)
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.pronamespace = 'public'::regnamespace
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  union all
  select 'gatilho', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where not t.tgisinternal
    and (c.relnamespace = 'public'::regnamespace or (c.oid = 'auth.users'::regclass and t.tgname = 'on_auth_user_created'))
  union all
  select 'acesso_tabela', c.relname || ':' || r.rolname,
         (select string_agg(p, ',' order by p) from unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p
          where has_table_privilege(r.oid, c.oid, p))
  from pg_class c cross join pg_roles r
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and r.rolname in ('anon', 'authenticated')
  union all
  select 'acesso_coluna', c.relname || '.' || a.attname || ':' || r.rolname,
         (select string_agg(p, ',' order by p) from unnest(array['select', 'insert', 'update']) p
          where has_column_privilege(r.oid, c.oid, a.attnum, p))
  from pg_attribute a join pg_class c on c.oid = a.attrelid cross join pg_roles r
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
    and r.rolname in ('anon', 'authenticated')
  union all
  select 'acesso_funcao', p.oid::regprocedure::text || ':' || r.rolname, has_function_privilege(r.oid, p.oid, 'execute')::text
  from pg_proc p cross join pg_roles r
  where p.pronamespace = 'public'::regnamespace and r.rolname in ('anon', 'authenticated')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
)
select tipo, count(*) as itens, md5(string_agg(item || ' => ' || coalesce(def, ''), E'\n' order by item)) as assinatura
from inv group by tipo order by tipo;
