-- Teste de segurança do robô do WhatsApp (migração 03). Roda numa transação e desfaz tudo no fim.
-- Pessoas: A = Ana (teste grátis), B = Bia (outra cliente), E = Edu (plano vencido). "serviço" = a função "whatsapp".
\set ON_ERROR_STOP 1
select to_regclass('public.wa_links') is not null as tem_robo \gset
\if :tem_robo
\ir _inicio.sql

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'ana@teste.local'),
  ('b0000000-0000-4000-8000-000000000002', 'bia@teste.local'),
  ('e0000000-0000-4000-8000-000000000003', 'edu@teste.local');
update public.profiles set name = 'Ana' where id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set plan_expiry = now() - interval '1 day' where id = 'e0000000-0000-4000-8000-000000000003';
select t.keep('a_farm', id::text) from public.categories where user_id = 'a0000000-0000-4000-8000-000000000001' and kind = 'out' and legacy_key = 'farmacia';
select t.keep('b_merc', id::text) from public.categories where user_id = 'b0000000-0000-4000-8000-000000000002' and kind = 'out' and legacy_key = 'mercado';

-- ---------- quem pode chamar o quê ----------
select t.ok(not exists (
  select 1 from unnest(array['access_ok(uuid)', 'ai_consume_for(uuid)', 'wa_seen(text,text)', 'wa_link_finish(text,text)',
                             'wa_user(text)', 'wa_data(uuid)', 'wa_add_tx(uuid,jsonb)', 'wa_undo_target(uuid)']) f, unnest(array['anon', 'authenticated']) r
  where has_function_privilege(r, 'public.' || f, 'execute')), 'funções do robô: app e visitante não chamam');
select t.ok((select bool_and(has_function_privilege('service_role', 'public.' || f, 'execute')) from unnest(array['access_ok(uuid)', 'ai_consume_for(uuid)',
  'wa_seen(text,text)', 'wa_link_finish(text,text)', 'wa_user(text)', 'wa_data(uuid)', 'wa_add_tx(uuid,jsonb)', 'wa_undo_target(uuid)']) f),
  'funções do robô: a função "whatsapp" (chave de serviço) chama');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and (p.proname like 'wa\_%' or p.proname in ('access_ok', 'ai_consume_for')) and p.prosrc ~* '\mdelete\s+from\M'),
  'funções do robô no banco não apagam linhas (quem apaga é a função "whatsapp", com id e dono)');
select t.ok(has_function_privilege('authenticated', 'public.wa_link_start()', 'execute') and not has_function_privilege('anon', 'public.wa_link_start()', 'execute'),
  'gerar código: só usuário logado');
select t.ok(not has_table_privilege('authenticated', 'public.wa_codes', 'select') and not has_table_privilege('authenticated', 'public.wa_inbox', 'select')
  and not has_table_privilege('authenticated', 'public.wa_links', 'insert') and not has_table_privilege('authenticated', 'public.wa_links', 'update'),
  'app não lê códigos nem mensagens e não conecta número sozinho');

-- ---------- Ana gera o código no app ----------
select t.login('a0000000-0000-4000-8000-000000000001');
set role authenticated;
select t.keep('code1', public.wa_link_start() ->> 'code');
select t.keep('code', public.wa_link_start() ->> 'code');
select t.ok(t.id('code') ~ '^[0-9]{8}$', 'código com 8 dígitos');
select t.blocked($$select * from wa_codes$$, 'Ana não lê a tabela de códigos');
select t.blocked($$insert into wa_links (user_id, phone) values (auth.uid(), '5522991110001')$$, 'Ana não conecta número sem o código');
reset role;
select t.ok((select count(*) from public.wa_codes where user_id = 'a0000000-0000-4000-8000-000000000001') = 1, 'um código por pessoa (o novo substitui o anterior)');

-- ---------- o robô recebe a mensagem com o código ----------
set role service_role;
select t.ok((public.wa_seen('wamid.1', '5522991110001') ->> 'new')::boolean, 'mensagem nova é processada');
select t.ok(not (public.wa_seen('wamid.1', '5522991110001') ->> 'new')::boolean, 'mensagem repetida pela Meta é ignorada');
select t.ok((public.wa_link_finish('00000000', '5522991110001') ->> 'reason') = 'code', 'código errado não conecta');
select t.ok((public.wa_link_finish(t.id('code1'), '5522991110001') ->> 'reason') = 'code', 'código antigo (substituído) não conecta');
select t.ok((public.wa_link_finish(t.id('code'), '12') ->> 'reason') = 'phone', 'número inválido não conecta');
select t.ok((public.wa_link_finish(t.id('code'), '5522991110001') ->> 'name') = 'Ana', 'código certo conecta o WhatsApp da Ana');
select t.ok((public.wa_link_finish(t.id('code'), '5511999990009') ->> 'reason') = 'code', 'código só vale uma vez');
select t.ok((public.wa_user('5522991110001') ->> 'user_id') = 'a0000000-0000-4000-8000-000000000001' and (public.wa_user('5522991110001') ->> 'access')::boolean,
  'robô reconhece o número da Ana');
select t.ok(public.wa_user('5511999990009') is null, 'número desconhecido não é de ninguém');
reset role;

-- ---------- código vencido e tentativa em massa ----------
select t.login('b0000000-0000-4000-8000-000000000002');
set role authenticated;
select t.keep('codeB', public.wa_link_start() ->> 'code');
reset role;
update public.wa_codes set expires_at = now() - interval '1 minute' where user_id = 'b0000000-0000-4000-8000-000000000002';
set role service_role;
select t.ok((public.wa_link_finish(t.id('codeB'), '5522991110002') ->> 'reason') = 'code', 'código vencido (15 min) não conecta');
reset role;
insert into public.wa_inbox (id, phone) select 'flood.' || g, '5511999990009' from generate_series(1, 11) g;
select t.login('b0000000-0000-4000-8000-000000000002');
set role authenticated;
select t.keep('codeB', public.wa_link_start() ->> 'code');
reset role;
set role service_role;
select t.ok((public.wa_link_finish(t.id('codeB'), '5511999990009') ->> 'reason') = 'rate', 'número que manda mensagens demais é barrado (chute de código)');
select t.ok((public.wa_link_finish(t.id('codeB'), '5522991110002') ->> 'ok')::boolean, 'Bia conecta o número dela');
reset role;

-- ---------- cada um vê e desconecta só o seu ----------
select t.login('a0000000-0000-4000-8000-000000000001');
set role authenticated;
select t.ok((select count(*) from wa_links) = 1 and (select phone from wa_links) = '5522991110001', 'Ana vê só o número dela');
select t.blocked($$delete from wa_links where user_id = 'b0000000-0000-4000-8000-000000000002'$$, 'Ana não desconecta o número da Bia');
select t.blocked($$update wa_links set phone = '5511999990009'$$, 'Ana não troca o número sem o código');
reset role;

-- ---------- lançar e desfazer pelo robô ----------
set role service_role;
select t.ok((public.wa_add_tx('a0000000-0000-4000-8000-000000000001', jsonb_build_object('type', 'out', 'amount', 52.9, 'date', current_date,
  'description', 'Drogasil', 'category_id', t.id('a_farm'))) ->> 'ok')::boolean, 'robô lança a saída da Ana');
reset role;
select t.ok((select count(*) from public.transactions where user_id = 'a0000000-0000-4000-8000-000000000001' and description = 'Drogasil' and amount = 52.90) = 1,
  'lançamento gravado na conta da Ana');
select t.ok((select last_tx_id is not null from public.wa_links where user_id = 'a0000000-0000-4000-8000-000000000001'), 'robô lembra o último lançamento (para desfazer)');
set role service_role;
select t.blocked(format($$select public.wa_add_tx('a0000000-0000-4000-8000-000000000001', jsonb_build_object('type', 'out', 'amount', 10, 'date', current_date, 'category_id', %L))$$, t.id('b_merc')),
  'robô não usa categoria da Bia na conta da Ana');
select t.blocked($$select public.wa_add_tx('a0000000-0000-4000-8000-000000000001', jsonb_build_object('type', 'out', 'amount', 0, 'date', current_date))$$, 'valor zero é recusado');
select t.blocked($$select public.wa_add_tx('a0000000-0000-4000-8000-000000000001', jsonb_build_object('type', 'out', 'amount', 5, 'date', current_date, 'installments', 3))$$,
  'parcelas só no cartão');
select t.ok((public.wa_add_tx('e0000000-0000-4000-8000-000000000003', jsonb_build_object('type', 'in', 'amount', 10, 'date', current_date)) ->> 'reason') = 'plan',
  'plano vencido: robô não grava');
select t.ok((public.wa_data('a0000000-0000-4000-8000-000000000001') -> 'transactions' -> 0 ->> 'description') = 'Drogasil'
  and jsonb_array_length(public.wa_data('a0000000-0000-4000-8000-000000000001') -> 'categories') = 29
  and not (public.wa_data('a0000000-0000-4000-8000-000000000001')::text like '%b0000000-0000-4000-8000-000000000002%'),
  'dados para responder: só da Ana');
select t.keep('undo1', public.wa_undo_target('a0000000-0000-4000-8000-000000000001') -> 'tx' ->> 'id');
select t.ok(t.id('undo1') = (select id::text from public.transactions where user_id = 'a0000000-0000-4000-8000-000000000001' and description = 'Drogasil'),
  'desfazer aponta o último lançamento do robô');
-- a função "whatsapp" apaga com a chave de serviço, pelo id e pelo dono
delete from public.transactions where id = t.id('undo1')::uuid and user_id = 'a0000000-0000-4000-8000-000000000001';
select t.ok((public.wa_undo_target('a0000000-0000-4000-8000-000000000001') ->> 'reason') = 'nada', 'depois de apagado não há mais o que desfazer (last_tx_id vira nulo)');
select t.ok((public.wa_undo_target('e0000000-0000-4000-8000-000000000003') ->> 'reason') = 'plan', 'plano vencido: desfazer bloqueado');
select t.ok((public.wa_add_tx('a0000000-0000-4000-8000-000000000001', jsonb_build_object('type', 'in', 'amount', 300, 'date', current_date, 'description', 'Pix')) ->> 'ok')::boolean,
  'robô lança entrada');
reset role;
update public.wa_links set last_tx_at = now() - interval '31 minutes' where user_id = 'a0000000-0000-4000-8000-000000000001';
set role service_role;
select t.ok((public.wa_undo_target('a0000000-0000-4000-8000-000000000001') ->> 'reason') = 'nada', 'desfazer só até 30 minutos depois');
select t.keep('bia_tx', public.wa_add_tx('b0000000-0000-4000-8000-000000000002', jsonb_build_object('type', 'out', 'amount', 7, 'date', current_date)) -> 'tx' ->> 'id');
reset role;
update public.wa_links set last_tx_id = t.id('bia_tx')::uuid, last_tx_at = now() where user_id = 'a0000000-0000-4000-8000-000000000001';
set role service_role;
select t.ok((public.wa_undo_target('a0000000-0000-4000-8000-000000000001') ->> 'reason') = 'nada', 'desfazer nunca aponta lançamento de outra pessoa');
reset role;
select t.ok((select count(*) from public.transactions where user_id = 'a0000000-0000-4000-8000-000000000001' and description = 'Pix') = 1, 'lançamento antigo continua');

-- ---------- pagar conta fixa pelo robô ----------
insert into public.recurring (user_id, type, name, amount, day, start_month) values
  ('a0000000-0000-4000-8000-000000000001', 'out', 'Aluguel', 900, 5, to_char(current_date, 'YYYY-MM')),
  ('b0000000-0000-4000-8000-000000000002', 'out', 'Aluguel da Bia', 800, 5, to_char(current_date, 'YYYY-MM'));
select t.keep('a_rec', id::text) from public.recurring where user_id = 'a0000000-0000-4000-8000-000000000001';
select t.keep('b_rec', id::text) from public.recurring where user_id = 'b0000000-0000-4000-8000-000000000002';
set role service_role;
select t.ok((public.wa_add_tx('a0000000-0000-4000-8000-000000000001', jsonb_build_object('type', 'out', 'amount', 900, 'date', current_date,
  'description', 'Aluguel', 'recurring_id', t.id('a_rec'))) -> 'tx' ->> 'recurring_month') = to_char(current_date, 'YYYY-MM'), 'robô marca a conta fixa como paga no mês');
select t.blocked(format($$select public.wa_add_tx('a0000000-0000-4000-8000-000000000001', jsonb_build_object('type', 'out', 'amount', 900, 'date', current_date, 'recurring_id', %L))$$, t.id('a_rec')),
  'a mesma conta fixa não é paga 2x no mês pelo robô');
select t.blocked(format($$select public.wa_add_tx('a0000000-0000-4000-8000-000000000001', jsonb_build_object('type', 'out', 'amount', 800, 'date', current_date, 'recurring_id', %L))$$, t.id('b_rec')),
  'robô não paga conta fixa da Bia na conta da Ana');
reset role;

-- ---------- IA pelo robô usa o mesmo limite do app ----------
set role service_role;
select t.ok((public.ai_consume_for('a0000000-0000-4000-8000-000000000001') ->> 'limit') = '40', 'IA pelo robô: mesmo limite diário do app');
select t.ok((public.ai_consume_for('e0000000-0000-4000-8000-000000000003') ->> 'reason') = 'plan', 'IA pelo robô: plano vencido bloqueado');
reset role;
select t.login('a0000000-0000-4000-8000-000000000001');
set role authenticated;
select t.ok((public.ai_consume() ->> 'count') = '2', 'app e robô somam no mesmo contador');
reset role;

-- ---------- número de outra conta não é tomado; trocar de número; desconectar ----------
select t.login('a0000000-0000-4000-8000-000000000001');
set role authenticated;
select t.keep('codeA2', public.wa_link_start() ->> 'code');
reset role;
set role service_role;
select t.ok((public.wa_link_finish(t.id('codeA2'), '5522991110002') ->> 'reason') = 'in_use', 'número conectado na conta da Bia não é tomado pela Ana');
select t.ok((public.wa_user('5522991110002') ->> 'user_id') = 'b0000000-0000-4000-8000-000000000002'
  and (public.wa_user('5522991110001') ->> 'user_id') = 'a0000000-0000-4000-8000-000000000001', 'cada número continua na sua conta');
select t.ok((public.wa_link_finish(t.id('codeA2'), '5522991110003') ->> 'ok')::boolean, 'Ana troca para outro número dela com o código');
select t.ok((public.wa_user('5522991110003') ->> 'user_id') = 'a0000000-0000-4000-8000-000000000001' and public.wa_user('5522991110001') is null,
  'a Ana fica com um número só (o novo)');
reset role;
select t.login('b0000000-0000-4000-8000-000000000002');
set role authenticated;
select t.allowed($$delete from wa_links where user_id = auth.uid()$$, 'Bia desconecta o WhatsApp pelo app');
select t.keep('codeB2', public.wa_link_start() ->> 'code');
reset role;
set role service_role;
select t.ok(public.wa_user('5522991110002') is null, 'depois de desconectar o robô não reconhece mais');
select t.ok((public.wa_link_finish(t.id('codeB2'), '5522991110002') ->> 'ok')::boolean, 'depois de desconectar, o número pode ser conectado de novo');
select t.ok((select count(*) from public.wa_codes where expires_at > now()) = 0, 'nenhum código usado continua valendo');
reset role;

\set teste 'robô do WhatsApp'
\ir _fim.sql
\else
\echo 'ℹ️ robô do WhatsApp: tabelas ainda não existem (migração 03 não aplicada neste passo)'
\endif
