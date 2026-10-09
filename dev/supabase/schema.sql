-- =====================================================================
-- Meu Caixa 2.0 — banco de dados (Supabase / Postgres)
-- Base do banco. Na produção corresponde às migrações 20261008204728 (meu_caixa_v2_schema)
-- e 20261008204747 (meu_caixa_v2_hardening). As mudanças seguintes ficam em migrations/.
-- Idempotente: pode rodar quantas vezes quiser, nunca apaga dados.
-- Segurança: cada usuário só enxerga e altera o que é dele (RLS);
-- plano/validade só mudam pelo dono do sistema (SQL/painel), nunca pelo app.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- PERFIL / PLANO ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text check (name is null or char_length(name) <= 80),
  whatsapp    text check (whatsapp is null or whatsapp ~ '^[0-9]{10,13}$'),
  plan        text not null default 'trial' check (plan in ('trial','active','admin','master')),
  plan_expiry timestamptz not null default (now() + interval '15 days'),
  active      boolean not null default true,
  settings    jsonb not null default '{}'::jsonb
              check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 8192),
  created_at  timestamptz not null default now()
);

-- ---------- CATEGORIAS (fontes de renda, gastos, tipos de investimento) ----------
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('in','out','invest')),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  icon       text not null default 'i:tag' check (char_length(icon) between 1 and 40),
  color      text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  legacy_key text,
  archived   boolean not null default false,
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  constraint categories_legacy_unique unique (user_id, kind, legacy_key)
);
create index if not exists categories_user_idx on public.categories (user_id, kind);

-- ---------- CARTÕES ----------
create table if not exists public.cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  closing_day  int  not null default 9  check (closing_day between 1 and 31),
  due_day      int  not null default 16 check (due_day between 1 and 31),
  color        text not null default '#a78bfa' check (color ~ '^#[0-9a-fA-F]{6}$'),
  limit_amount numeric(14,2) check (limit_amount is null or limit_amount >= 0),
  archived     boolean not null default false,
  legacy_key   text,
  created_at   timestamptz not null default now(),
  constraint cards_legacy_unique unique (user_id, legacy_key)
);

-- ---------- LANÇAMENTOS ----------
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type         text not null check (type in ('in','out','card','invest')),
  amount       numeric(14,2) not null check (amount > 0 and amount < 1000000000),
  date         date not null check (date between '2000-01-01' and '2100-12-31'),
  description  text not null default '' check (char_length(description) <= 140),
  category_id  uuid references public.categories(id) on delete set null,
  card_id      uuid references public.cards(id) on delete set null,
  installments int  not null default 1 check (installments between 1 and 48),
  invest_kind  text check (invest_kind in ('aporte','resgate')),
  legacy_id    text,
  legacy_ts    bigint,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint tx_invest_kind   check ((type = 'invest') = (invest_kind is not null)),
  constraint tx_installments  check (type = 'card' or installments = 1),
  constraint tx_legacy_unique unique (user_id, legacy_ts)
);
create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);

-- ---------- USO DA IA (limite diário) ----------
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  count   int  not null default 0,
  primary key (user_id, day)
);

-- =====================================================================
-- FUNÇÕES
-- =====================================================================

-- Tem acesso de escrita? (plano válido ou admin/master)
create or replace function public.has_access() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and (p.plan in ('admin','master') or p.plan_expiry > now())
  );
$$;

-- Categorias padrão (genéricas; chaves compatíveis com o app antigo)
create or replace function public.seed_defaults(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.categories (user_id, kind, legacy_key, name, icon, color, sort) values
    (p_uid,'out','alimentacao','Alimentação','i:utensils','#f97316',1),
    (p_uid,'out','mercado','Mercado','i:shopping-cart','#22c55e',2),
    (p_uid,'out','transporte','Transporte','i:car','#3b82f6',3),
    (p_uid,'out','combustivel','Combustível','i:fuel','#eab308',4),
    (p_uid,'out','contas','Contas da casa','i:lightbulb','#f59e0b',5),
    (p_uid,'out','moradia','Moradia','i:house','#0ea5e9',6),
    (p_uid,'out','saude','Saúde','i:heart-pulse','#ef4444',7),
    (p_uid,'out','farmacia','Farmácia','i:pill','#14b8a6',8),
    (p_uid,'out','lazer','Lazer','i:gamepad-2','#a855f7',9),
    (p_uid,'out','assinaturas','Assinaturas','i:repeat','#6366f1',10),
    (p_uid,'out','educacao','Educação','i:graduation-cap','#84cc16',11),
    (p_uid,'out','roupas','Roupas','i:shirt','#ec4899',12),
    (p_uid,'out','pix','PIX enviado','i:arrow-up-right','#06b6d4',13),
    (p_uid,'out','fornecedores','Fornecedores','i:truck','#78716c',14),
    (p_uid,'out','impostos','Impostos e taxas','i:landmark','#64748b',15),
    (p_uid,'out','outros','Outros','i:tag','#94a3b8',99),
    (p_uid,'in','vendas','Vendas','i:shopping-bag','#22c55e',1),
    (p_uid,'in','servicos','Serviços','i:briefcase','#10b981',2),
    (p_uid,'in','salario','Salário','i:wallet','#14b8a6',3),
    (p_uid,'in','pix_recebido','PIX recebido','i:arrow-down-left','#06b6d4',4),
    (p_uid,'in','outros','Outros','i:banknote','#94a3b8',99),
    (p_uid,'invest','renda_fixa','Renda Fixa/CDB','i:landmark','#3b82f6',1),
    (p_uid,'invest','tesouro','Tesouro Direto','i:vault','#0ea5e9',2),
    (p_uid,'invest','acoes','Ações','i:chart-candlestick','#6366f1',3),
    (p_uid,'invest','fundos','Fundos','i:chart-pie','#8b5cf6',4),
    (p_uid,'invest','cripto','Criptomoedas','i:bitcoin','#f59e0b',5),
    (p_uid,'invest','previdencia','Previdência','i:umbrella','#14b8a6',6),
    (p_uid,'invest','poupanca','Poupança','i:piggy-bank','#ec4899',7),
    (p_uid,'invest','outros','Outros','i:trending-up','#94a3b8',99)
  on conflict (user_id, kind, legacy_key) do nothing;
end $$;
revoke all on function public.seed_defaults(uuid) from public, anon, authenticated;

-- Novo usuário: cria perfil (trial de 15 dias definido AQUI, no servidor) + categorias
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  perform public.seed_defaults(new.id);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lançamento: categoria/cartão precisam ser do próprio usuário e do tipo certo
create or replace function public.tx_validate() returns trigger
language plpgsql as $$
declare k text;
begin
  new.updated_at := now();
  if new.category_id is not null then
    select c.kind into k from public.categories c
      where c.id = new.category_id and c.user_id = new.user_id;
    if k is null then raise exception 'categoria inválida' using errcode = '23514'; end if;
    if (new.type = 'in' and k <> 'in')
       or (new.type in ('out','card') and k <> 'out')
       or (new.type = 'invest' and k <> 'invest') then
      raise exception 'categoria não combina com o tipo do lançamento' using errcode = '23514';
    end if;
  end if;
  if new.card_id is not null then
    if new.type <> 'card' then new.card_id := null;
    elsif not exists (select 1 from public.cards c where c.id = new.card_id and c.user_id = new.user_id) then
      raise exception 'cartão inválido' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tx_validate on public.transactions;
create trigger tx_validate before insert or update on public.transactions
  for each row execute function public.tx_validate();

-- IA: conta uso do dia e aplica o limite (o limite é decidido aqui, não no app)
create or replace function public.ai_consume() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d   date := (now() at time zone 'America/Sao_Paulo')::date;
  lim int;
  c   int;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  if not public.has_access() then return jsonb_build_object('ok', false, 'reason', 'plan'); end if;
  select case when p.plan in ('admin','master') then 500 else 40 end into lim
    from public.profiles p where p.id = uid;
  insert into public.ai_usage (user_id, day, count) values (uid, d, 1)
    on conflict (user_id, day) do update set count = public.ai_usage.count + 1
    returning count into c;
  if c > lim then return jsonb_build_object('ok', false, 'reason', 'limit', 'limit', lim); end if;
  return jsonb_build_object('ok', true, 'count', c, 'limit', lim);
end $$;
revoke all on function public.ai_consume() from public, anon;
grant execute on function public.ai_consume() to authenticated;

-- =====================================================================
-- SEGURANÇA (RLS)
-- =====================================================================
alter table public.profiles     enable row level security;
alter table public.categories   enable row level security;
alter table public.cards        enable row level security;
alter table public.transactions enable row level security;
alter table public.ai_usage     enable row level security;

-- Perfil: lê o próprio; altera só nome, WhatsApp e preferências
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name, whatsapp, settings) on public.profiles to authenticated;

-- Dados do usuário: lê sempre o que é seu (exportar mesmo com plano vencido);
-- grava só com plano válido.
do $$
declare t text;
begin
  foreach t in array array['categories','cards','transactions'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (user_id = auth.uid())', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (user_id = auth.uid() and public.has_access())', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (user_id = auth.uid() and public.has_access()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (user_id = auth.uid() and public.has_access())', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
  end loop;
end $$;

-- Uso da IA: ninguém acessa direto (só pela função ai_consume)
revoke all on public.ai_usage from anon, authenticated;

-- Usuários que já existiam antes deste script ganham perfil e categorias.
-- Só quem ainda não tinha perfil recebe as categorias padrão (rodar de novo não recria
-- categoria que o usuário apagou).
with novos as (
  insert into public.profiles (id, email)
    select u.id, u.email from auth.users u
    on conflict (id) do nothing
    returning id
)
select public.seed_defaults(id) from novos;

-- Endurecimento (Security Advisor do Supabase)
alter function public.tx_validate() set search_path = public;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.has_access() from public, anon;
grant execute on function public.has_access() to authenticated;
