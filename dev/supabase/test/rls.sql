-- Teste de segurança do banco: regras de acesso (RLS), permissões, validações e "nunca perder dado".
-- Roda numa transação e desfaz tudo no fim (não deixa rastro). Uso: ver test-db.sh.
-- Pessoas do teste:  A = Ana (teste grátis válido)   B = Bia (outra cliente)   E = Edu (plano vencido)
--                    F = Fabi (conta desativada)      M = dono (master, data de validade passada)
\ir _inicio.sql

-- ---------- cadastro: perfil, teste grátis e categorias criados pelo servidor ----------
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'ana@teste.local'),
  ('b0000000-0000-4000-8000-000000000002', 'bia@teste.local'),
  ('e0000000-0000-4000-8000-000000000003', 'edu@teste.local'),
  ('f0000000-0000-4000-8000-000000000004', 'fabi@teste.local'),
  ('d0000000-0000-4000-8000-000000000005', 'dono@teste.local');
select t.ok((select count(*) from public.profiles where email like '%@teste.local') = 5, 'cadastro: cada usuário novo ganha perfil');
select t.ok((select bool_and(plan = 'trial' and active and plan_expiry = now() + interval '15 days') from public.profiles where email like '%@teste.local'),
  'cadastro: começa com 15 dias grátis definidos no servidor');
select t.ok((select count(*) from public.categories where user_id = 'a0000000-0000-4000-8000-000000000001') = 29, 'cadastro: 29 categorias padrão');

update public.profiles set plan_expiry = now() - interval '1 day' where id = 'e0000000-0000-4000-8000-000000000003';
update public.profiles set active = false where id = 'f0000000-0000-4000-8000-000000000004';
update public.profiles set plan = 'master', plan_expiry = now() - interval '1 day' where id = 'd0000000-0000-4000-8000-000000000005';

-- dados da Bia (a "outra cliente")
select t.login('b0000000-0000-4000-8000-000000000002');
set role authenticated;
insert into public.cards (name) values ('Cartão da Bia');
insert into public.transactions (type, amount, date, description, category_id)
  select 'out', 10, current_date, 'gasto da Bia', id from public.categories where kind = 'out' and legacy_key = 'mercado';
insert into public.recurring (type, name, amount, day, start_month) values ('out', 'Aluguel da Bia', 900, 5, to_char(current_date, 'YYYY-MM'));
insert into public.goals (kind, name, amount) values ('save', 'Reserva da Bia', 5000);
reset role;
insert into t.ids
  select 'b_card', id::text from public.cards where name = 'Cartão da Bia'
  union all select 'b_cat', id::text from public.categories where user_id = 'b0000000-0000-4000-8000-000000000002' and kind = 'out' and legacy_key = 'mercado'
  union all select 'b_tx', id::text from public.transactions where description = 'gasto da Bia'
  union all select 'b_rec', id::text from public.recurring where name = 'Aluguel da Bia'
  union all select 'b_goal', id::text from public.goals where name = 'Reserva da Bia';
select t.ok((select count(*) from t.ids) = 5, 'dados da Bia prontos para o teste');

-- ---------- visitante sem login ----------
select set_config('request.jwt.claims', '', false);
set role anon;
select t.blocked($$select * from transactions$$, 'sem login: não lê lançamentos');
select t.blocked($$select * from profiles$$, 'sem login: não lê perfis');
select t.blocked($$insert into transactions (type, amount, date) values ('in', 1, current_date)$$, 'sem login: não grava');
select t.blocked($$select public.ai_consume()$$, 'sem login: não usa a IA');
reset role;

-- ---------- Ana (teste grátis válido) ----------
select t.login('a0000000-0000-4000-8000-000000000001');
set role authenticated;
-- só enxerga o que é dela
select t.ok((select count(*) from profiles) = 1 and (select id from profiles) = 'a0000000-0000-4000-8000-000000000001', 'Ana vê só o próprio perfil');
select t.ok((select count(*) from categories) = 29, 'Ana vê só as próprias categorias');
select t.ok((select count(*) from transactions) + (select count(*) from cards) + (select count(*) from recurring) + (select count(*) from goals) = 0,
  'Ana não vê lançamentos, cartões, contas fixas nem metas da Bia');
-- perfil: muda nome/WhatsApp/preferências; plano e validade nunca
select t.allowed($$update profiles set name = 'Ana', whatsapp = '22991053813', settings = '{"theme":"dark"}' where id = auth.uid()$$, 'Ana altera nome, WhatsApp e preferências');
select t.blocked($$update profiles set plan = 'master'$$, 'Ana não muda o próprio plano');
select t.blocked($$update profiles set plan_expiry = '2099-01-01'$$, 'Ana não estende a validade');
select t.blocked($$update profiles set active = true$$, 'Ana não mexe no ativo/desativado');
select t.blocked($$update profiles set name = 'invasão' where id = 'b0000000-0000-4000-8000-000000000002'$$, 'Ana não altera o perfil da Bia');
select t.blocked($$insert into profiles (id, email) values (gen_random_uuid(), 'x@x')$$, 'Ana não cria perfil');
select t.blocked($$delete from profiles$$, 'Ana não apaga perfil');
select t.blocked($$update profiles set whatsapp = '12ab'$$, 'WhatsApp só com números');
select t.blocked($$update profiles set settings = (select jsonb_object_agg(g::text, md5(g::text)) from generate_series(1, 400) g)$$, 'preferências têm tamanho máximo');
-- categorias
select t.allowed($$insert into categories (kind, name, icon) values ('out', 'Farmácia do bairro', 'i:pill')$$, 'Ana cria categoria');
select t.blocked($$insert into categories (user_id, kind, name) values ('b0000000-0000-4000-8000-000000000002', 'out', 'intrusa')$$, 'Ana não cria categoria na conta da Bia');
select t.blocked(format($$update categories set name = 'invasão' where id = %L$$, t.id('b_cat')), 'Ana não altera categoria da Bia');
select t.blocked(format($$delete from categories where id = %L$$, t.id('b_cat')), 'Ana não apaga categoria da Bia');
select t.blocked($$update categories set user_id = 'b0000000-0000-4000-8000-000000000002' where name = 'Farmácia do bairro'$$, 'Ana não passa categoria para a Bia');
-- cartões
select t.allowed($$insert into cards (name, closing_day, due_day) values ('Inter', 9, 16)$$, 'Ana cria cartão');
select t.blocked(format($$update cards set name = 'invasão' where id = %L$$, t.id('b_card')), 'Ana não altera cartão da Bia');
-- lançamentos
select t.allowed($$insert into transactions (type, amount, date, description, category_id) select 'out', 52.90, current_date, 'Drogasil', id from categories where name = 'Farmácia do bairro'$$,
  'Ana lança saída na categoria dela');
select t.allowed($$insert into transactions (type, amount, date, description, card_id, installments, category_id) select 'card', 3600, current_date, 'Notebook', c.id, 12, k.id from cards c, categories k where c.name = 'Inter' and k.kind = 'out' and k.legacy_key = 'educacao'$$,
  'Ana lança compra parcelada no cartão dela');
select t.allowed($$insert into transactions (type, amount, date, description, card_id) select 'out', 7, current_date, 'pix com cartão', id from cards where name = 'Inter'$$, 'saída com cartão marcado é aceita');
select t.ok((select card_id is null from transactions where description = 'pix com cartão'), 'saída não guarda cartão (só compra no cartão guarda)');
select t.blocked(format($$insert into transactions (type, amount, date, category_id) values ('out', 5, current_date, %L)$$, t.id('b_cat')), 'Ana não usa categoria da Bia');
select t.blocked(format($$insert into transactions (type, amount, date, card_id) values ('card', 5, current_date, %L)$$, t.id('b_card')), 'Ana não usa cartão da Bia');
select t.blocked($$insert into transactions (type, amount, date, category_id) select 'in', 5, current_date, id from categories where kind = 'out' and legacy_key = 'mercado'$$,
  'entrada não aceita categoria de gasto');
select t.blocked($$insert into transactions (user_id, type, amount, date) values ('b0000000-0000-4000-8000-000000000002', 'in', 5, current_date)$$, 'Ana não lança na conta da Bia');
select t.blocked($$insert into transactions (type, amount, date) values ('out', 0, current_date)$$, 'valor tem que ser maior que zero');
select t.blocked($$insert into transactions (type, amount, date, installments) values ('out', 10, current_date, 3)$$, 'parcelas só em compra no cartão');
select t.blocked($$insert into transactions (type, amount, date) values ('invest', 10, current_date)$$, 'investimento exige aporte ou resgate');
select t.blocked(format($$update transactions set amount = 1 where id = %L$$, t.id('b_tx')), 'Ana não altera lançamento da Bia');
select t.blocked(format($$delete from transactions where id = %L$$, t.id('b_tx')), 'Ana não apaga lançamento da Bia');
select t.blocked($$update transactions set user_id = 'b0000000-0000-4000-8000-000000000002' where description = 'Drogasil'$$, 'Ana não passa lançamento para a Bia');
-- IA: contador só pela função, limite decidido no servidor
select t.blocked($$select * from ai_usage$$, 'contador da IA fechado para leitura');
select t.blocked($$insert into ai_usage (user_id, day, count) values (auth.uid(), current_date, -100)$$, 'Ana não zera o próprio contador da IA');
select t.ok((select (public.ai_consume() ->> 'ok')::boolean), 'IA liberada no teste grátis');
select t.ok((select public.ai_consume() ->> 'limit') = '40', 'IA: limite diário de 40 no teste grátis');
do $$ begin for i in 1..38 loop perform public.ai_consume(); end loop; end $$;
select t.ok((select public.ai_consume() ->> 'reason') = 'limit', 'IA: a 41ª pergunta do dia é barrada');
-- contas fixas (2.1)
select t.allowed($$insert into recurring (type, name, amount, day, start_month, category_id, phone) select 'out', 'Aluguel', 900, 5, to_char(current_date, 'YYYY-MM'), id, '22991053813' from categories where kind = 'out' and legacy_key = 'moradia'$$,
  'Ana cria conta fixa a pagar');
select t.ok((select phone is null from recurring where name = 'Aluguel'), 'telefone só fica em conta a receber');
select t.allowed($$insert into recurring (type, name, amount, day, start_month, phone) values ('in', 'Mensalidade Rogério', 45, 10, to_char(current_date, 'YYYY-MM'), '5522977770000')$$,
  'Ana cria conta fixa a receber com WhatsApp');
select t.blocked($$insert into recurring (type, name, amount, day, start_month, category_id) select 'in', 'x', 10, 1, '2026-01', id from categories where kind = 'out' and legacy_key = 'mercado'$$,
  'conta a receber não aceita categoria de gasto');
select t.blocked(format($$insert into recurring (type, name, amount, day, start_month, card_id) values ('card', 'x', 10, 1, '2026-01', %L)$$, t.id('b_card')), 'Ana não usa cartão da Bia na conta fixa');
select t.blocked($$insert into recurring (type, name, amount, day, start_month, end_month) values ('out', 'x', 10, 1, '2026-05', '2026-01')$$, 'fim da conta fixa não pode ser antes do início');
select t.blocked($$insert into recurring (type, name, amount, day, start_month) values ('out', 'x', 10, 32, '2026-01')$$, 'dia do vencimento entre 1 e 31');
select t.blocked($$insert into recurring (type, name, amount, day, start_month) values ('out', 'x', 10, 1, '2026-13')$$, 'mês inválido é recusado');
select t.blocked(format($$update recurring set amount = 1 where id = %L$$, t.id('b_rec')), 'Ana não altera conta fixa da Bia');
select t.allowed($$insert into transactions (type, amount, date, description, recurring_id) select 'out', 900, current_date, 'Aluguel', id from recurring where name = 'Aluguel'$$,
  'Ana marca a conta fixa como paga');
select t.ok((select recurring_month = to_char(current_date, 'YYYY-MM') from transactions where description = 'Aluguel'), 'mês pago da conta fixa preenchido sozinho');
select t.blocked($$insert into transactions (type, amount, date, description, recurring_id) select 'out', 900, current_date, 'Aluguel de novo', id from recurring where name = 'Aluguel'$$,
  'a mesma conta fixa não é paga 2x no mesmo mês');
select t.blocked(format($$insert into transactions (type, amount, date, recurring_id) values ('out', 10, current_date, %L)$$, t.id('b_rec')), 'Ana não liga lançamento à conta fixa da Bia');
-- metas (2.1)
select t.blocked($$insert into goals (kind, amount) values ('budget', 500)$$, 'limite de gasto precisa de categoria');
select t.blocked($$insert into goals (kind, amount, category_id) select 'budget', 500, id from categories where legacy_key = 'salario'$$, 'limite de gasto só com categoria de gasto');
select t.allowed($$insert into goals (kind, amount, category_id) select 'budget', 500, id from categories where kind = 'out' and legacy_key = 'alimentacao'$$, 'Ana cria limite de gasto');
select t.allowed($$insert into goals (kind, name, amount, deadline) values ('save', 'Reserva', 10000, '2027-12-31')$$, 'Ana cria objetivo de guardar');
select t.blocked(format($$insert into goals (kind, amount, category_id) values ('budget', 100, %L)$$, t.id('b_cat')), 'Ana não usa categoria da Bia na meta');
select t.blocked(format($$delete from goals where id = %L$$, t.id('b_goal')), 'Ana não apaga meta da Bia');
select t.ok((select count(*) from goals) = 2 and (select count(*) from recurring) = 2, 'Ana vê só as metas e contas fixas dela');
-- apagar categoria, cartão ou conta fixa nunca apaga lançamento
select t.allowed($$delete from categories where name = 'Farmácia do bairro'$$, 'Ana apaga uma categoria');
select t.ok((select count(*) from transactions where description = 'Drogasil' and category_id is null) = 1, 'o lançamento da categoria apagada continua (sem categoria)');
select t.allowed($$delete from cards where name = 'Inter'$$, 'Ana apaga um cartão');
select t.ok((select count(*) from transactions where description = 'Notebook' and card_id is null and amount = 3600 and installments = 12) = 1, 'a compra do cartão apagado continua');
select t.allowed($$delete from recurring where name = 'Aluguel'$$, 'Ana apaga uma conta fixa');
select t.ok((select count(*) from transactions where description = 'Aluguel' and recurring_id is null and recurring_month is null) = 1, 'o pagamento da conta fixa apagada continua no extrato');
select t.ok((select count(*) from transactions) = 4, 'Ana termina com os 4 lançamentos dela');
reset role;

-- ---------- Edu (plano vencido): lê e exporta, não grava ----------
select t.login('e0000000-0000-4000-8000-000000000003');
set role authenticated;
select t.ok((select count(*) from categories) = 29, 'plano vencido: ainda lê os próprios dados (backup)');
select t.blocked($$insert into transactions (type, amount, date) values ('in', 10, current_date)$$, 'plano vencido: não grava lançamento');
select t.blocked($$update categories set name = 'x'$$, 'plano vencido: não altera');
select t.blocked($$delete from categories$$, 'plano vencido: não apaga');
select t.ok((select public.ai_consume() ->> 'reason') = 'plan', 'plano vencido: IA bloqueada');
select t.allowed($$update profiles set settings = '{"theme":"light"}'$$, 'plano vencido: ainda troca o tema');
reset role;

-- ---------- Fabi (conta desativada) ----------
select t.login('f0000000-0000-4000-8000-000000000004');
set role authenticated;
select t.blocked($$insert into categories (kind, name) values ('out', 'x')$$, 'conta desativada: não grava');
select t.ok((select public.ai_consume() ->> 'reason') = 'plan', 'conta desativada: IA bloqueada');
reset role;

-- ---------- dono (master): acesso mesmo com data passada ----------
select t.login('d0000000-0000-4000-8000-000000000005');
set role authenticated;
select t.allowed($$insert into transactions (type, amount, date, description) values ('in', 100, current_date, 'teste do dono')$$, 'master grava mesmo com validade passada');
select t.ok((select public.ai_consume() ->> 'limit') = '500', 'master: limite de 500 na IA');
reset role;

-- ---------- permissões fixas ----------
select t.ok(not has_function_privilege('authenticated', 'public.seed_defaults(uuid)', 'execute') and not has_function_privilege('anon', 'public.seed_defaults(uuid)', 'execute'),
  'seed_defaults não é chamável de fora');
select t.ok(not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') and not has_function_privilege('anon', 'public.handle_new_user()', 'execute'),
  'handle_new_user não é chamável de fora');
select t.ok(has_function_privilege('authenticated', 'public.has_access()', 'execute') and not has_function_privilege('anon', 'public.has_access()', 'execute'), 'has_access: só usuário logado');
select t.ok(has_function_privilege('authenticated', 'public.ai_consume()', 'execute') and not has_function_privilege('anon', 'public.ai_consume()', 'execute'), 'ai_consume: só usuário logado');
select t.ok(not has_function_privilege('authenticated', 'public.recurring_validate()', 'execute') and not has_function_privilege('authenticated', 'public.goals_validate()', 'execute'),
  'validações de contas fixas e metas não são chamáveis');
select t.ok(not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity), 'RLS ligado em todas as tabelas');
select t.ok(not exists (select 1 from pg_class c, unnest(array['select', 'insert', 'update', 'delete']) p
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and has_table_privilege('anon', c.oid, p)), 'sem login: nenhuma permissão em tabela');
select t.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
  and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')), 'funções com privilégio fixam o search_path');

\set teste 'segurança do banco'
\ir _fim.sql
