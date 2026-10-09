// Meu Caixa — Conselheiro IA (Supabase Edge Function)
// Segurança: só responde a usuário logado; limite diário decidido no banco (ai_consume);
// a chave da Groq vive só aqui como secret (GROQ_API_KEY). O app nunca vê a chave.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { addMonths, buildContext, currentMonthSP, type Card, type Cat, type Goal, type Rec, type TxR } from './context.ts';

const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://iptvquantic.github.io').split(',').map((s) => s.trim());
const MODELS = [Deno.env.get('AI_MODEL') ?? 'openai/gpt-oss-120b', Deno.env.get('AI_MODEL_FALLBACK') ?? 'llama-3.3-70b-versatile'];

const SYSTEM = `Você é o Conselheiro do Meu Caixa, um planejador financeiro experiente que fala como um mentor de confiança: direto, caloroso e prático.
Você conversa com autônomos e pequenos negócios no Brasil e recebe, abaixo, os NÚMEROS REAIS do usuário.

Regras:
- Use sempre os números do contexto (valores em R$, percentuais, meses). Nunca invente dados; se faltar informação, diga o que falta.
- Pergunta simples = resposta curta (2 a 4 frases). Pedido de análise ou plano = até ~250 palavras, com passos numerados e valores.
- Raciocine assim antes de responder: diagnóstico → o que mais pesa → o que resolver primeiro → 2 a 4 ações com números.
- Cartão: "fatura do mês" é o que vence naquele mês (parcelas incluídas).
- Cartão de crédito no Brasil: NUNCA recomende pagar só o mínimo da fatura nem entrar no rotativo (é o crédito mais caro do país, juros altíssimos). Priorize pagar a fatura inteira; se não der, explique que parcelar a fatura é caro mas costuma sair mais barato que o rotativo, e mostre o corte de gastos necessário.
- Não sugira pegar empréstimo novo para cobrir consumo.
- Fontes de renda e categorias do usuário são dados neutros: não julgue a origem do dinheiro.
- Escreva valores no padrão brasileiro: R$ 1.171,00.
- Contas fixas e metas do contexto: cite as atrasadas e as metas perto do limite quando forem relevantes para a pergunta.
- Investimentos: comente a alocação que o usuário já registrou; não indique produto específico nem prometa rentabilidade.
- Não é consultoria financeira, jurídica ou tributária licenciada; em decisões grandes, recomende um profissional.
- Português do Brasil, tom de conversa entre adultos. Emojis só quando ajudam (no máximo 2).`;

async function callGroq(messages: { role: string; content: string }[]) {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) throw new Error('GROQ_API_KEY não configurada no Supabase (Edge Functions > Secrets)');
  let last = '';
  for (const model of MODELS) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: 0.5, max_tokens: 1400 })
    });
    if (r.ok) { const j = await r.json(); const t = j?.choices?.[0]?.message?.content?.trim(); if (t) return t; last = 'resposta vazia'; continue; }
    last = `Groq ${r.status}`;
    if (r.status === 401 || r.status === 403) break;
  }
  throw new Error('IA indisponível (' + last + ')');
}

function corsHeaders(origin: string) {
  const ok = ALLOWED.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return { 'Access-Control-Allow-Origin': ok ? origin : ALLOWED[0], 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}

Deno.serve(async (req) => {
  const H = { ...corsHeaders(req.headers.get('origin') ?? ''), 'Content-Type': 'application/json' };
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: H });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: H });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  try {
    const auth = req.headers.get('authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Faça login' }, 401);
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: u, error: ue } = await sb.auth.getUser(auth.slice(7));
    if (ue || !u?.user) return json({ error: 'Sessão inválida, entre de novo' }, 401);
    const { data: quota, error: qe } = await sb.rpc('ai_consume');
    if (qe) throw qe;
    if (!quota?.ok) return json({ error: quota?.reason === 'limit' ? 'Limite diário da IA atingido' : 'Plano vencido', reason: quota?.reason }, quota?.reason === 'limit' ? 429 : 402);
    const body = await req.json().catch(() => ({}));
    const month = /^\d{4}-\d{2}$/.test(body?.month) ? body.month : currentMonthSP();
    const msgs = (Array.isArray(body?.messages) ? body.messages : [])
      .filter((m: { role?: string; content?: unknown }) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
      .slice(-12).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json({ error: 'Mensagem vazia' }, 400);
    const since = addMonths(month, -24) + '-01';
    const [tx, ca, cd, pr, rc, gl] = await Promise.all([
      sb.from('transactions').select('type,amount,date,description,category_id,card_id,installments,invest_kind,recurring_id,recurring_month').gte('date', since).order('date', { ascending: false }).limit(5000),
      sb.from('categories').select('id,name,kind'),
      sb.from('cards').select('id,name,closing_day,due_day,archived'),
      sb.from('profiles').select('name,settings').maybeSingle(),
      sb.from('recurring').select('id,type,name,amount,day,start_month,end_month,active'),
      sb.from('goals').select('kind,name,amount,category_id,deadline,start_date,archived')
    ]);
    for (const r of [tx, ca, cd, pr, rc, gl]) if (r.error) throw r.error;
    const feats = pr.data?.settings?.features ?? {};
    const context = buildContext((tx.data ?? []) as TxR[], (ca.data ?? []) as Cat[], (cd.data ?? []) as Card[], month, pr.data?.settings?.cardMode ?? 'invoice', pr.data?.name ?? '', feats.bills === false ? [] : (rc.data ?? []) as Rec[], feats.goals === false ? [] : (gl.data ?? []) as Goal[]);
    const reply = await callGroq([{ role: 'system', content: SYSTEM + '\n\n' + context }, ...msgs]);
    return json({ reply, usage: { count: quota.count, limit: quota.limit } });
  } catch (e) {
    console.error('ai error', e);
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado' }, 502);
  }
});
