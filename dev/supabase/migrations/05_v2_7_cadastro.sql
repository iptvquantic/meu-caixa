-- Meu Caixa 2.7 — cadastro sem depender de e-mail (pela função "conta").
-- O e-mail padrão do Supabase só entrega para a equipe do projeto: enquanto não houver um servidor de e-mail próprio,
-- a função cria a conta do cliente já confirmada. Para ninguém criar contas em massa, cada tentativa passa por aqui:
-- até 5 por endereço (o IP vira um código embaralhado com o segredo da função; o IP mesmo nunca é guardado) e até 60
-- no total por hora. Só a função (chave de serviço) usa; usuário logado ou visitante não lê nem chama nada disto.
-- Idempotente: pode rodar de novo sem mudar nada. Só acrescenta (não altera nem apaga dado).

create table if not exists public.signup_log (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
alter table public.signup_log enable row level security;
revoke all on table public.signup_log from public, anon, authenticated;
create index if not exists signup_log_ip_idx on public.signup_log (ip_hash, created_at desc);
create index if not exists signup_log_at_idx on public.signup_log (created_at desc);

-- true = pode criar (e anota a tentativa); false = passou do limite ou pedido inválido
create or replace function public.signup_attempt(p_ip_hash text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  n_ip  int;
  n_all int;
begin
  if p_ip_hash is null or length(p_ip_hash) < 32 or length(p_ip_hash) > 128 then return false; end if;
  select count(*) into n_ip from public.signup_log
    where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  select count(*) into n_all from public.signup_log
    where created_at > now() - interval '1 hour';
  if n_ip >= 5 or n_all >= 60 then return false; end if;
  insert into public.signup_log (ip_hash) values (p_ip_hash);
  return true;
end $$;
revoke all on function public.signup_attempt(text) from public, anon, authenticated;
grant execute on function public.signup_attempt(text) to service_role;
