-- Teste de segurança do painel de clientes (migração 04). Roda numa transação e desfaz tudo no fim.
-- Pessoas: M = Mário (master, o dono), D = Duda (admin), A = Ana (teste grátis, com lançamentos),
-- B = Bia (plano ativo), E = Edu (plano vencido).
\set ON_ERROR_STOP 1
select to_regclass('public.admin_log') is not null as tem_painel \gset
\if :tem_painel
\ir _inicio.sql

-- o comando tem que falhar com este código de erro
create function t.fails(q text, state text, msg text) returns void language plpgsql set search_path = public as $$
begin
  execute q;
  perform t.ok(false, msg || ' — passou sem erro');
exception when others then
  perform t.ok(sqlstate = state, msg || case when sqlstate = state then '' else ' — erro ' || sqlstate || ': ' || sqlerrm end);
end $$;

insert into auth.users (id, email, last_sign_in_at) values
  ('d1000000-0000-4000-8000-000000000001', 'mario@teste.local', now() - interval '1 hour'),
  ('d1000000-0000-4000-8000-000000000002', 'duda@teste.local', null),
  ('d1000000-0000-4000-8000-000000000003', 'ana@teste.local', now() - interval '2 days'),
  ('d1000000-0000-4000-8000-000000000004', 'bia@teste.local', null),
  ('d1000000-0000-4000-8000-000000000005', 'edu@teste.local', null);
update public.profiles set plan = 'master', name = 'Mário' where id = 'd1000000-0000-4000-8000-000000000001';
update public.profiles set plan = 'admin' where id = 'd1000000-0000-4000-8000-000000000002';
update public.profiles set name = 'Ana' where id = 'd1000000-0000-4000-8000-000000000003';
update public.profiles set plan = 'active', plan_expiry = now() + interval '20 days' where id = 'd1000000-0000-4000-8000-000000000004';
update public.profiles set plan_expiry = now() - interval '3 days' where id = 'd1000000-0000-4000-8000-000000000005';
insert into public.transactions (user_id, type, amount, date, description) values
  ('d1000000-0000-4000-8000-000000000003', 'out', 52.90, '2026-10-20', 'Mercado'),
  ('d1000000-0000-4000-8000-000000000003', 'in', 300.00, '2026-10-25', 'Cliente'),
  ('d1000000-0000-4000-8000-000000000003', 'out', 18.00, '2026-10-22', 'Uber');
select t.keep('ana_exp', plan_expiry::text) from public.profiles where id = 'd1000000-0000-4000-8000-000000000003';
select t.keep('bia_exp', plan_expiry::text) from public.profiles where id = 'd1000000-0000-4000-8000-000000000004';

-- ---------- quem pode chamar o quê ----------
select t.ok(has_function_privilege('authenticated', 'public.admin_users()', 'execute')
  and has_function_privilege('authenticated', 'public.admin_set_plan(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.admin_users()', 'execute')
  and not has_function_privilege('anon', 'public.admin_set_plan(uuid,text)', 'execute'), 'painel: só usuário logado chama (e a função confere se é o dono)');
select t.ok(not has_function_privilege('anon', 'public.is_admin()', 'execute') and not has_function_privilege('authenticated', 'public.is_admin()', 'execute'),
  'is_admin é só de uso interno');
select t.ok(not has_table_privilege('authenticated', 'public.admin_log', 'select') and not has_table_privilege('authenticated', 'public.admin_log', 'insert')
  and not has_table_privilege('anon', 'public.admin_log', 'select'), 'registro do painel: app e visitante não leem nem escrevem');
select t.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('admin_users', 'admin_set_plan', 'is_admin')
  and p.prosrc ~* '\mdelete\s+from\M'), 'funções do painel não apagam linhas');
select t.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('admin_users', 'admin_set_plan', 'is_admin')
  and not (p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=public%')), 'funções do painel com search_path fixo');
select t.ok(not exists (select 1 from unnest((select proargnames from pg_proc where proname = 'admin_users' and pronamespace = 'public'::regnamespace)) c
  where c in ('amount', 'description', 'category_id')), 'lista de clientes não traz valores nem descrições dos lançamentos');

-- ---------- cliente comum não usa o painel ----------
select t.login('d1000000-0000-4000-8000-000000000003');
set role authenticated;
select t.fails($$select * from public.admin_users()$$, '42501', 'Ana (cliente) não vê a lista de clientes');
select t.fails($$select * from public.admin_set_plan(auth.uid(), 'anual')$$, '42501', 'Ana não se dá o plano anual');
select t.fails($$select * from public.admin_set_plan('d1000000-0000-4000-8000-000000000004', 'bloquear')$$, '42501', 'Ana não bloqueia outra cliente');
select t.blocked($$select * from admin_log$$, 'Ana não lê o registro do painel');
select t.blocked($$insert into admin_log (user_id, action) values (auth.uid(), 'anual')$$, 'Ana não escreve no registro');
select t.blocked($$update profiles set plan = 'active', plan_expiry = now() + interval '10 years' where id = auth.uid()$$, 'Ana continua sem mudar o próprio plano direto');
reset role;
select t.ok((select plan from public.profiles where id = 'd1000000-0000-4000-8000-000000000003') = 'trial', 'plano da Ana não mudou');

-- visitante (sem login)
select set_config('request.jwt.claims', '', false);
set role anon;
select t.blocked($$select * from public.admin_users()$$, 'visitante não chama o painel');
reset role;

-- ---------- o dono (master) ----------
select t.login('d1000000-0000-4000-8000-000000000001');
set role authenticated;
select t.ok((select count(*) from public.admin_users() where id in ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000005')) = 5, 'dono vê todos os clientes');
select t.ok((select tx_count = 3 and last_tx = '2026-10-25' and last_seen is not null and email = 'ana@teste.local' and name = 'Ana'
  from public.admin_users() where id = 'd1000000-0000-4000-8000-000000000003'), 'lista: quantos lançamentos, o último e o último acesso');
select t.ok((select tx_count = 0 and last_tx is null from public.admin_users() where id = 'd1000000-0000-4000-8000-000000000005'), 'cliente sem lançamento: zero');

-- mensal para a Ana (em teste, ainda válido): soma 1 mês à validade atual e vira plano ativo
select t.ok((select plan = 'active' and active and plan_expiry = t.id('ana_exp')::timestamptz + interval '1 month'
  from public.admin_set_plan('d1000000-0000-4000-8000-000000000003', 'mensal')), 'mensal: +1 mês a partir da validade atual, plano ativo');
-- anual para o Edu (vencido): conta a partir de hoje, não da validade velha
select t.ok((select plan = 'active' and plan_expiry between now() + interval '1 year' - interval '1 minute' and now() + interval '1 year' + interval '1 minute'
  from public.admin_set_plan('d1000000-0000-4000-8000-000000000005', 'anual')), 'anual para quem venceu: 1 ano a partir de hoje');
select t.ok((select plan = 'active' and plan_expiry = t.id('bia_exp')::timestamptz + interval '7 days'
  from public.admin_set_plan('d1000000-0000-4000-8000-000000000004', 'mais7')), '+7 dias: soma 7 dias e mantém o plano');
select t.ok((select not active from public.admin_set_plan('d1000000-0000-4000-8000-000000000004', 'bloquear')), 'bloquear: conta fica só leitura');
reset role;

-- Bia bloqueada não grava; desbloqueada volta a gravar
select t.login('d1000000-0000-4000-8000-000000000004');
set role authenticated;
select t.blocked($$insert into transactions (type, amount, date, description) values ('out', 10, current_date, 'teste')$$, 'Bia bloqueada não lança');
reset role;
select t.login('d1000000-0000-4000-8000-000000000001');
set role authenticated;
select t.ok((select active from public.admin_set_plan('d1000000-0000-4000-8000-000000000004', 'desbloquear')), 'desbloquear');
reset role;
select t.login('d1000000-0000-4000-8000-000000000004');
set role authenticated;
select t.allowed($$insert into transactions (type, amount, date, description) values ('out', 10, current_date, 'teste')$$, 'Bia desbloqueada lança de novo');
reset role;

-- limites do painel
select t.login('d1000000-0000-4000-8000-000000000001');
set role authenticated;
select t.fails($$select * from public.admin_set_plan(auth.uid(), 'bloquear')$$, '42501', 'conta master não muda pelo painel (nem a própria)');
select t.fails($$select * from public.admin_set_plan('d1000000-0000-4000-8000-000000000002', 'bloquear')$$, '42501', 'conta admin não muda pelo painel');
select t.fails($$select * from public.admin_set_plan('d1000000-0000-4000-8000-000000000003', 'gratis')$$, '22023', 'ação inválida é recusada');
select t.fails($$select * from public.admin_set_plan('d1000000-0000-4000-8000-000000000003', null)$$, '22023', 'ação vazia é recusada');
select t.fails($$select * from public.admin_set_plan('00000000-0000-4000-8000-000000000000', 'mensal')$$, 'P0002', 'cliente inexistente');
select t.ok((select last_action = 'mensal' and last_action_at is not null from public.admin_users() where id = 'd1000000-0000-4000-8000-000000000003'), 'lista mostra o último ajuste');

-- desfazer: anual dado por engano para a Ana (que já tinha o mensal) volta ao mensal
select t.ok((select plan_expiry = t.id('ana_exp')::timestamptz + interval '1 month' + interval '1 year'
  from public.admin_set_plan('d1000000-0000-4000-8000-000000000003', 'anual')), 'anual por cima do mensal soma');
select t.ok((select plan = 'active' and active and plan_expiry = t.id('ana_exp')::timestamptz + interval '1 month'
  from public.admin_set_plan('d1000000-0000-4000-8000-000000000003', 'desfazer')), 'desfazer volta ao que era antes do último ajuste');
select t.ok((select last_action = 'desfazer' from public.admin_users() where id = 'd1000000-0000-4000-8000-000000000003'), 'lista mostra o desfazer');
reset role;
insert into auth.users (id, email) values ('d1000000-0000-4000-8000-000000000006', 'fabio@teste.local'), ('d1000000-0000-4000-8000-000000000007', 'gil@teste.local');
insert into public.admin_log (admin_id, user_id, action, plan_before, expiry_before, active_before, plan_after, expiry_after, active_after, created_at)
  values ('d1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000007', 'anual', 'trial', now(), true, 'active', now() + interval '1 year', true, now() - interval '2 days');
select t.login('d1000000-0000-4000-8000-000000000001');
set role authenticated;
select t.fails($$select * from public.admin_set_plan('d1000000-0000-4000-8000-000000000006', 'desfazer')$$, 'P0002', 'desfazer sem ajuste nenhum: recusa');
select t.fails($$select * from public.admin_set_plan('d1000000-0000-4000-8000-000000000007', 'desfazer')$$, 'P0002', 'desfazer ajuste de mais de 24 h: recusa');
reset role;
select t.ok((select plan = 'trial' from public.profiles where id = 'd1000000-0000-4000-8000-000000000007'), 'recusa não muda nada');

-- registro de cada mudança
select t.ok((select count(*) from public.admin_log where admin_id = 'd1000000-0000-4000-8000-000000000001' and created_at > now() - interval '1 day') = 7,
  'cada mudança registrada (7) com quem fez; tentativas recusadas não entram');
select t.ok((select plan_before = 'active' and plan_after = 'active' and expiry_after = t.id('ana_exp')::timestamptz + interval '1 month'
  from public.admin_log where user_id = 'd1000000-0000-4000-8000-000000000003' and action = 'desfazer'), 'o desfazer também fica registrado');
select t.ok((select plan_before = 'trial' and plan_after = 'active' and expiry_after = expiry_before + interval '1 month'
  from public.admin_log where user_id = 'd1000000-0000-4000-8000-000000000003' and action = 'mensal'), 'registro guarda como estava e como ficou');

-- outro admin também usa; admin bloqueado não
select t.login('d1000000-0000-4000-8000-000000000002');
set role authenticated;
select t.ok((select count(*) from public.admin_users()) >= 5, 'admin (não master) também vê os clientes');
reset role;
update public.profiles set active = false where id = 'd1000000-0000-4000-8000-000000000002';
select t.login('d1000000-0000-4000-8000-000000000002');
set role authenticated;
select t.fails($$select * from public.admin_users()$$, '42501', 'admin bloqueado não usa o painel');
reset role;

\set teste 'painel de clientes'
\ir _fim.sql
\endif
