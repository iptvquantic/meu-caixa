-- Limite de cadastros da função "conta" (migração 05): só a chave de serviço usa; 5 por endereço e 60 por hora no
-- total; código de endereço inválido é recusado; ninguém logado ou visitante lê a tabela ou chama a função.
-- Roda numa transação e desfaz tudo no fim.
\set ON_ERROR_STOP 1
select to_regclass('public.signup_log') is not null as tem_cadastro \gset
\if :tem_cadastro
\ir _inicio.sql

-- o comando tem que falhar (sem permissão)
create function t.denied(q text, msg text) returns void language plpgsql set search_path = public as $$
begin
  execute q;
  perform t.ok(false, msg || ' — passou sem erro');
exception when insufficient_privilege then perform t.ok(true, msg);
  when others then perform t.ok(false, msg || ' — erro ' || sqlstate || ': ' || sqlerrm);
end $$;

insert into auth.users (id, email) values ('e1000000-0000-4000-8000-000000000001', 'curioso@teste.local');

-- visitante e usuário logado: nada
set role anon;
select t.denied($$select count(*) from public.signup_log$$, 'visitante não lê as tentativas');
select t.denied($$select public.signup_attempt(repeat('a', 64))$$, 'visitante não chama o limite');
reset role;
select t.login('e1000000-0000-4000-8000-000000000001');
set role authenticated;
select t.denied($$select count(*) from public.signup_log$$, 'usuário logado não lê as tentativas');
select t.denied($$insert into public.signup_log (ip_hash) values (repeat('b', 64))$$, 'usuário logado não grava tentativa');
select t.denied($$select public.signup_attempt(repeat('a', 64))$$, 'usuário logado não chama o limite');
reset role;

-- a função (chave de serviço): 5 por endereço, depois recusa; outro endereço segue
set role service_role;
select t.ok((select bool_and(public.signup_attempt(repeat('c', 64))) from generate_series(1, 5)), '5 cadastros do mesmo endereço passam');
select t.ok(not public.signup_attempt(repeat('c', 64)), 'o 6º do mesmo endereço na mesma hora é recusado');
select t.ok(public.signup_attempt(repeat('d', 64)), 'outro endereço continua podendo');
select t.ok(not public.signup_attempt('curto') and not public.signup_attempt(null) and not public.signup_attempt(repeat('e', 200)), 'código de endereço inválido é recusado');
reset role;
select t.ok((select count(*) from public.signup_log) = 6, 'só as tentativas aceitas ficam anotadas (6)');
select t.ok(not exists (select 1 from public.signup_log where ip_hash ~ '^\d{1,3}(\.\d{1,3}){3}$'), 'nenhum IP guardado, só o código');

-- 60 por hora no total (endereços diferentes)
insert into public.signup_log (ip_hash) select md5(g::text) || md5(g::text) from generate_series(1, 54) g;
set role service_role;
select t.ok(not public.signup_attempt(repeat('f', 64)), 'com 60 na última hora, o próximo é recusado (qualquer endereço)');
reset role;
update public.signup_log set created_at = now() - interval '2 hours';
set role service_role;
select t.ok(public.signup_attempt(repeat('f', 64)), 'uma hora depois, volta a poder');
reset role;

\set teste 'limite de cadastros'
\ir _fim.sql
\endif
