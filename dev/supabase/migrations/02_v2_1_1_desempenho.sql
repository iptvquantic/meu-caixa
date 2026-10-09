-- =====================================================================
-- Meu Caixa 2.1.1 — desempenho e endurecimento (Supabase Performance/Security Advisor)
-- Na produção: migração 20261009112340 (meu_caixa_v2_1_1_desempenho), aplicada em 09/10/2026.
-- 1) Índices nas chaves estrangeiras: apagar categoria/cartão/conta fixa sem varrer a tabela.
-- 2) Regras de acesso (RLS) com a MESMA lógica, mas auth.uid() e has_access() calculados
--    1x por consulta (não 1x por linha). Usa ALTER POLICY: troca a expressão no lugar,
--    sem remover a regra em nenhum momento.
-- 3) Usuário logado/visitante sem TRUNCATE/REFERENCES/TRIGGER nas tabelas (o app só usa
--    ler/criar/alterar/apagar; TRUNCATE ignoraria as regras de acesso).
-- Não altera nem apaga dados. Idempotente.
-- =====================================================================

-- 1) Índices nas chaves estrangeiras
create index if not exists transactions_category_idx  on public.transactions (category_id);
create index if not exists transactions_card_idx      on public.transactions (card_id);
create index if not exists transactions_recurring_idx on public.transactions (recurring_id);
create index if not exists recurring_category_idx     on public.recurring (category_id);
create index if not exists recurring_card_idx         on public.recurring (card_id);
create index if not exists goals_category_idx         on public.goals (category_id);

-- 2) Regras de acesso — mesma lógica, avaliação mais barata
alter policy profiles_select on public.profiles
  using (id = (select auth.uid()));
alter policy profiles_update on public.profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['categories','cards','transactions','recurring','goals'] loop
    execute format('alter policy %1$s_select on public.%1$s using (user_id = (select auth.uid()))', t);
    execute format('alter policy %1$s_insert on public.%1$s with check (user_id = (select auth.uid()) and (select public.has_access()))', t);
    execute format('alter policy %1$s_update on public.%1$s using (user_id = (select auth.uid()) and (select public.has_access())) with check (user_id = (select auth.uid()))', t);
    execute format('alter policy %1$s_delete on public.%1$s using (user_id = (select auth.uid()) and (select public.has_access()))', t);
  end loop;
end $$;

-- 3) Só os privilégios que o app usa
revoke truncate, references, trigger on public.profiles, public.categories, public.cards,
  public.transactions, public.ai_usage, public.recurring, public.goals from anon, authenticated;
do $$ begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on public.profiles, public.categories, public.cards, public.transactions, public.ai_usage, public.recurring, public.goals from anon, authenticated';
  end if;
end $$;
