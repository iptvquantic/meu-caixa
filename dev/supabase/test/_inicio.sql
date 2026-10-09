-- Início comum dos testes de segurança: abre uma transação (tudo é desfeito no _fim.sql)
-- e cria as ferramentas t.ok / t.allowed / t.blocked / t.login / t.id.
\set ON_ERROR_STOP 1
\if :{?fase}
\else
  \set fase 'atual'
\endif
\o /dev/null
begin;
set local client_min_messages = warning;

create schema t;
grant usage on schema t to anon, authenticated, service_role;
create table t.results (n serial primary key, ok boolean not null, msg text not null);
create table t.ids (k text primary key, v text not null);

create function t.ok(cond boolean, msg text) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin insert into t.results (ok, msg) values (coalesce(cond, false), msg); end $$;

-- valores guardados durante o teste (ids de outra pessoa, códigos...) para usar em outro papel
create function t.id(key text) returns text
language sql stable security definer set search_path = pg_catalog as $$ select v from t.ids where k = key $$;
create function t.keep(key text, val text) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin insert into t.ids (k, v) values (key, val) on conflict (k) do update set v = excluded.v; end $$;

create function t.login(uid uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false); end $$;

-- o comando tem que funcionar e afetar pelo menos 1 linha
create function t.allowed(q text, msg text) returns void language plpgsql set search_path = public as $$
declare n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  perform t.ok(n > 0, msg || ' — não afetou nenhuma linha');
exception when others then
  perform t.ok(false, msg || ' — erro ' || sqlstate || ': ' || sqlerrm);
end $$;

-- o comando tem que ser barrado: erro de permissão/regra/validação, ou não afetar nenhuma linha
create function t.blocked(q text, msg text) returns void language plpgsql set search_path = public as $$
declare n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  perform t.ok(n = 0, msg || ' — passou e afetou ' || n || ' linha(s)');
exception
  when insufficient_privilege or check_violation or foreign_key_violation or unique_violation or not_null_violation then
    perform t.ok(true, msg);
  when others then
    perform t.ok(false, msg || ' — erro inesperado ' || sqlstate || ': ' || sqlerrm);
end $$;
