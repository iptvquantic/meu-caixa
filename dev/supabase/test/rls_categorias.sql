-- Conta nova recebe só as categorias básicas (genéricas), nunca as de outra pessoa (as do dono, por exemplo),
-- e cada um cria e esconde as suas sem mexer nas dos outros. Roda numa transação e desfaz tudo no fim.
\set ON_ERROR_STOP 1
\ir _inicio.sql

-- o dono já tem categorias próprias (nomes de exemplo)
insert into auth.users (id, email) values ('c1000000-0000-4000-8000-000000000001', 'dono@teste.local');
insert into public.categories (user_id, kind, name, icon, sort) values
  ('c1000000-0000-4000-8000-000000000001', 'in', 'Venda de IPTV', 'i:tv', 5),
  ('c1000000-0000-4000-8000-000000000001', 'in', 'Juros Agiota', 'i:percent', 6),
  ('c1000000-0000-4000-8000-000000000001', 'in', 'Banca de Apostas', 'i:dice-5', 7);

-- cliente novo se cadastra
insert into auth.users (id, email) values ('c1000000-0000-4000-8000-000000000002', 'nova@teste.local');
select t.ok((select count(*) from public.categories where user_id = 'c1000000-0000-4000-8000-000000000002') = 29, 'conta nova: 29 categorias básicas');
select t.ok((select count(*) filter (where kind = 'out') = 16 and count(*) filter (where kind = 'in') = 5 and count(*) filter (where kind = 'invest') = 8
  from public.categories where user_id = 'c1000000-0000-4000-8000-000000000002'), 'gastos 16, entradas 5, investimentos 8');
select t.ok(not exists (select 1 from public.categories where user_id = 'c1000000-0000-4000-8000-000000000002'
  and (name ~* '(iptv|agiota|aposta|banca)' or legacy_key is null)), 'nenhuma categoria de outra pessoa (nem do dono) vai para a conta nova');
select t.ok((select bool_and(legacy_key is not null) from public.categories where user_id = 'c1000000-0000-4000-8000-000000000002'), 'todas as básicas marcadas como padrão');

-- a cliente cria a dela e esconde uma básica; nada muda para o dono
select t.login('c1000000-0000-4000-8000-000000000002');
set role authenticated;
select t.allowed($$insert into categories (kind, name, icon, sort) values ('in', 'Bolos por encomenda', 'i:cake', 9)$$, 'cliente cria a categoria dela');
select t.allowed($$update categories set archived = true where legacy_key = 'fornecedores'$$, 'cliente esconde uma básica que não usa');
select t.ok((select count(*) from categories) = 30, 'ela vê só as dela (29 básicas + 1 criada)');
reset role;
select t.ok((select count(*) from public.categories where user_id = 'c1000000-0000-4000-8000-000000000001') = 32
  and not exists (select 1 from public.categories where user_id = 'c1000000-0000-4000-8000-000000000001' and archived), 'as do dono continuam iguais');

\set teste 'categorias de conta nova'
\ir _fim.sql
