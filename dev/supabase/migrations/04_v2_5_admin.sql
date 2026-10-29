-- =====================================================================
-- Meu Caixa 2.5 — painel de clientes (só master/admin)
-- Idempotente: pode rodar quantas vezes quiser, nunca apaga dados.
-- Plano e validade continuam mudando só no servidor: agora também por estas funções, que conferem
-- se quem chama é master/admin. Cada mudança fica registrada em admin_log (quem, em quem, o quê,
-- como estava e como ficou). Nenhuma função apaga linha.
-- =====================================================================

-- ---------- registro do painel ----------
create table if not exists public.admin_log (
  id            bigint generated always as identity primary key,
  admin_id      uuid references auth.users(id) on delete set null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  action        text not null check (action in ('mensal','trimestral','anual','mais7','bloquear','desbloquear','desfazer')),
  plan_before   text,
  expiry_before timestamptz,
  active_before boolean,
  plan_after    text,
  expiry_after  timestamptz,
  active_after  boolean,
  created_at    timestamptz not null default now()
);
create index if not exists admin_log_user_idx  on public.admin_log (user_id, created_at desc);
create index if not exists admin_log_admin_idx on public.admin_log (admin_id);
alter table public.admin_log enable row level security;
-- ninguém lê ou escreve direto: só as funções abaixo (e o SQL do dono)
revoke all on public.admin_log from anon, authenticated;

-- ---------- quem chama é master/admin (conta ativa)? ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.plan in ('admin','master'));
$$;
-- uso interno das funções do painel: o app não chama
revoke all on function public.is_admin() from public, anon, authenticated;

-- ---------- lista de clientes ----------
-- Só dados de conta (nome, e-mail, WhatsApp, plano, validade) e de uso (quantos lançamentos, o último, o último
-- login). Valores e descrições dos lançamentos ficam fora: o dono não vê o caixa dos clientes.
create or replace function public.admin_users()
returns table (id uuid, email text, name text, whatsapp text, plan text, plan_expiry timestamptz, active boolean,
               created_at timestamptz, tx_count bigint, last_tx date, last_seen timestamptz,
               last_action text, last_action_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Só o dono do sistema vê os clientes.' using errcode = '42501';
  end if;
  return query
    select p.id, p.email, p.name, p.whatsapp, p.plan, p.plan_expiry, p.active, p.created_at,
           coalesce(t.n, 0)::bigint, t.last_date, u.last_sign_in_at, l.action, l.created_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join lateral (select count(*) as n, max(x.date) as last_date from public.transactions x where x.user_id = p.id) t on true
    left join lateral (select a.action, a.created_at from public.admin_log a where a.user_id = p.id order by a.created_at desc, a.id desc limit 1) l on true
    order by p.created_at desc
    limit 2000;
end $$;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

-- ---------- liberar plano, dar mais dias, bloquear, desfazer ----------
-- mensal/trimestral/anual: plano ativo e acesso liberado, somando a partir da validade atual (ou de hoje, se já
-- venceu). mais7: +7 dias sem mudar o plano. bloquear/desbloquear: só leitura / volta ao normal.
-- desfazer: volta plano, validade e bloqueio a como estavam antes do último ajuste (feito nas últimas 24 h).
-- Conta master/admin não muda por aqui.
create or replace function public.admin_set_plan(p_user uuid, p_action text)
returns table (id uuid, plan text, plan_expiry timestamptz, active boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  cur   public.profiles%rowtype;
  prev  public.admin_log%rowtype;
  base  timestamptz;
  extra interval;
begin
  if not public.is_admin() then
    raise exception 'Só o dono do sistema muda planos.' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('mensal','trimestral','anual','mais7','bloquear','desbloquear','desfazer') then
    raise exception 'Ação inválida.' using errcode = '22023';
  end if;
  select * into cur from public.profiles p where p.id = p_user for update;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if cur.plan in ('admin','master') then
    raise exception 'Conta de administrador: o plano não muda pelo painel.' using errcode = '42501';
  end if;

  if p_action = 'desfazer' then
    select * into prev from public.admin_log a where a.user_id = p_user and a.action <> 'desfazer'
      order by a.created_at desc, a.id desc limit 1;
    if not found or prev.created_at < now() - interval '1 day' then
      raise exception 'Nada recente para desfazer.' using errcode = 'P0002';
    end if;
    update public.profiles p set plan = prev.plan_before, plan_expiry = prev.expiry_before, active = prev.active_before
    where p.id = p_user;
  else
    base := greatest(now(), cur.plan_expiry);
    extra := case p_action when 'mensal' then interval '1 month' when 'trimestral' then interval '3 months'
                          when 'anual' then interval '1 year' when 'mais7' then interval '7 days' end;
    update public.profiles p set
      plan        = case when p_action in ('mensal','trimestral','anual') then 'active' else p.plan end,
      plan_expiry = case when extra is not null then base + extra else p.plan_expiry end,
      active      = case when p_action = 'bloquear' then false
                         when p_action in ('desbloquear','mensal','trimestral','anual') then true
                         else p.active end
    where p.id = p_user;
  end if;

  insert into public.admin_log (admin_id, user_id, action, plan_before, expiry_before, active_before, plan_after, expiry_after, active_after)
    select auth.uid(), p.id, p_action, cur.plan, cur.plan_expiry, cur.active, p.plan, p.plan_expiry, p.active
    from public.profiles p where p.id = p_user;

  return query select p.id, p.plan, p.plan_expiry, p.active from public.profiles p where p.id = p_user;
end $$;
revoke all on function public.admin_set_plan(uuid, text) from public, anon;
grant execute on function public.admin_set_plan(uuid, text) to authenticated;
