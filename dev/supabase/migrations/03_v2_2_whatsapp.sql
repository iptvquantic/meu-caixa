-- =====================================================================
-- Meu Caixa 2.2 — robô do WhatsApp
-- Na produção como "meu_caixa_v2_2_whatsapp" (ver dev/README.md).
-- Só ADICIONA tabelas e funções. has_access() e ai_consume() continuam com a MESMA regra,
-- agora apoiadas em access_ok(uid) e ai_consume_for(uid), que o robô usa (ele não tem o
-- login do app; quem chama é a função "whatsapp" com a chave de serviço).
-- Guarda só o necessário: número conectado, código temporário e o id das mensagens
-- recebidas (para não lançar duas vezes). O texto das mensagens não é guardado.
-- Nenhuma função aqui apaga linha: código é substituído/vencido; "desfazer" e a limpeza
-- de ids antigos são feitos pela função "whatsapp", como o app faz nas exclusões dele.
-- Não altera nem apaga dados. Idempotente.
-- =====================================================================

-- ---------- regra única de acesso (app e robô) ----------
create or replace function public.access_ok(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_uid and p.active
      and (p.plan in ('admin','master') or p.plan_expiry > now())
  );
$$;

create or replace function public.has_access() returns boolean
language sql stable security definer set search_path = public as $$
  select public.access_ok(auth.uid());
$$;

-- IA: o limite diário decidido aqui, para o app e para o robô
create or replace function public.ai_consume_for(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d   date := (now() at time zone 'America/Sao_Paulo')::date;
  lim int;
  c   int;
begin
  if p_uid is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  if not public.access_ok(p_uid) then return jsonb_build_object('ok', false, 'reason', 'plan'); end if;
  select case when p.plan in ('admin','master') then 500 else 40 end into lim
    from public.profiles p where p.id = p_uid;
  insert into public.ai_usage (user_id, day, count) values (p_uid, d, 1)
    on conflict (user_id, day) do update set count = public.ai_usage.count + 1
    returning count into c;
  if c > lim then return jsonb_build_object('ok', false, 'reason', 'limit', 'limit', lim); end if;
  return jsonb_build_object('ok', true, 'count', c, 'limit', lim);
end $$;

create or replace function public.ai_consume() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return public.ai_consume_for(auth.uid());
end $$;

-- ---------- tabelas ----------
-- Número de WhatsApp conectado (1 conta = 1 número; 1 número = 1 conta)
create table if not exists public.wa_links (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  phone      text not null unique check (phone ~ '^[0-9]{10,15}$'),
  last_tx_id uuid references public.transactions(id) on delete set null,
  last_tx_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists wa_links_last_tx_idx on public.wa_links (last_tx_id);

-- Código para conectar (8 dígitos, vale 15 minutos, um por usuário: o novo substitui o anterior)
create table if not exists public.wa_codes (
  code       text primary key check (code ~ '^[0-9]{8}$'),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

-- Mensagens recebidas: só o id (a Meta pode reenviar a mesma) e o número, por 30 dias
create table if not exists public.wa_inbox (
  id          text primary key check (char_length(id) between 1 and 200),
  phone       text not null check (phone ~ '^[0-9]{6,20}$'),
  received_at timestamptz not null default now()
);
create index if not exists wa_inbox_phone_idx on public.wa_inbox (phone, received_at desc);

-- ---------- segurança (RLS) ----------
alter table public.wa_links enable row level security;
alter table public.wa_codes enable row level security;
alter table public.wa_inbox enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wa_links' and policyname = 'wa_links_select') then
    create policy wa_links_select on public.wa_links for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wa_links' and policyname = 'wa_links_delete') then
    create policy wa_links_delete on public.wa_links for delete to authenticated using (user_id = (select auth.uid()));
  end if;
end $$;
-- o app só vê e desconecta o próprio número; conectar é só pelo robô (com o código)
revoke all on public.wa_links, public.wa_codes, public.wa_inbox from anon, authenticated;
grant select, delete on public.wa_links to authenticated;

-- ---------- funções do app ----------
-- Gera o código para conectar o WhatsApp (substitui o anterior da mesma pessoa)
create or replace function public.wa_link_start() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text; exp timestamptz := now() + interval '15 minutes';
begin
  if uid is null then raise exception 'faça login' using errcode = '42501'; end if;
  loop
    c := lpad(((('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::bigint) % 100000000)::text, 8, '0');
    exit when not exists (select 1 from public.wa_codes where code = c);
  end loop;
  insert into public.wa_codes (code, user_id, expires_at) values (c, uid, exp)
    on conflict (user_id) do update set code = excluded.code, expires_at = excluded.expires_at;
  return jsonb_build_object('code', c, 'expires_at', exp);
end $$;

-- ---------- funções do robô (só a chave de serviço chama) ----------
-- Registra a mensagem recebida: new=false quando a Meta reenvia a mesma
create or replace function public.wa_seen(p_id text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n bigint; novo boolean;
begin
  insert into public.wa_inbox (id, phone) values (p_id, p_phone) on conflict (id) do nothing;
  get diagnostics n = row_count;
  novo := n > 0;
  select count(*) into n from public.wa_inbox where phone = p_phone and received_at > now() - interval '1 hour';
  return jsonb_build_object('new', novo, 'last_hour', n);
end $$;

-- Conecta o número ao dono do código (o código só aparece no app de quem está logado).
-- Número que já está em outra conta não é tomado: a outra conta precisa desconectar antes.
create or replace function public.wa_link_finish(p_code text, p_phone text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid; nm text;
begin
  if coalesce(p_phone, '') !~ '^[0-9]{10,15}$' then return jsonb_build_object('ok', false, 'reason', 'phone'); end if;
  if (select count(*) from public.wa_inbox where phone = p_phone and received_at > now() - interval '1 hour') > 10 then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;
  select user_id into uid from public.wa_codes where code = p_code and expires_at > now();
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'code'); end if;
  if exists (select 1 from public.wa_links where phone = p_phone and user_id <> uid) then
    return jsonb_build_object('ok', false, 'reason', 'in_use');
  end if;
  -- o código vale uma vez: vence agora
  update public.wa_codes set expires_at = now() - interval '1 second' where code = p_code and expires_at > now() returning user_id into uid;
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'code'); end if;
  insert into public.wa_links (user_id, phone) values (uid, p_phone)
    on conflict (user_id) do update set phone = excluded.phone, last_tx_id = null, last_tx_at = null, created_at = now();
  select coalesce(nullif(btrim(name), ''), split_part(email, '@', 1)) into nm from public.profiles where id = uid;
  return jsonb_build_object('ok', true, 'user_id', uid, 'name', nm);
end $$;

-- Quem é o dono deste número (null se não está conectado)
create or replace function public.wa_user(p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('user_id', p.id, 'name', coalesce(nullif(btrim(p.name), ''), split_part(p.email, '@', 1)),
           'access', public.access_ok(p.id), 'plan', p.plan, 'settings', p.settings)
  from public.wa_links l join public.profiles p on p.id = l.user_id
  where l.phone = p_phone;
$$;

-- Dados para responder (lançamentos de 24 meses + compras no cartão, que podem ter parcelas longas)
create or replace function public.wa_data(p_uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id' order by t.date desc) from public.transactions t
                               where t.user_id = p_uid
                                 and (t.type = 'card' or t.date >= (date_trunc('month', now()) - interval '24 months')::date)), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' order by c.kind, c.sort, c.name) from public.categories c where c.user_id = p_uid), '[]'::jsonb),
    'cards', coalesce((select jsonb_agg(to_jsonb(k) - 'user_id' order by k.created_at) from public.cards k where k.user_id = p_uid), '[]'::jsonb),
    'recurring', coalesce((select jsonb_agg(to_jsonb(r) - 'user_id' order by r.day) from public.recurring r where r.user_id = p_uid), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by g.created_at) from public.goals g where g.user_id = p_uid), '[]'::jsonb)
  );
$$;

-- Grava um lançamento vindo do WhatsApp (só com plano válido; dono/tipo conferidos pelo tx_validate)
create or replace function public.wa_add_tx(p_uid uuid, p_tx jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.transactions;
begin
  if not public.access_ok(p_uid) then return jsonb_build_object('ok', false, 'reason', 'plan'); end if;
  insert into public.transactions (user_id, type, amount, date, description, category_id, card_id, installments, invest_kind, recurring_id, recurring_month)
  values (p_uid, p_tx->>'type', (p_tx->>'amount')::numeric, (p_tx->>'date')::date, left(coalesce(p_tx->>'description', ''), 140),
          nullif(p_tx->>'category_id', '')::uuid, nullif(p_tx->>'card_id', '')::uuid,
          coalesce((p_tx->>'installments')::int, 1), nullif(p_tx->>'invest_kind', ''),
          nullif(p_tx->>'recurring_id', '')::uuid, nullif(p_tx->>'recurring_month', ''))
  returning * into r;
  update public.wa_links set last_tx_id = r.id, last_tx_at = now() where user_id = p_uid;
  return jsonb_build_object('ok', true, 'tx', to_jsonb(r) - 'user_id');
end $$;

-- Qual lançamento o "desfazer" apaga: o último feito pelo WhatsApp, até 30 minutos depois.
-- Quem apaga é a função "whatsapp" (id + dono); ao apagar, last_tx_id vira nulo sozinho.
create or replace function public.wa_undo_target(p_uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when not public.access_ok(p_uid) then jsonb_build_object('ok', false, 'reason', 'plan')
    else coalesce((
      select jsonb_build_object('ok', true, 'tx', to_jsonb(t) - 'user_id')
      from public.wa_links l join public.transactions t on t.id = l.last_tx_id and t.user_id = l.user_id
      where l.user_id = p_uid and l.last_tx_at > now() - interval '30 minutes'
    ), jsonb_build_object('ok', false, 'reason', 'nada'))
  end;
$$;

-- ---------- permissões das funções ----------
revoke all on function public.wa_link_start() from public, anon;
grant execute on function public.wa_link_start() to authenticated;
do $$
declare f text;
begin
  foreach f in array array['access_ok(uuid)', 'ai_consume_for(uuid)', 'wa_seen(text, text)', 'wa_link_finish(text, text)',
                           'wa_user(text)', 'wa_data(uuid)', 'wa_add_tx(uuid, jsonb)', 'wa_undo_target(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
