-- Cliente com histórico (como um usuário real de hoje) + "foto" exata de todos os dados.
-- Fica gravado no banco de teste; depois o confere.sql garante que as migrações não mudaram nem apagaram nada.
\set ON_ERROR_STOP 1
\o /dev/null
set client_min_messages = warning;
insert into auth.users (id, email) values ('c0000000-0000-4000-8000-000000000009', 'cliente@dados.local');
update public.profiles set name = 'Cliente Antigo', whatsapp = '22991053813', settings = '{"theme":"cyber","features":{"goals":false}}'
  where id = 'c0000000-0000-4000-8000-000000000009';
-- categoria própria com emoji e uma categoria padrão apagada pelo usuário
insert into public.categories (user_id, kind, name, icon, color) values ('c0000000-0000-4000-8000-000000000009', 'in', 'Mensalidades', '💈', '#22c55e');
delete from public.categories where user_id = 'c0000000-0000-4000-8000-000000000009' and kind = 'out' and legacy_key = 'farmacia';
insert into public.cards (user_id, name, closing_day, due_day, legacy_key) values ('c0000000-0000-4000-8000-000000000009', 'Nubank', 9, 16, 'nubank');
-- 120 lançamentos dos 4 tipos (cartão parcelado, aporte/resgate)
insert into public.transactions (user_id, type, amount, date, description, category_id, card_id, installments, invest_kind, legacy_ts)
select 'c0000000-0000-4000-8000-000000000009',
  (array['in', 'out', 'card', 'invest'])[1 + g % 4],
  round((10 + g * 7.31)::numeric, 2),
  date '2026-01-01' + g,
  'lançamento ' || g,
  (select id from public.categories c where c.user_id = 'c0000000-0000-4000-8000-000000000009' and c.legacy_key = 'outros'
     and c.kind = (array['in', 'out', 'out', 'invest'])[1 + g % 4]),
  case when g % 4 = 2 then (select id from public.cards where user_id = 'c0000000-0000-4000-8000-000000000009' and name = 'Nubank') end,
  case when g % 4 = 2 then 1 + g % 12 else 1 end,
  case when g % 4 = 3 then (array['aporte', 'resgate'])[1 + g % 2] end,
  1700000000000 + g
from generate_series(1, 120) g;
-- contas fixas, um pagamento ligado, meta e uso da IA
insert into public.recurring (user_id, type, name, amount, day, start_month, phone) values
  ('c0000000-0000-4000-8000-000000000009', 'in', 'Mensalidade', 45, 10, '2026-01', '5522977770000'),
  ('c0000000-0000-4000-8000-000000000009', 'out', 'Aluguel', 900, 5, '2026-01', null);
insert into public.transactions (user_id, type, amount, date, description, recurring_id)
  select user_id, 'out', 900, date '2026-02-05', 'Aluguel fev', id from public.recurring
  where user_id = 'c0000000-0000-4000-8000-000000000009' and name = 'Aluguel';
insert into public.goals (user_id, kind, name, amount, deadline) values ('c0000000-0000-4000-8000-000000000009', 'save', 'Reserva', 10000, '2027-12-31');
insert into public.ai_usage (user_id, day, count) values ('c0000000-0000-4000-8000-000000000009', date '2026-10-01', 7);

-- foto exata de tudo
create schema if not exists foto;
drop table if exists foto.linhas;
create table foto.linhas as
            select 'profiles' as tb, to_jsonb(x) as j from public.profiles x
  union all select 'categories', to_jsonb(x) from public.categories x
  union all select 'cards', to_jsonb(x) from public.cards x
  union all select 'transactions', to_jsonb(x) from public.transactions x
  union all select 'recurring', to_jsonb(x) from public.recurring x
  union all select 'goals', to_jsonb(x) from public.goals x
  union all select 'ai_usage', to_jsonb(x) from public.ai_usage x;
\o
\pset tuples_only on
\pset format unaligned
select '📸 foto dos dados: ' || count(*) || ' linhas' from foto.linhas;
