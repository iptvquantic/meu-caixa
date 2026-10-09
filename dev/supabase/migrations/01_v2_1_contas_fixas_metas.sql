-- =====================================================================
-- Meu Caixa 2.1 — contas fixas (a pagar / a receber) e metas
-- Na produção: migração 20261008212825 (meu_caixa_v2_1_contas_fixas_metas).
-- Só ADICIONA tabelas/colunas. Não altera nem apaga dados existentes.
-- =====================================================================

-- ---------- CONTAS FIXAS ----------
create table if not exists public.recurring (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type        text not null check (type in ('in','out','card')),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  amount      numeric(14,2) not null check (amount > 0 and amount < 1000000000),
  day         int  not null check (day between 1 and 31),
  category_id uuid references public.categories(id) on delete set null,
  card_id     uuid references public.cards(id) on delete set null,
  start_month text not null check (start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  end_month   text check (end_month is null or end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  phone       text check (phone is null or phone ~ '^[0-9]{10,13}$'),
  auto        boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint recurring_period check (end_month is null or end_month >= start_month)
);
create index if not exists recurring_user_idx on public.recurring (user_id);

-- Lançamento gerado por uma conta fixa (1 por mês, no máximo)
alter table public.transactions add column if not exists recurring_id uuid references public.recurring(id) on delete set null;
alter table public.transactions add column if not exists recurring_month text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tx_recurring_month_fmt') then
    alter table public.transactions add constraint tx_recurring_month_fmt
      check (recurring_month is null or recurring_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  end if;
end $$;
create unique index if not exists tx_recurring_once on public.transactions (user_id, recurring_id, recurring_month)
  where recurring_id is not null;

-- ---------- METAS ----------
create table if not exists public.goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('budget','income','save')),
  name        text check (name is null or char_length(name) <= 60),
  amount      numeric(14,2) not null check (amount > 0 and amount < 1000000000),
  category_id uuid references public.categories(id) on delete cascade,
  deadline    date,
  start_date  date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint goals_budget_needs_cat check (kind <> 'budget' or category_id is not null)
);
create index if not exists goals_user_idx on public.goals (user_id);

-- ---------- VALIDAÇÕES (dono e tipo certo) ----------
create or replace function public.recurring_validate() returns trigger
language plpgsql set search_path = public as $$
declare k text;
begin
  if new.category_id is not null then
    select c.kind into k from public.categories c where c.id = new.category_id and c.user_id = new.user_id;
    if k is null then raise exception 'categoria inválida' using errcode = '23514'; end if;
    if (new.type = 'in' and k <> 'in') or (new.type in ('out','card') and k <> 'out') then
      raise exception 'categoria não combina com o tipo da conta fixa' using errcode = '23514';
    end if;
  end if;
  if new.type <> 'card' then new.card_id := null;
  elsif new.card_id is not null and not exists (select 1 from public.cards c where c.id = new.card_id and c.user_id = new.user_id) then
    raise exception 'cartão inválido' using errcode = '23514';
  end if;
  if new.type <> 'in' then new.phone := null; end if;
  return new;
end $$;
drop trigger if exists recurring_validate on public.recurring;
create trigger recurring_validate before insert or update on public.recurring
  for each row execute function public.recurring_validate();

create or replace function public.goals_validate() returns trigger
language plpgsql set search_path = public as $$
declare k text;
begin
  if new.category_id is not null then
    select c.kind into k from public.categories c where c.id = new.category_id and c.user_id = new.user_id;
    if k is null then raise exception 'categoria inválida' using errcode = '23514'; end if;
    if (new.kind = 'budget' and k <> 'out') or (new.kind = 'income' and k <> 'in') or (new.kind = 'save' and k <> 'invest') then
      raise exception 'categoria não combina com o tipo da meta' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists goals_validate on public.goals;
create trigger goals_validate before insert or update on public.goals
  for each row execute function public.goals_validate();

-- Lançamento: a conta fixa ligada também tem que ser do próprio usuário
create or replace function public.tx_validate() returns trigger
language plpgsql set search_path = public as $$
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
  if new.recurring_id is not null then
    if not exists (select 1 from public.recurring r where r.id = new.recurring_id and r.user_id = new.user_id) then
      raise exception 'conta fixa inválida' using errcode = '23514';
    end if;
    if new.recurring_month is null then new.recurring_month := to_char(new.date, 'YYYY-MM'); end if;
  else
    new.recurring_month := null;
  end if;
  return new;
end $$;

-- ---------- SEGURANÇA (RLS) ----------
alter table public.recurring enable row level security;
alter table public.goals     enable row level security;
do $$
declare t text;
begin
  foreach t in array array['recurring','goals'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (user_id = (select auth.uid()) and public.has_access())', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (user_id = (select auth.uid()) and public.has_access()) with check (user_id = (select auth.uid()))', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (user_id = (select auth.uid()) and public.has_access())', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
  end loop;
end $$;
revoke all on function public.recurring_validate() from public, anon, authenticated;
revoke all on function public.goals_validate() from public, anon, authenticated;
