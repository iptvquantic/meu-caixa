// Meu Caixa — robô do WhatsApp e "Lançar com IA" do app: entende a mensagem e devolve a resposta (lançar,
// pagar conta fixa, ler comprovante por foto, consultar, desfazer, perguntar à IA). Frase simples e clara é
// lançada na hora pelo lançamento rápido; áudio e frase com dúvida passam pela IA com o contexto da pessoa
// (understand.ts). Tudo que fala com o mundo (banco, IA, áudio, imagem) chega por "deps" (dev/test-bot.mjs).
import { explicitType, familyOf, guessType, iconIsSpecific, norm, parseQuick, suggestIcon } from './smart.ts';
import { contextOf, SCHEMA, SYSTEM as UNDERSTAND, toPlan, vocabOf, type Item, type Plan } from './understand.ts';
import {
  addMonths, billsOfMonth, brl, buildContext, cardParts, goalValue, invoiceMonth, monthByCat, monthSums, r2, splitInstallments,
  type Card, type Cat, type Goal, type Rec, type TxR,
} from './context.ts';
import type { Receipt, ReceiptCats } from './receipt.ts';

export type Category = Cat & { icon?: string; legacy_key?: string | null; archived?: boolean; sort?: number };
export type RecX = Rec & { category_id?: string | null; card_id?: string | null };
export type Data = { transactions: (TxR & { id?: string })[]; categories: Category[]; cards: Card[]; recurring: RecX[]; goals: Goal[] };
export type WaUser = { user_id: string; name: string; access: boolean; plan: string; settings: Record<string, any> | null };
export type Quick = { type: string; amount: number; installments: number; date: string; description: string; investKind: string | null };
// O que a tela do app diz sobre o tipo: a aba (sure = a pessoa tocou nela; pay = escolheu como pagou; card = qual cartão)
export type Hint = { type: 'in' | 'out' | 'card' | 'invest'; sure?: boolean; pay?: boolean; card?: string };
// image = foto ou imagem enviada como documento (text = legenda); doc = outro documento (PDF…); hint e context = só pelo app
// (context = a frase anterior que ficou sem valor: "parcela do pai" + agora "350")
export type Incoming = { phone: string; kind: 'text' | 'audio' | 'image' | 'doc' | 'other'; text?: string; audioId?: string; mediaId?: string; lastHour?: number; hint?: Hint; context?: string };
export type BotDeps = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<any>;
  ask: (system: string, question: string) => Promise<string>;            // pergunta livre (Groq)
  extract: (text: string, today: string) => Promise<Quick | null>;       // frase sem número (reserva, quando não há understand)
  transcribe: (audioId: string, vocab?: string) => Promise<string>;      // áudio → texto (Groq Whisper; vocab = nomes da pessoa)
  understand?: (system: string, context: string, schema: Record<string, unknown>) => Promise<string>; // entende a frase (IA)
  // foto do comprovante → tipo, valor, data, quem e categoria (null: não é comprovante legível; 'grande'/'tipo': imagem recusada)
  readReceipt: (mediaId: string, today: string, cats: ReceiptCats, note: string, userName: string) => Promise<Receipt | null | 'grande' | 'tipo'>;
  deleteTx: (uid: string, id: string) => Promise<boolean>;               // "desfazer": apaga o lançamento (id + dono)
  today: () => string;                                                   // AAAA-MM-DD em São Paulo
  appUrl: string;
  // só pelo app: "desfazer" é feito pelo próprio app (último lançamento dele); faltou o valor → a próxima mensagem completa
  onUndo?: () => void;
  onPending?: (text: string) => void;
  log?: (...a: unknown[]) => void;
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
  unsupported: 'Eu entendo *texto*, *áudio* e *foto de comprovante* 🙂\nEx.: _mercado 52,90_',
  pdf: 'Ainda não leio PDF. Mande uma *foto* ou um *print* do comprovante 📷',
  noReceipt: 'Não consegui ler esse comprovante 🧐 Tente uma foto mais de perto, com boa luz e o valor total aparecendo, ou escreva: _mercado 52,90_',
  bigImage: 'Essa imagem é grande demais para eu ler. Mande como *foto* (não como documento) ou um *print* da tela.',
  noAudio: 'Não ouvi nada no áudio 🎙️ Fale perto do microfone e tente de novo, ou escreva. Ex.: _uber 23 ontem_',
  missing: (what: string, app: boolean) => `Entendi${what ? ` *${what}*` : ''}, mas faltou o valor. ${app ? 'Quanto foi? Fale ou escreva só o valor (ex.: _350_).' : `Mande de novo com o valor, ex.: _${(what || 'mercado').toLowerCase()} 50_.`}`,
  limit: (n: number) => `Você já usou as ${n} perguntas/áudios de hoje. Amanhã libera de novo.\nLançar por texto e consultar (*saldo*, *fatura*, *contas*) continuam funcionando.`,
  fail: 'Tive um problema agora e não consegui terminar. Tente de novo em instantes.',
  audioFail: 'Não consegui ouvir esse áudio agora 🎙️ Grave de novo ou escreva. Ex.: _uber 23 ontem_',
  busy: 'A IA está ocupada agora 😅 Tente de novo em 1 minuto ou escreva com o valor, ex.: _mercado 52,90_.',
  invoicePaid: '💳 Pagar a fatura não precisa de lançamento: as compras do cartão já contam no saldo (cada parcela no mês da fatura). Para conferir, mande *fatura*.',
};
const HELP_BODY = '*Para lançar*, mande:\n• mercado 52,90\n• recebi 300 pix\n• notebook 3.600 12x _(cartão)_\n• uber 23 ontem\n• investi 500\n• paguei aluguel _(conta fixa)_\n🎙️ Também entendo *áudio*.\n📷 Mande a *foto ou o print de um comprovante* (compra, PIX enviado ou recebido) e eu lanço.\n\n*Para consultar*: saldo · fatura · contas · metas\n*Errou?* desfazer\n\nOu pergunte o que quiser: _posso gastar 300 este mês?_';

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
const INVOICE_PAY = /(^| )(paguei|pagamento|pagar|quitei|paga|pago|quitada|quitado)( |$)/;
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
  return serve(m, u, d);
}

// O "cérebro" do robô, igual no WhatsApp e no app (o app chama com o login do usuário: dev/.../handler.ts ?app).
// noAI: não responde pergunta livre (o app manda para o Conselheiro, que tem o histórico da conversa) → null.
export async function serve(m: Incoming, u: WaUser, d: BotDeps, o: { noAI?: boolean } = {}): Promise<string | null> {
  if (m.kind === 'image') return receipt(m, u, d);
  if (m.kind === 'doc') return MSG.pdf;
  if (m.kind === 'other') return null;

  let text = (m.text ?? '').trim(), heard = '', data: Data | undefined;
  if (m.kind === 'audio') {
    const quota = await d.rpc('ai_consume_for', { p_uid: u.user_id });
    if (!quota?.ok) return quota?.reason === 'limit' ? MSG.limit(quota.limit) : MSG.plan(d.appUrl);
    data = await d.rpc('wa_data', { p_uid: u.user_id }) as Data;
    try { text = (await d.transcribe(m.audioId ?? '', vocabOf(data))).trim(); } // os nomes da pessoa ajudam a transcrição
    catch (e) { d.log?.('áudio', e instanceof Error ? e.message : e); return MSG.audioFail; }
    if (!text) return MSG.noAudio;
    heard = `🎙️ _"${text.length > 200 ? text.slice(0, 200) + '…' : text}"_\n\n`;
  }
  if (!text) return null;
  const context = (m.context ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const reply = await route(text, u, d, { fromAudio: m.kind === 'audio', noAI: !!o.noAI, hint: m.hint, data, context });
  return reply ? heard + reply : null;
}

const UNDO_RX = /^(desfazer|desfaz|desfaca|apagar|apaga|cancelar|cancela|apaga o ultimo|desfazer o ultimo|apagar o ultimo)( lancamento)?$/;
type RouteOpts = { fromAudio?: boolean; noAI?: boolean; hint?: Hint; data?: Data; context?: string };
async function route(text: string, u: WaUser, d: BotDeps, ro: RouteOpts = {}): Promise<string | null> {
  const n = norm(text).replace(/[!.?…]+$/g, '').trim(), today = d.today(), noAI = !!ro.noAI;
  let loaded = ro.data;
  const load = async () => loaded ??= await d.rpc('wa_data', { p_uid: u.user_id }) as Data;
  if (!/[\p{L}\p{N}]/u.test(n) || ACK.test(n)) return null; // "ok", "obrigado", só emoji: não precisa responder
  if (/^(oi|ola|ola robo|bom dia|boa tarde|boa noite|ajuda|menu|comandos|help|inicio)$/.test(n)) return MSG.help(u.name);
  if (UNDO_RX.test(n)) return d.onUndo ? (d.onUndo(), '↩️') : undo(u, d);
  if (/^(saldo|resumo|balanco|como estou|como to|meu mes|o mes|mes)$/.test(n)) return summary(u, d, today);
  if (/^(fatura|faturas|cartao|cartoes|fatura do cartao)$/.test(n)) return invoices(u, d, today);
  if (/^(contas|contas fixas|a pagar|a receber|vencimentos|boletos|contas do mes)$/.test(n)) return feats(u).bills === false ? 'As *contas fixas* estão desligadas nos Ajustes do app.' : bills(u, d, today);
  if (/^(metas|meta|limites|objetivos)$/.test(n)) return feats(u).goals === false ? 'As *metas* estão desligadas nos Ajustes do app.' : goals(u, d, today);

  // a frase anterior que ficou sem valor + esta ("parcela do pai" + "350")
  const full = ro.context ? `${ro.context}. ${text}` : text, fn = norm(full).replace(/[!.?…]+$/g, '').trim();
  let counted = !!ro.fromAudio; // o áudio já gastou 1 da cota de IA do dia
  if (ro.fromAudio || ro.context || !isQuestion(text)) {
    const q = parseQuick(full, today) as Quick | null;
    const simple = !ro.fromAudio && !ro.context;
    // "paguei aluguel" / "recebi mensalidade rogério": conta fixa do mês, sem precisar do valor
    if (simple && !q && PAY_VERB.test(fn) && feats(u).bills !== false) {
      const data = await load();
      const bill = findBill(text, /^(recebi|recebido)/.test(fn) ? 'in' : 'out', data, today);
      if (bill) return addEntry(u, d, { type: bill.rec.type, amount: Number(bill.rec.amount), installments: 1, date: today, description: bill.rec.name, investKind: null }, text, data);
      const done = findBill(text, /^(recebi|recebido)/.test(fn) ? 'in' : 'out', data, today, true);
      if (done) return `✅ *${done.rec.name}* já estava marcada como ${done.rec.type === 'in' ? 'recebida' : 'paga'} este mês.`;
    }
    // "paguei a fatura" / "paguei o cartão 1500": as compras do próprio cartão já contam (a não ser que a fatura seja
    // uma conta fixa cadastrada, ou que a pessoa não tenha cartão no app: aí é uma saída como outra qualquer)
    if ((/(^| )faturas?( |$)/.test(fn) && INVOICE_PAY.test(fn) && !/(^| )(pai|mae|irma|irmao|filho|filha|esposa|marido|sogra|sogro|amigo|amiga|namorada|namorado|tio|tia|avo)( |$)/.test(fn))
      || ownCardPayment(fn, await load())) {
      const data = await load();
      if (data.cards.some((c) => !c.archived) && (feats(u).bills === false || !(findBill(full, 'out', data, today) || findBill(full, 'out', data, today, true)))) return MSG.invoicePaid;
    }
    // frase simples e clara ("mercado 52,90", "josimar 30"): lança na hora, sem gastar IA
    if (simple && q && q.amount > 0) {
      const data = await load();
      if (confident(q, full, data, ro.hint)) return quickEntry(q, full, u, d, data, ro.hint);
    }
    if (d.understand) {
      // áudio e frase com dúvida: a IA entende com o contexto da pessoa
      if (!counted) {
        const quota = await d.rpc('ai_consume_for', { p_uid: u.user_id });
        if (!quota?.ok) {
          if (q && q.amount > 0) return quickEntry(q, full, u, d, await load(), ro.hint); // sem cota: o lançamento rápido resolve
          return quota?.reason === 'limit' ? MSG.limit(quota.limit) : MSG.plan(d.appUrl);
        }
        counted = true;
      }
      const data = await load();
      let plan: Plan | null = null, down = false;
      try { plan = toPlan(await d.understand(UNDERSTAND, contextOf(full, data, today, { hint: ro.hint, fromAudio: ro.fromAudio }), SCHEMA), today); }
      catch (e) { down = true; d.log?.('entender falhou', e instanceof Error ? e.message : e); }
      if (plan) {
        const r = await applyPlan(plan, full, u, d, data);
        if (r !== undefined) return r;
      } else if (q && q.amount > 0) return quickEntry(q, full, u, d, data, ro.hint); // IA fora do ar: lançamento rápido
      else if (down) return MSG.busy; // IA fora do ar e sem valor na frase: diz o que fazer (não fica pedindo para repetir)
    } else {
      // sem o "entender" (robô antigo): frase sem número pela IA de extração e o lançamento rápido
      let x = q;
      if (!x && (ro.fromAudio || ENTRY_VERB.test(fn))) {
        if (!counted) {
          const quota = await d.rpc('ai_consume_for', { p_uid: u.user_id });
          if (!quota?.ok) return quota?.reason === 'limit' ? MSG.limit(quota.limit) : MSG.plan(d.appUrl);
          counted = true;
        }
        x = await d.extract(full, today);
      }
      if (x && x.amount > 0) return quickEntry(x, full, u, d, await load(), ro.hint);
    }
  }
  return noAI ? null : askAI(text, u, d, today, counted);
}

// "paguei o cartão 1500", "pagamento do meu cartão", "paguei o Nubank": só palavras de pagar o cartão da própria pessoa
const OWN_CARD = new Set(['paguei', 'pago', 'paga', 'quitei', 'pagamento', 'pagar', 'o', 'a', 'do', 'da', 'de', 'meu', 'minha', 'cartao', 'credito', 'fatura', 'reais', 'real', 'r', 'hoje', 'ontem']);
function ownCardPayment(n: string, data: Data) {
  const words = n.replace(/[\d.,$]+/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.some((w) => /^(paguei|pago|paga|quitei|pagamento|pagar)$/.test(w))) return false;
  const cardWords = new Set(data.cards.filter((c) => !c.archived).flatMap((c) => norm(c.name).split(' ')));
  if (!words.some((w) => w === 'cartao' || w === 'fatura' || (cardWords.has(w) && w.length > 3))) return false;
  return words.every((w) => OWN_CARD.has(w) || cardWords.has(w));
}
// Frase que o lançamento rápido resolve sem dúvida: um valor só, sem parcela/fatura/pessoa da família, sem falar de
// cartão, e com o tipo e a categoria já conhecidos (pelas palavras, pelo histórico ou pela aba tocada).
const AMBIGUOUS = /(^| )(parcela|parcelas|prestacao|prestacoes|carne|financiamento|consorcio|fatura|emprestimo|emprestei|emprestou|emprestado|devolvi|devolveu|devolucao|estorno|reembolso|troco|metade|dividi|dividido|dividimos|cada|pai|mae|irma|irmao|filho|filha|esposa|marido|sogra|sogro|namorada|namorado|amigo|amiga|tio|tia|vo|avo)( |$)|\d+ ?\/ ?\d+|\d+ de \d+/;
export function confident(q: Quick, text: string, data: Data, hint?: Hint) {
  const n = norm(text);
  if (AMBIGUOUS.test(n)) return false;
  if (/(^| )(cartao|credito)( |$)/.test(n)) return false; // "no cartão" x "cartão da Luana" x "cartão Nubank": a IA decide com a lista de cartões
  if ((n.replace(/(^| )\d{1,2} ?x( |$)/g, ' ').match(/\d+(?:[.,]\d+)*/g) ?? []).length > 1) return false;
  const g = guessType(q, text, data, hint);
  if (g.by === 'padrao') return false;
  const kind = g.type === 'in' ? 'in' : g.type === 'invest' ? 'invest' : 'out';
  return !!(g.category_id || matchCategory(q.description, kind, data));
}
function quickEntry(q: Quick, text: string, u: WaUser, d: BotDeps, data: Data, hint?: Hint) {
  // tipo automático: a frase, o histórico da pessoa, as categorias dela e a aba do app (guessType, igual no app)
  const g = guessType(q, text, data, hint);
  const cat = g.category_id ? data.categories.find((c) => c.id === g.category_id) ?? null : null;
  const card = g.card_id ? data.cards.find((c) => c.id === g.card_id) ?? null : null;
  return addEntry(u, d, { ...q, type: g.type, investKind: g.investKind }, text, data, { cat, card });
}

// O que a IA entendeu → lançamentos, pedido do valor, desfazer ou pergunta livre (undefined)
async function applyPlan(plan: Plan, text: string, u: WaUser, d: BotDeps, data: Data): Promise<string | null | undefined> {
  if (plan.action === 'lancar') return launch(plan.items, text, u, d, data);
  if (plan.action === 'falta_valor') { d.onPending?.(text); return MSG.missing(plan.description, !!d.onPending); }
  if (plan.action === 'fatura') return MSG.invoicePaid;
  if (plan.action === 'desfazer') return d.onUndo ? (d.onUndo(), '↩️') : undo(u, d);
  return undefined; // consulta ou conversa: o Conselheiro responde
}
const cardByName = (name: string, data: Data) => {
  const n = norm(name);
  if (!n) return null;
  const list = data.cards.filter((c) => !c.archived);
  return list.find((c) => norm(c.name) === n) ?? list.find((c) => norm(c.name).includes(n) || n.includes(norm(c.name))) ?? null;
};
async function launch(items: Item[], text: string, u: WaUser, d: BotDeps, data: Data): Promise<string> {
  if (!u.access) return MSG.plan(d.appUrl);
  const today = d.today(), multi = items.length > 1, out: string[] = [];
  const bills = feats(u).bills === false ? [] : billsOfMonth(data.recurring, data.transactions, today.slice(0, 7), today);
  for (const it of items) {
    const kind = it.type === 'in' ? 'in' : it.type === 'invest' ? 'invest' : 'out';
    const mine = data.categories.filter((c) => c.kind === kind && !c.archived);
    const q: Quick = { type: it.type, amount: it.amount, installments: it.installments, date: it.date, description: it.description, investKind: it.investKind };
    // categoria: a que a IA escolheu da lista da pessoa > a que ela costuma usar para esse nome > a do ícone
    const named = it.category ? mine.find((c) => norm(c.name) === norm(it.category)) ?? null : null;
    const g = guessType(q, it.description, data, null), hist = g.catFor(kind);
    const cat = named || (hist ? mine.find((c) => c.id === hist) ?? null : null) || matchCategory(it.description, kind, data);
    const card = it.type === 'card' ? cardByName(it.card, data) || (g.card_id ? data.cards.find((c) => c.id === g.card_id && !c.archived) ?? null : null) : null;
    const bill = it.bill ? bills.find((b) => norm(b.rec.name) === norm(it.bill)) ?? null : null;
    const r = await addEntry(u, d, q, text, data, { cat, card, bill, brief: multi, pay: it.payment });
    if (r === MSG.fail || r === MSG.plan(d.appUrl)) return out.length ? out.join('\n\n') + '\n\n' + r : r;
    out.push(r);
  }
  if (multi) out.push(saldoLine(u, data, today) + '\n_Errou? Responda *desfazer*._');
  return out.join('\n\n');
}
function saldoLine(u: WaUser, data: Data, today: string) {
  const month = today.slice(0, 7), parts = cardParts(data.transactions, data.categories, data.cards);
  return `📊 Saldo de ${MONTHS[Number(month.slice(5, 7)) - 1]}: *${money(monthSums(data.transactions, parts, month, cardModeOf(u)).saldo)}*`;
}

// ---------------- lançar ----------------
type BillMatch = { rec: RecX; due: string; status: string };
type EntryOpts = { cat?: Category | null; card?: Card | null; bill?: BillMatch | null; head?: string; tail?: string; brief?: boolean; pay?: string };
const PAY_TXT: Record<string, string> = { pix: 'PIX', debito: 'débito', dinheiro: 'dinheiro', boleto: 'boleto', transferencia: 'transferência' };
async function addEntry(u: WaUser, d: BotDeps, q: Quick, original: string, loaded?: Data, o: EntryOpts = {}): Promise<string> {
  if (!u.access) return MSG.plan(d.appUrl);
  const data: Data = loaded ?? await d.rpc('wa_data', { p_uid: u.user_id });
  const today = d.today();
  let type = q.type, note = '';
  // é uma conta fixa do mês? A IA diz qual; sem ela, só com "paguei/recebi…" ou com o mesmo valor da conta
  // ("aluguel 900"), para uma compra comum ("mercado 50") não virar pagamento da conta "Mercado do mês"
  let bill: BillMatch | null = null;
  if (o.bill && feats(u).bills !== false) {
    if (o.bill.status === 'paid') return `✅ *${o.bill.rec.name}* já estava marcada como ${o.bill.rec.type === 'in' ? 'recebida' : 'paga'} este mês.`;
    bill = o.bill;
  } else {
    bill = type !== 'invest' && feats(u).bills !== false ? findBill(q.description || original, type === 'in' ? 'in' : 'out', data, today) : null;
    if (bill && !(PAY_VERB.test(norm(original)) || Math.abs(Number(bill.rec.amount) - q.amount) < 0.005)) bill = null;
  }
  if (bill) type = bill.rec.type;
  const billCard = bill?.rec.card_id ? data.cards.find((c) => c.id === bill!.rec.card_id && !c.archived) : null;
  const card = type === 'card' ? billCard || (o.card && !o.card.archived ? o.card : null) || defaultCard(data) : null;
  if (type === 'card' && !card) { type = 'out'; note = '\n_Você não tem cartão cadastrado: lancei como saída à vista. Cadastre o cartão no app._'; }
  const kind = type === 'in' ? 'in' : type === 'invest' ? 'invest' : 'out';
  const billCat = bill?.rec.category_id ? data.categories.find((c) => c.id === bill!.rec.category_id && c.kind === kind) : null;
  const cat = billCat || (o.cat && o.cat.kind === kind ? o.cat : null) || matchCategory(q.description, kind, data) || othersOf(kind, data);
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
  data.transactions.unshift({ ...tx, ...(r.tx ?? {}) } as TxR & { id?: string }); // os próximos cálculos já contam com ele

  const lines: string[] = o.head ? [o.head] : [];
  const v = `*${money(tx.amount)}*`, how = type === 'out' && o.pay && PAY_TXT[o.pay] ? ` (${PAY_TXT[o.pay]})` : '';
  if (type === 'in') lines.push(`💰 *Entrada* de ${v}`);
  else if (type === 'out') lines.push(`💸 *Saída* de ${v}${how}`);
  else if (type === 'invest') lines.push(tx.invest_kind === 'resgate' ? `📤 *Resgate* de ${v}` : `📈 *Aporte* de ${v}`);
  else {
    const parts = splitInstallments(tx.amount, tx.installments);
    lines.push(`💳 *${card!.name}*: ${v}${tx.installments > 1 ? ` em ${tx.installments}x de ${money(parts[0])}` : ''}`);
    lines.push(`🧾 ${tx.installments > 1 ? '1ª parcela na' : 'Entra na'} fatura de ${monthShort(invoiceMonth(tx.date, card!))}`);
  }
  lines.push(`🏷️ ${cat?.name ?? 'Sem categoria'} · 📅 ${dayLabel(tx.date, today)}${tx.description && norm(tx.description) !== norm(cat?.name ?? '') ? ' · ' + tx.description : ''}`);
  if (bill) lines.push(`🗓️ Conta fixa *${bill.rec.name}* marcada como ${bill.rec.type === 'in' ? 'recebida' : 'paga'} em ${MONTHS[Number(today.slice(5, 7)) - 1]}.`);
  if (o.brief) return lines.join('\n') + note;

  // saldo do mês já com o lançamento + aviso de limite da categoria
  const month = today.slice(0, 7), txs = data.transactions;
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
  if (o.tail) lines.push(o.tail);
  lines.push('_Errou? Responda *desfazer*._');
  return lines.join('\n') + note;
}

// ---------------- comprovante por foto ----------------
// O tipo vem do comprovante: compra ou PIX enviado = saída (no crédito vai para o cartão), PIX recebido = entrada,
// aplicação = investimento. A legenda ("recebi") e a aba tocada no app mandam mais. Num PIX sem o nome da pessoa,
// quem costuma pagar a ela (histórico) vira entrada. A foto não é guardada: só o lançamento.
const PAY_LABEL: Record<string, string> = { credito: 'crédito', debito: 'débito', pix: 'PIX', dinheiro: 'dinheiro', boleto: 'boleto', outro: '' };
async function receipt(m: Incoming, u: WaUser, d: BotDeps): Promise<string> {
  if (!u.access) return MSG.plan(d.appUrl);
  if (!m.mediaId) return MSG.noReceipt;
  const quota = await d.rpc('ai_consume_for', { p_uid: u.user_id });
  if (!quota?.ok) return quota?.reason === 'limit' ? MSG.limit(quota.limit) : MSG.plan(d.appUrl);
  const data: Data = await d.rpc('wa_data', { p_uid: u.user_id });
  const today = d.today(), caption = (m.text ?? '').trim().slice(0, 300), hint = m.hint;
  const names = (kind: string) => catsOfKind(kind, data).map((c) => c.name);
  const r = await d.readReceipt(m.mediaId, today, { out: names('out'), in: names('in') }, caption, u.name || '');
  if (r === 'grande') return MSG.bigImage;
  if (r === 'tipo') return MSG.unsupported;
  if (!r) return MSG.noReceipt;
  // a legenda manda: "recebi", "uber", "no cartão", "almoço com cliente"…
  const fromCaption = caption ? parseQuick(caption, today) as Quick | null : null;
  const exp = caption ? explicitType(caption) : null;
  const ev = guessType({ type: 'out', amount: r.amount, installments: 1, date: r.date, description: r.description, investKind: null }, r.description, data, null);
  let dir: 'in' | 'out' | 'invest' = r.kind === 'entrada' ? 'in' : r.kind === 'investimento' ? 'invest' : 'out';
  if (exp) dir = (exp === 'card' ? 'out' : exp) as 'in' | 'out' | 'invest';
  else if (hint?.sure) dir = hint.type === 'card' ? 'out' : hint.type;
  else if (dir === 'out' && r.payment === 'pix') {
    const v = ev.votes, tot = v.in + v.out + v.invest;
    if (v.in >= 0.75 && v.in >= 0.8 * tot) dir = 'in';
  }
  let type: string = dir;
  if (dir === 'out') {
    const cash = /(^| )(pix|debito|dinheiro|especie|boleto)( |$)/.test(norm(caption));
    if (exp === 'card' || (hint?.sure && hint.type === 'card') || (r.payment === 'credito' && !cash)) type = 'card';
    else if (r.payment === 'outro' && !cash && !(hint?.sure && hint.pay) && ev.type === 'card') type = 'card';
  }
  const cardOf = (id?: string | null) => id ? data.cards.find((c) => c.id === id && !c.archived) ?? null : null;
  const card = type === 'card' ? cardOf(hint?.type === 'card' ? hint.card : null) || cardOf(ev.card_id) : null;
  const q: Quick = {
    type, amount: r.amount, installments: type === 'card' ? Math.max(r.installments, fromCaption?.installments ?? 1) : 1,
    date: r.date, description: (r.description || fromCaption?.description || '').slice(0, 60),
    investKind: dir === 'invest' ? (/(^| )(resgate|resgatei)( |$)/.test(norm(caption + ' ' + r.description)) ? 'resgate' : 'aporte') : null,
  };
  // categoria: a da legenda > a que a pessoa costuma usar para esse nome > a que a IA escolheu da lista > a do nome
  const byId = (id: string | null) => id ? data.categories.find((c) => c.id === id) ?? null : null;
  const named = r.category ? data.categories.find((c) => c.kind === dir && !c.archived && norm(c.name) === norm(r.category)) ?? null : null;
  const cat = (caption ? matchCategory(caption, dir, data) : null) || byId(ev.catFor(dir, 1)) || named || byId(ev.catFor(dir));
  const how = PAY_LABEL[r.payment] ? ` (${PAY_LABEL[r.payment]})` : '';
  const dup = data.transactions.some((t) => t.date === q.date && Math.abs(Number(t.amount) - q.amount) < 0.005 && (t.type === q.type || (q.type !== 'in' && q.type !== 'invest' && t.type !== 'in' && t.type !== 'invest')));
  return addEntry(u, d, q, caption || q.description, data, {
    cat, card, head: `🧾 Li o comprovante${how}:`,
    tail: dup ? '⚠️ Já havia um lançamento com esse valor nesse dia. Se foi o mesmo comprovante, responda *desfazer*.' : undefined,
  });
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
