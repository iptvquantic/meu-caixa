// Meu Caixa — resumo financeiro enviado à IA (função pura, testável)
export type Tx = { type: string; amount: number; date: string; description: string; category_id: string | null; card_id: string | null; installments: number; invest_kind: string | null };
export type Cat = { id: string; name: string; kind: string };
export type Card = { id: string; name: string; closing_day: number; due_day: number; archived: boolean };
export type Rec = { id: string; type: string; name: string; amount: number; day: number; start_month: string; end_month: string | null; active: boolean };
export type Goal = { kind: string; name: string | null; amount: number; category_id: string | null; deadline: string | null; start_date: string; archived: boolean };
export type TxR = Tx & { recurring_id?: string | null; recurring_month?: string | null };


const pad = (n: number) => String(n).padStart(2, '0');
export function addMonths(mk: string, n: number) {
  let [y, m] = mk.split('-').map(Number);
  m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${y}-${pad(m)}`;
}
function invoiceMonth(dateISO: string, card: { closing_day: number; due_day: number }) {
  const [y, m, d] = dateISO.split('-').map(Number);
  let mk = `${y}-${pad(m)}`;
  if (d > card.closing_day) mk = addMonths(mk, 1);
  if (card.due_day <= card.closing_day) mk = addMonths(mk, 1);
  return mk;
}
function split(total: number, n: number) {
  const cents = Math.round(total * 100), base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? cents - base * (n - 1) : base) / 100);
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const r2 = (v: number) => Math.round(v * 100) / 100;
export function currentMonthSP() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
}

// Monta o resumo financeiro (função pura, testável)
export function buildContext(txs: TxR[], cats: Cat[], cards: Card[], month: string, cardMode = 'invoice', name = '', recs: Rec[] = [], goals: Goal[] = []) {
  const cat = Object.fromEntries(cats.map((c) => [c.id, c.name]));
  const cardById = Object.fromEntries(cards.map((c) => [c.id, c]));
  const defCard = cards.find((c) => !c.archived) ?? { closing_day: 9, due_day: 16 };
  const parts: { month: string; amount: number; cat: string }[] = [];
  for (const t of txs) if (t.type === 'card') {
    const card = (t.card_id && cardById[t.card_id]) || defCard;
    const n = Math.max(1, t.installments || 1), first = invoiceMonth(t.date, card);
    split(Number(t.amount), n).forEach((a, i) => parts.push({ month: addMonths(first, i), amount: a, cat: cat[t.category_id ?? ''] ?? 'Sem categoria' }));
  }
  const sum = (mk: string) => {
    const R = { in: 0, out: 0, card: 0, invest: 0, saldo: 0 };
    for (const t of txs) {
      if (t.type === 'card') { if (cardMode === 'purchase' && t.date.startsWith(mk)) R.card += Number(t.amount); continue; }
      if (!t.date.startsWith(mk)) continue;
      if (t.type === 'in') R.in += Number(t.amount);
      else if (t.type === 'out') R.out += Number(t.amount);
      else if (t.type === 'invest') R.invest += t.invest_kind === 'resgate' ? -Number(t.amount) : Number(t.amount);
    }
    if (cardMode !== 'purchase') R.card = parts.filter((p) => p.month === mk).reduce((s, p) => s + p.amount, 0);
    R.saldo = R.in - R.out - R.card - R.invest;
    return Object.fromEntries(Object.entries(R).map(([k, v]) => [k, r2(v)])) as typeof R;
  };
  const byCat: Record<string, number> = {}, bySrc: Record<string, number> = {}, byInv: Record<string, number> = {};
  for (const t of txs) {
    if (!t.date.startsWith(month)) continue;
    const c = cat[t.category_id ?? ''] ?? 'Sem categoria';
    if (t.type === 'out' || (t.type === 'card' && cardMode === 'purchase')) byCat[c] = (byCat[c] ?? 0) + Number(t.amount);
    if (t.type === 'in') bySrc[c] = (bySrc[c] ?? 0) + Number(t.amount);
    if (t.type === 'invest') byInv[c] = (byInv[c] ?? 0) + (t.invest_kind === 'resgate' ? -1 : 1) * Number(t.amount);
  }
  if (cardMode !== 'purchase') for (const p of parts) if (p.month === month) byCat[p.cat] = (byCat[p.cat] ?? 0) + p.amount;
  const top = (o: Record<string, number>, n = 8) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${brl(r2(v))}`).join('; ') || 'nenhum';
  const T = sum(month), gastos = T.out + T.card;
  const hist = [-3, -2, -1, 0].map((i) => { const mk = addMonths(month, i), s = sum(mk); return `${mk}: entradas ${brl(s.in)}, saídas ${brl(s.out)}, cartão ${brl(s.card)}, investido ${brl(s.invest)}, saldo ${brl(s.saldo)}`; }).join('\n');
  const next = [1, 2, 3].map((i) => { const mk = addMonths(month, i); return `${mk}: ${brl(r2(parts.filter((p) => p.month === mk).reduce((s, p) => s + p.amount, 0)))}`; }).join('; ');
  const biggest = txs.filter((t) => t.date.startsWith(month) && (t.type === 'out' || t.type === 'card')).sort((a, b) => b.amount - a.amount).slice(0, 5)
    .map((t) => `${t.description || cat[t.category_id ?? ''] || 'sem descrição'} ${brl(Number(t.amount))}${t.installments > 1 ? ` (${t.installments}x)` : ''}`).join('; ') || 'nenhum';
  const today = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full' }).format(new Date());
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const lastDay = (mk: string) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const recLines = recs.filter((r) => r.active && r.start_month <= month && (!r.end_month || r.end_month >= month)).map((r) => {
    const due = `${month}-${pad(Math.min(r.day, lastDay(month)))}`;
    const paid = txs.some((t) => t.recurring_id === r.id && t.recurring_month === month);
    const st = paid ? (r.type === 'in' ? 'recebido' : 'pago') : due < todayISO ? 'ATRASADO' : 'a vencer';
    return `${r.type === 'in' ? 'receber' : 'pagar'} ${r.name} ${brl(Number(r.amount))} dia ${r.day} (${st})`;
  });
  const goalLines = goals.filter((g) => !g.archived).map((g) => {
    if (g.kind === 'budget') { const c = cat[g.category_id ?? ''] ?? 'categoria'; const v = byCat[c] ?? 0; return `limite ${c}: ${brl(r2(v))} de ${brl(Number(g.amount))} (${Math.round((v / Number(g.amount)) * 100)}%)`; }
    if (g.kind === 'income') { const v = g.category_id ? (bySrc[cat[g.category_id] ?? ''] ?? 0) : T.in; return `faturamento${g.category_id ? ' de ' + (cat[g.category_id] ?? '') : ''}: ${brl(r2(v))} de ${brl(Number(g.amount))} (${Math.round((v / Number(g.amount)) * 100)}%)`; }
    const v = txs.filter((t) => t.type === 'invest' && t.date >= g.start_date && (!g.category_id || t.category_id === g.category_id)).reduce((s, t) => s + (t.invest_kind === 'resgate' ? -1 : 1) * Number(t.amount), 0);
    return `objetivo ${g.name ?? ''}: ${brl(r2(v))} de ${brl(Number(g.amount))}${g.deadline ? ' até ' + g.deadline : ''}`;
  });
  return `DADOS REAIS${name ? ' de ' + name : ''} (hoje: ${today}). Mês em foco: ${month}. Cartão entra no saldo ${cardMode === 'purchase' ? 'pela data da compra' : 'pela fatura (mês do vencimento)'}.
RESUMO DO MÊS: entradas ${brl(T.in)}; saídas PIX/débito/dinheiro ${brl(T.out)}; fatura do cartão ${brl(T.card)}; investido líquido ${brl(T.invest)}; saldo ${brl(T.saldo)}.
Taxa de sobra: ${T.in ? Math.round((T.saldo / T.in) * 100) : 0}% | gastos sobre entradas: ${T.in ? Math.round((gastos / T.in) * 100) : 0}% | cartão sobre entradas: ${T.in ? Math.round((T.card / T.in) * 100) : 0}%.
GASTOS POR CATEGORIA: ${top(byCat)}.
ENTRADAS POR FONTE: ${top(bySrc)}.
INVESTIMENTOS POR TIPO (líquido): ${top(byInv)}.
MAIORES GASTOS: ${biggest}.
HISTÓRICO (4 meses):
${hist}
PARCELAS JÁ COMPROMETIDAS NAS PRÓXIMAS FATURAS: ${next}.
CARTÕES: ${cards.filter((c) => !c.archived).map((c) => `${c.name} (fecha dia ${c.closing_day}, vence dia ${c.due_day})`).join('; ') || 'nenhum cadastrado'}.
CONTAS FIXAS DO MÊS: ${recLines.join('; ') || 'nenhuma cadastrada'}.
METAS: ${goalLines.join('; ') || 'nenhuma cadastrada'}.`;
}

