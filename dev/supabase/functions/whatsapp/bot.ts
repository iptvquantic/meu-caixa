// Meu Caixa — robô do WhatsApp: entende a mensagem e devolve a resposta (lançar, pagar conta fixa,
// consultar, desfazer, perguntar à IA). Tudo que fala com o mundo (banco, IA, áudio) chega por "deps",
// então dá para testar sem internet (dev/test-bot.mjs).
import { familyOf, iconIsSpecific, norm, parseQuick, suggestIcon } from './smart.ts';
import {
  addMonths, billsOfMonth, brl, buildContext, cardParts, goalValue, invoiceMonth, monthByCat, monthSums, r2, splitInstallments,
  type Card, type Cat, type Goal, type Rec, type TxR,
} from './context.ts';

export type Category = Cat & { icon?: string; legacy_key?: string | null; archived?: boolean; sort?: number };
export type RecX = Rec & { category_id?: string | null; card_id?: string | null };
export type Data = { transactions: (TxR & { id?: string })[]; categories: Category[]; cards: Card[]; recurring: RecX[]; goals: Goal[] };
export type WaUser = { user_id: string; name: string; access: boolean; plan: string; settings: Record<string, any> | null };
export type Quick = { type: string; amount: number; installments: number; date: string; description: string; investKind: string | null };
export type Incoming = { phone: string; kind: 'text' | 'audio' | 'image' | 'other'; text?: string; audioId?: string; lastHour?: number };
export type BotDeps = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<any>;
  ask: (system: string, question: string) => Promise<string>;            // pergunta livre (Groq)
  extract: (text: string, today: string) => Promise<Quick | null>;       // frase sem número ("gastei quarenta no uber")
  transcribe: (audioId: string) => Promise<string>;                      // áudio → texto (Groq Whisper)
  deleteTx: (uid: string, id: string) => Promise<boolean>;               // "desfazer": apaga o lançamento (id + dono)
  today: () => string;                                                   // AAAA-MM-DD em São Paulo
  appUrl: string;
};

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthName = (mk: string) => { const [y, m] = mk.split('-').map(Number); return `${MONTHS[m - 1]} de ${y}`; };
const monthShort = (mk: string) => { const [y, m] = mk.split('-').map(Number); return `${MONTHS[m - 1].slice(0, 3)}/${y}`; };
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayLabel = (iso: string, today: string) => iso === today ? 'hoje' : iso === addDays(today, -1) ? 'ontem' : ddmm(iso);
const money = (v: number) => brl(r2(v)).replace(/ /g, ' ');
const pct = (v: number, of: number) => of > 0 ? Math.round((v / of) * 100) : 0;
const first = (s: string) => (s || '').trim().split(/\s+/)[0] || '';

export const MSG = {
  notLinked: (app: string) => `Olá! Este número ainda não está conectado ao *Meu Caixa*.\n\nPara conectar: abra o app → *Ajustes → WhatsApp → Conectar* e envie o código que aparecer.\n${app}`,
  badCode: '❌ Código inválido ou vencido. No app: *Ajustes → WhatsApp → Conectar* e mande o código novo (vale 15 minutos).',
  rateCode: 'Muitas tentativas seguidas. Espere 1 hora e gere um código novo no app.',
  inUse: '⚠️ Este WhatsApp já está conectado a outra conta do Meu Caixa.\nPara usar nesta conta: entre no app com a conta atual → *Ajustes → WhatsApp → Desconectar*. Depois gere um código novo e me mande.',
  welcome: (name: string) => `✅ Pronto${name ? ', ' + first(name) : ''}! Este WhatsApp está conectado ao seu *Meu Caixa*.\n\n` + HELP_BODY,
  help: (name: string) => `Oi${name ? ', ' + first(name) : ''}! Sou o robô do *Meu Caixa*.\n\n` + HELP_BODY,
  off: '🔕 O robô está desligado na sua conta. Para usar, ligue em *Ajustes → Recursos do app → WhatsApp* no app.',
  plan: (app: string) => `⏳ Seu plano venceu, então não consigo lançar. Você ainda pode consultar: *saldo*, *fatura*, *contas*.\nRenove pelo app: ${app}`,
  flood: '✋ Muitas mensagens em pouco tempo. Me dá um minutinho e tente de novo.',
  unsupported: 'Por enquanto eu entendo *texto* e *áudio* 🙂\nEx.: _mercado 52,90_',
  noAudio: 'Não consegui entender o áudio. Pode repetir mais devagar ou escrever? Ex.: _uber 23 ontem_',
  limit: (n: number) => `Você já usou as ${n} perguntas/áudios de hoje. Amanhã libera de novo.\nLançar por texto e consultar (*saldo*, *fatura*, *contas*) continuam funcionando.`,
  fail: 'Tive um problema agora e não consegui terminar. Tente de novo em instantes.',
};
const HELP_BODY = '*Para lançar*, mande:\n• mercado 52,90\n• recebi 300 pix\n• notebook 3.600 12x _(cartão)_\n• uber 23 ontem\n• investi 500\n• paguei aluguel _(conta fixa)_\n🎙️ Também entendo *áudio*.\n\n*Para consultar*: saldo · fatura · contas · metas\n*Errou?* desfazer\n\nOu pergunte o que quiser: _posso gastar 300 este mês?_';

const SYSTEM = `Você é o Conselheiro do Meu Caixa respondendo pelo WhatsApp: um planejador financeiro experiente, direto, caloroso e prático.
Você conversa com autônomos e pequenos negócios no Brasil e recebe, abaixo, os NÚMEROS REAIS do usuário.

Regras:
- Use sempre os números do contexto (valores em R$, percentuais, meses). Nunca invente dados; se faltar informação, diga o que falta.
- WhatsApp: responda curto. Pergunta simples = 1 a 3 frases. Análise ou plano = no máximo 8 linhas, com passos numerados e valores.
- Formatação do WhatsApp: *negrito* com um asterisco e _itálico_. Sem títulos com #, sem tabelas, sem links.
- Cartão: "fatura do mês" é o que vence naquele mês (parcelas incluídas).
- NUNCA recomende pagar só o mínimo da fatura nem entrar no rotativo. Priorize pagar a fatura inteira; se não der, explique que parcelar a fatura costuma sair mais barato que o rotativo e mostre o corte de gastos necessário.
- Não sugira pegar empréstimo novo para cobrir consumo.
- Fontes de renda e categorias do usuário são dados neutros: não julgue a origem do dinheiro.
- Escreva valores no padrão brasileiro: R$ 1.171,00.
- Investimentos: comente a alocação registrada; não indique produto específico nem prometa rentabilidade.
- Não é consultoria financeira, jurídica ou tributária licenciada; em decisões grandes, recomende um profissional.
- Você não lança nada: para lançar, o usuário manda a frase (ex.: "mercado 52,90"). Nunca diga que lançou algo.
- Português do Brasil, tom de conversa entre adultos. No máximo 1 emoji.`;

const QUESTION = /^(quanto|quanta|quantos|quantas|qual|quais|como|quando|onde|por ?que|pq|posso|devo|consigo|da pra|vale a pena|o que|me (diga|fala|mostra|ajuda|explica)|sera|tem como|e se)\b/;
const ENTRY_VERB = /\b(gastei|paguei|comprei|recebi|vendi|ganhei|investi|apliquei|resgatei|guardei|transferi|depositei)\b/;
const PAY_VERB = /^(paguei|pago|quitei|recebi|recebido)\b/;
const ACK = /^(ok|okay|obrigad[oa]|muito obrigad[oa]|valeu|vlw|blz|beleza|show|top|certo|entendi|perfeito|tks|thanks|tmj|joia|otimo|massa)$/;
const isQuestion = (text: string) => /\?\s*$/.test(text) || QUESTION.test(norm(text));

// Categorias na mesma ordem do app (mais usadas primeiro) e a mesma escolha pelo ícone/nome
function catsOfKind(kind: string, data: Data) {
  const use: Record<string, number> = {};
  for (const t of data.transactions) if (t.category_id) use[t.category_id] = (use[t.category_id] ?? 0) + 1;
  return data.categories.filter((c) => c.kind === kind && !c.archived)
    .sort((a, b) => (use[b.id] ?? 0) - (use[a.id] ?? 0) || (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
}
export function matchCategory(text: string, kind: string, data: Data): Category | null {
  const list = catsOfKind(kind, data), n = norm(text);
  if (!n) return null;
  const icon = suggestIcon(text, kind);
  if (iconIsSpecific(icon)) {
    const fam = familyOf(icon, kind);
    const hit = list.find((c) => c.icon === icon) || (fam && list.find((c) => c.legacy_key === fam)) || list.find((c) => n.includes(norm(c.name)));
    if (hit) return hit;
  }
  // nome da categoria escrito na mensagem ("45 mensalidade rogério")
  const words = new Set(n.split(' '));
  return list.find((c) => { const cn = norm(c.name); return cn.length >= 3 && (n.includes(cn) || cn.split(' ').some((w) => w.length >= 4 && words.has(w))); }) || null;
}
const othersOf = (kind: string, data: Data) => data.categories.find((c) => c.kind === kind && !c.archived && c.legacy_key === 'outros') || null;
function defaultCard(data: Data) {
  const active = data.cards.filter((c) => !c.archived);
  const use: Record<string, number> = {};
  for (const t of data.transactions) if (t.type === 'card' && t.card_id) use[t.card_id] = (use[t.card_id] ?? 0) + 1;
  return active.sort((a, b) => (use[b.id] ?? 0) - (use[a.id] ?? 0))[0] || null;
}
// Conta fixa do mês com esse nome, ainda não paga ("paguei aluguel", "recebi mensalidade rogério")
function findBill(text: string, type: 'in' | 'out' | 'any', data: Data, today: string, paid = false): { rec: RecX; due: string; status: string } | null {
  const n = norm(text), month = today.slice(0, 7);
  return billsOfMonth(data.recurring, data.transactions, month, today)
    .filter((b) => (b.status === 'paid') === paid && (type === 'any' || (type === 'in' ? b.rec.type === 'in' : b.rec.type !== 'in')))
    .find((b) => { const rn = norm(b.rec.name); return rn.length >= 3 && (n.includes(rn) || rn.split(' ').some((w) => w.length >= 4 && n.split(' ').includes(w))); }) || null;
}

const feats = (u: WaUser) => (u.settings?.features ?? {}) as Record<string, boolean>;
const cardModeOf = (u: WaUser) => u.settings?.cardMode === 'purchase' ? 'purchase' : 'invoice';

// ---------------- entrada ----------------
// Código de conexão: 8 dígitos. Já conectado, só vale a mensagem que é apenas o código
// (assim "12345678" nunca vira um lançamento de R$ 12 milhões).
const CODE_ANY = /(?:^|\D)(\d{8})(?!\d)/;
const CODE_ONLY = /^\s*(?:(?:mc|c[oó]digo)\s*:?\s*)?(\d{8})\s*[.!]?\s*$/i;
async function link(code: string, m: Incoming, d: BotDeps) {
  const r = await d.rpc('wa_link_finish', { p_code: code, p_phone: m.phone });
  return r?.ok ? MSG.welcome(r.name || '') : r?.reason === 'rate' ? MSG.rateCode : r?.reason === 'in_use' ? MSG.inUse : MSG.badCode;
}

export async function answer(m: Incoming, d: BotDeps): Promise<string | null> {
  const u: WaUser | null = await d.rpc('wa_user', { p_phone: m.phone });
  if (!u) {
    const code = CODE_ANY.exec(m.text ?? '')?.[1];
    if (code) return link(code, m, d);
    return (m.lastHour ?? 1) <= 3 ? MSG.notLinked(d.appUrl) : null; // não fica respondendo quem insiste
  }
  if ((m.lastHour ?? 1) > 60) return m.lastHour === 61 ? MSG.flood : null;
  const code = m.kind === 'text' ? CODE_ONLY.exec(m.text ?? '')?.[1] : undefined;
  if (code) return link(code, m, d); // reconectar (mesma conta) ou tentar outra conta (recusado: desconectar antes)
  if (feats(u).whatsapp === false) return MSG.off;
  if (m.kind === 'image' || m.kind === 'other') return m.kind === 'image' ? MSG.unsupported : null;

  let text = (m.text ?? '').trim(), heard = '';
  if (m.kind === 'audio') {
    const quota = await d.rpc('ai_consume_for', { p_uid: u.user_id });
    if (!quota?.ok) return quota?.reason === 'limit' ? MSG.limit(quota.limit) : MSG.plan(d.appUrl);
    text = (await d.transcribe(m.audioId ?? '')).trim();
    if (!text) return MSG.noAudio;
    heard = `🎙️ _"${text.length > 200 ? text.slice(0, 200) + '…' : text}"_\n\n`;
  }
  if (!text) return null;
  const reply = await route(text, u, d, m.kind === 'audio');
  return reply ? heard + reply : null;
}

async function route(text: string, u: WaUser, d: BotDeps, fromAudio: boolean): Promise<string | null> {
  const n = norm(text).replace(/[!.?…]+$/g, '').trim(), today = d.today();
  if (!/[\p{L}\p{N}]/u.test(n) || ACK.test(n)) return null; // "ok", "obrigado", só emoji: não precisa responder
  if (/^(oi|ola|ola robo|bom dia|boa tarde|boa noite|ajuda|menu|comandos|help|inicio)$/.test(n)) return MSG.help(u.name);
  if (/^(desfazer|desfaz|desfaca|apagar|apaga|cancelar|cancela|apaga o ultimo|desfazer o ultimo|apagar o ultimo)( lancamento)?$/.test(n)) return undo(u, d);
  if (/^(saldo|resumo|balanco|como estou|como to|meu mes|o mes|mes)$/.test(n)) return summary(u, d, today);
  if (/^(fatura|faturas|cartao|cartoes|fatura do cartao)$/.test(n)) return invoices(u, d, today);
  if (/^(contas|contas fixas|a pagar|a receber|vencimentos|boletos|contas do mes)$/.test(n)) return feats(u).bills === false ? 'As *contas fixas* estão desligadas nos Ajustes do app.' : bills(u, d, today);
  if (/^(metas|meta|limites|objetivos)$/.test(n)) return feats(u).goals === false ? 'As *metas* estão desligadas nos Ajustes do app.' : goals(u, d, today);

  let counted = fromAudio; // o áudio já gastou 1 da cota de IA do dia
  if (!isQuestion(text)) {
    let q = parseQuick(text, today) as Quick | null;
    // "paguei aluguel" / "recebi mensalidade rogério": conta fixa do mês, sem precisar do valor
    if (!q && PAY_VERB.test(n) && feats(u).bills !== false) {
      const data: Data = await d.rpc('wa_data', { p_uid: u.user_id });
      const bill = findBill(text, /^(recebi|recebido)/.test(n) ? 'in' : 'out', data, today);
      if (bill) return addEntry(u, d, { type: bill.rec.type, amount: Number(bill.rec.amount), installments: 1, date: today, description: bill.rec.name, investKind: null }, text, data);
      const done = findBill(text, /^(recebi|recebido)/.test(n) ? 'in' : 'out', data, today, true);
      if (done) return `✅ *${done.rec.name}* já estava marcada como ${done.rec.type === 'in' ? 'recebida' : 'paga'} este mês.`;
    }
    // frase de lançamento sem número ("gastei quarenta no uber", comum em áudio): a IA extrai
    if (!q && (fromAudio || ENTRY_VERB.test(n))) {
      if (!counted) {
        const quota = await d.rpc('ai_consume_for', { p_uid: u.user_id });
        if (!quota?.ok) return quota?.reason === 'limit' ? MSG.limit(quota.limit) : MSG.plan(d.appUrl);
        counted = true;
      }
      q = await d.extract(text, today);
    }
    if (q && q.amount > 0) return addEntry(u, d, q, text);
  }
  return askAI(text, u, d, today, counted);
}

// ---------------- lançar ----------------
async function addEntry(u: WaUser, d: BotDeps, q: Quick, original: string, loaded?: Data): Promise<string> {
  if (!u.access) return MSG.plan(d.appUrl);
  const data: Data = loaded ?? await d.rpc('wa_data', { p_uid: u.user_id });
  const today = d.today();
  let type = q.type, note = '';
  // é uma conta fixa do mês? Só com "paguei/recebi…" ou com o mesmo valor da conta ("aluguel 900"),
  // para uma compra comum ("mercado 50") não virar pagamento da conta "Mercado do mês"
  let bill = type !== 'invest' && feats(u).bills !== false ? findBill(q.description || original, type === 'in' ? 'in' : 'out', data, today) : null;
  if (bill && !(PAY_VERB.test(norm(original)) || Math.abs(Number(bill.rec.amount) - q.amount) < 0.005)) bill = null;
  if (bill) type = bill.rec.type;
  const billCard = bill?.rec.card_id ? data.cards.find((c) => c.id === bill!.rec.card_id && !c.archived) : null;
  const card = type === 'card' ? billCard || defaultCard(data) : null;
  if (type === 'card' && !card) { type = 'out'; note = '\n_Você não tem cartão cadastrado: lancei como saída à vista. Cadastre o cartão no app._'; }
  const kind = type === 'in' ? 'in' : type === 'invest' ? 'invest' : 'out';
  const billCat = bill?.rec.category_id ? data.categories.find((c) => c.id === bill!.rec.category_id && c.kind === kind) : null;
  const cat = billCat || matchCategory(q.description, kind, data) || othersOf(kind, data);
  const tx = {
    type, amount: r2(q.amount), date: q.date, description: (q.description || '').slice(0, 140), category_id: cat?.id ?? null,
    card_id: type === 'card' ? card!.id : null, installments: type === 'card' ? Math.min(48, Math.max(1, q.installments || 1)) : 1,
    invest_kind: type === 'invest' ? (q.investKind === 'resgate' ? 'resgate' : 'aporte') : null,
    recurring_id: bill ? bill.rec.id : null, recurring_month: bill ? today.slice(0, 7) : null,
  };
  let r;
  try { r = await d.rpc('wa_add_tx', { p_uid: u.user_id, p_tx: tx }); } catch (e) {
    if (bill && /duplicate|unique|23505/i.test(String((e as Error)?.message ?? e))) return `✅ *${bill.rec.name}* já estava marcada como ${bill.rec.type === 'in' ? 'recebida' : 'paga'} este mês.`;
    throw e;
  }
  if (!r?.ok) return r?.reason === 'plan' ? MSG.plan(d.appUrl) : MSG.fail;

  const lines: string[] = [];
  const v = `*${money(tx.amount)}*`;
  if (type === 'in') lines.push(`💰 *Entrada* de ${v}`);
  else if (type === 'out') lines.push(`💸 *Saída* de ${v}`);
  else if (type === 'invest') lines.push(tx.invest_kind === 'resgate' ? `📤 *Resgate* de ${v}` : `📈 *Aporte* de ${v}`);
  else {
    const parts = splitInstallments(tx.amount, tx.installments);
    lines.push(`💳 *${card!.name}*: ${v}${tx.installments > 1 ? ` em ${tx.installments}x de ${money(parts[0])}` : ''}`);
    lines.push(`🧾 ${tx.installments > 1 ? '1ª parcela na' : 'Entra na'} fatura de ${monthShort(invoiceMonth(tx.date, card!))}`);
  }
  lines.push(`🏷️ ${cat?.name ?? 'Sem categoria'} · 📅 ${dayLabel(tx.date, today)}${tx.description && norm(tx.description) !== norm(cat?.name ?? '') ? ' · ' + tx.description : ''}`);
  if (bill) lines.push(`🗓️ Conta fixa *${bill.rec.name}* marcada como ${bill.rec.type === 'in' ? 'recebida' : 'paga'} em ${MONTHS[Number(today.slice(5, 7)) - 1]}.`);

  // saldo do mês já com o lançamento + aviso de limite da categoria
  const month = today.slice(0, 7);
  const txs = [{ ...tx, ...(r.tx ?? {}) } as TxR, ...data.transactions];
  const parts = cardParts(txs, data.categories, data.cards);
  const T = monthSums(txs, parts, month, cardModeOf(u));
  lines.push(`📊 Saldo de ${MONTHS[Number(month.slice(5, 7)) - 1]}: *${money(T.saldo)}*`);
  if ((type === 'out' || type === 'card') && cat && feats(u).goals !== false) {
    const g = data.goals.find((x) => x.kind === 'budget' && !x.archived && x.category_id === cat.id);
    if (g) {
      const { byCat, bySrc } = monthByCat(txs, parts, data.categories, month, cardModeOf(u));
      const used = goalValue(g, txs, data.categories, byCat, bySrc, T.in), p = pct(used, Number(g.amount));
      if (p >= 80) lines.push(`${p >= 100 ? '🚨' : '⚠️'} Limite de ${cat.name}: ${p}% (${money(used)} de ${money(Number(g.amount))})`);
    }
  }
  lines.push('_Errou? Responda *desfazer*._');
  return lines.join('\n') + note;
}

// O banco diz qual é o último lançamento feito pelo WhatsApp (até 30 min); a função apaga só esse, do mesmo dono.
async function undo(u: WaUser, d: BotDeps): Promise<string> {
  const r = await d.rpc('wa_undo_target', { p_uid: u.user_id });
  if (r?.ok && r.tx?.id && await d.deleteTx(u.user_id, String(r.tx.id))) {
    const t = r.tx;
    const what = t.type === 'in' ? 'Entrada' : t.type === 'invest' ? (t.invest_kind === 'resgate' ? 'Resgate' : 'Aporte') : t.type === 'card' ? 'Compra no cartão' : 'Saída';
    return `↩️ Apaguei: ${what} de ${money(Number(t.amount || 0))}${t.description ? ` (${t.description})` : ''}.`;
  }
  if (r?.reason === 'plan') return MSG.plan(d.appUrl);
  return 'Não há lançamento recente feito pelo WhatsApp para desfazer (dá até 30 minutos depois). Para outros, use o app.';
}

// ---------------- consultas ----------------
async function summary(u: WaUser, d: BotDeps, today: string): Promise<string> {
  const data: Data = await d.rpc('wa_data', { p_uid: u.user_id });
  const month = today.slice(0, 7), mode = cardModeOf(u);
  const parts = cardParts(data.transactions, data.categories, data.cards);
  const T = monthSums(data.transactions, parts, month, mode);
  const { byCat } = monthByCat(data.transactions, parts, data.categories, month, mode);
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${money(v)}`).join(' · ');
  const lines = [
    `📊 *${monthName(month).replace(/^./, (c) => c.toUpperCase())}*`,
    `💰 Entradas: ${money(T.in)}`, `💸 Saídas: ${money(T.out)}`, `💳 Cartão${mode === 'invoice' ? ' (fatura)' : ''}: ${money(T.card)}`, `📈 Investido: ${money(T.invest)}`,
    `*Saldo: ${money(T.saldo)}*`,
  ];
  if (top) lines.push(`\nMaiores gastos: ${top}`);
  if (feats(u).bills !== false) {
    const open = billsOfMonth(data.recurring, data.transactions, month, today).filter((b) => b.status !== 'paid');
    const pay = open.filter((b) => b.rec.type !== 'in'), get = open.filter((b) => b.rec.type === 'in');
    if (pay.length) lines.push(`A pagar ainda: ${money(pay.reduce((s, b) => s + Number(b.rec.amount), 0))} (${pay.length} conta${pay.length > 1 ? 's' : ''})`);
    if (get.length) lines.push(`A receber ainda: ${money(get.reduce((s, b) => s + Number(b.rec.amount), 0))}`);
  }
  return lines.join('\n');
}

async function invoices(u: WaUser, d: BotDeps, today: string): Promise<string> {
  const data: Data = await d.rpc('wa_data', { p_uid: u.user_id });
  const cards = data.cards.filter((c) => !c.archived);
  if (!cards.length) return 'Você ainda não tem cartão cadastrado. Cadastre no app em *Cartões*.';
  const parts = cardParts(data.transactions, data.categories, data.cards), month = today.slice(0, 7);
  const lines = ['💳 *Faturas*'];
  for (const c of cards) {
    lines.push(`\n*${c.name}* (fecha dia ${c.closing_day}, vence dia ${c.due_day})`);
    for (const i of [0, 1, 2]) {
      const mk = addMonths(month, i), v = parts.filter((p) => p.card_id === c.id && p.month === mk).reduce((s, p) => s + p.amount, 0);
      lines.push(`• ${MONTHS[Number(mk.slice(5, 7)) - 1]}${i === 0 ? ' (este mês)' : ''}: ${money(v)}`);
    }
  }
  return lines.join('\n');
}

async function bills(u: WaUser, d: BotDeps, today: string): Promise<string> {
  const data: Data = await d.rpc('wa_data', { p_uid: u.user_id });
  const month = today.slice(0, 7), list = billsOfMonth(data.recurring, data.transactions, month, today);
  if (!list.length) return 'Nenhuma conta fixa neste mês. Cadastre no app em *Contas fixas*.';
  const icon: Record<string, string> = { paid: '✅', late: '⚠️', today: '⏰', upcoming: '🔜' };
  const label = (s: string, isIn: boolean) => s === 'paid' ? (isIn ? 'recebida' : 'paga') : s === 'late' ? 'atrasada' : s === 'today' ? 'vence hoje' : isIn ? 'a receber' : 'a vencer';
  const lines = [`🗓️ *Contas de ${MONTHS[Number(month.slice(5, 7)) - 1]}*`];
  for (const b of list.sort((a, b) => a.due.localeCompare(b.due))) lines.push(`${icon[b.status]} ${b.rec.name} · ${money(Number(b.rec.amount))} · dia ${b.rec.day} (${label(b.status, b.rec.type === 'in')})`);
  if (list.some((b) => b.status !== 'paid')) lines.push('\nPara marcar: _paguei aluguel_ ou _recebi mensalidade_');
  return lines.join('\n');
}

async function goals(u: WaUser, d: BotDeps, today: string): Promise<string> {
  const data: Data = await d.rpc('wa_data', { p_uid: u.user_id });
  const list = data.goals.filter((g) => !g.archived);
  if (!list.length) return 'Nenhuma meta cadastrada. Crie no app em *Metas*.';
  const month = today.slice(0, 7), mode = cardModeOf(u);
  const parts = cardParts(data.transactions, data.categories, data.cards);
  const T = monthSums(data.transactions, parts, month, mode);
  const { byCat, bySrc } = monthByCat(data.transactions, parts, data.categories, month, mode);
  const catName = (id: string | null) => data.categories.find((c) => c.id === id)?.name ?? 'categoria';
  const lines = ['🎯 *Metas*'];
  for (const g of list) {
    const v = goalValue(g, data.transactions, data.categories, byCat, bySrc, T.in), p = pct(v, Number(g.amount));
    if (g.kind === 'budget') lines.push(`${p >= 100 ? '🚨' : p >= 80 ? '⚠️' : '🛒'} Limite ${catName(g.category_id)}: ${money(v)} de ${money(Number(g.amount))} (${p}%)`);
    else if (g.kind === 'income') lines.push(`💼 Faturamento${g.category_id ? ' ' + catName(g.category_id) : ''}: ${money(v)} de ${money(Number(g.amount))} (${p}%)`);
    else lines.push(`🐷 ${g.name || 'Objetivo'}: ${money(v)} de ${money(Number(g.amount))} (${p}%)${g.deadline ? ' · até ' + ddmm(g.deadline) + '/' + g.deadline.slice(0, 4) : ''}`);
  }
  return lines.join('\n');
}

// ---------------- pergunta livre ----------------
async function askAI(text: string, u: WaUser, d: BotDeps, today: string, alreadyCounted: boolean): Promise<string> {
  if (!alreadyCounted) {
    const quota = await d.rpc('ai_consume_for', { p_uid: u.user_id });
    if (!quota?.ok) return quota?.reason === 'limit' ? MSG.limit(quota.limit) : MSG.plan(d.appUrl);
  }
  const data: Data = await d.rpc('wa_data', { p_uid: u.user_id });
  const f = feats(u);
  const ctx = buildContext(data.transactions, data.categories, data.cards, today.slice(0, 7), cardModeOf(u), u.name,
    f.bills === false ? [] : data.recurring, f.goals === false ? [] : data.goals);
  const out = (await d.ask(SYSTEM + '\n\n' + ctx, text.slice(0, 1500))).trim();
  return out.length > 3500 ? out.slice(0, 3500) + '…' : out || MSG.fail;
}
