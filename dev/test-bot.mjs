// Robô do WhatsApp sem internet: banco falso em memória (imita as funções wa_* do Supabase), Meta e Groq falsas.
// Confere conectar por código, lançar (texto e áudio), conta fixa, desfazer, consultas, IA, limites, assinatura da Meta
// e que as cópias geradas (smart.ts/context.ts) estão iguais à fonte.
// Uso: node --experimental-strip-types --no-warnings test-bot.mjs   (npm run test:bot)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { answer, matchCategory, MSG } from './supabase/functions/whatsapp/bot.ts';
import { handle, messagesOf, resetPhoneCache, signatureOk } from './supabase/functions/whatsapp/handler.ts';
import { groq, toQuick } from './supabase/functions/whatsapp/groq.ts';

const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('❌', msg); } };
const has = (txt, part, msg) => ok(typeof txt === 'string' && txt.replace(/ /g, ' ').includes(part), `${msg}\n   esperado conter: ${part}\n   veio: ${JSON.stringify(txt)}`);
const TODAY = '2026-10-09', APP = 'https://iptvquantic.github.io/meu-caixa/app.html';
const ANA = 'a0000000-0000-4000-8000-000000000001', BIA = 'b0000000-0000-4000-8000-000000000002', PHONE = '5522991110001';

// ---------- cópias geradas em dia ----------
const { FILES, FN } = require('./sync-bot.js');
for (const [rel, gen] of Object.entries(FILES)) ok(readFileSync(`${FN}/${rel}`, 'utf8') === gen(), `cópia desatualizada: ${rel} (rode: node sync-bot.js)`);

// ---------- banco falso ----------
function fakeDb() {
  const cat = (id, kind, name, icon, legacy_key, sort = 1) => ({ id, kind, name, icon, legacy_key, archived: false, sort, color: null });
  const db = {
    users: { [ANA]: { user_id: ANA, name: 'Ana Souza', access: true, plan: 'trial', settings: {} }, [BIA]: { user_id: BIA, name: 'Bia Lima', access: true, plan: 'trial', settings: {} } },
    links: {}, codes: { '12345678': ANA, '87654321': BIA }, calls: [], quota: { [ANA]: 0 }, quotaLimit: 40, lastTx: null, seq: 0,
    data: {
      categories: [
        cat('c-merc', 'out', 'Mercado', 'i:shopping-cart', 'mercado', 2), cat('c-transp', 'out', 'Transporte', 'i:car', 'transporte', 3),
        cat('c-farm', 'out', 'Farmácia', 'i:pill', 'farmacia', 8), cat('c-mor', 'out', 'Moradia', 'i:house', 'moradia', 6),
        cat('c-edu', 'out', 'Educação', 'i:graduation-cap', 'educacao', 11), cat('c-out', 'out', 'Outros', 'i:tag', 'outros', 99),
        cat('c-vend', 'in', 'Vendas', 'i:shopping-bag', 'vendas', 1), cat('c-mens', 'in', 'Mensalidades', '💈', null, 5), cat('c-inout', 'in', 'Outros', 'i:banknote', 'outros', 99),
        cat('c-tes', 'invest', 'Tesouro Direto', 'i:vault', 'tesouro', 2), cat('c-invout', 'invest', 'Outros', 'i:trending-up', 'outros', 99),
      ],
      cards: [{ id: 'k-nu', name: 'Nubank', closing_day: 5, due_day: 12, archived: false }],
      recurring: [
        { id: 'r-alug', type: 'out', name: 'Aluguel', amount: 900, day: 5, start_month: '2026-01', end_month: null, active: true, category_id: 'c-mor', card_id: null },
        { id: 'r-rog', type: 'in', name: 'Mensalidade Rogério', amount: 45, day: 10, start_month: '2026-01', end_month: null, active: true, category_id: 'c-mens', card_id: null },
        { id: 'r-merc', type: 'out', name: 'Mercado do mês', amount: 600, day: 20, start_month: '2026-01', end_month: null, active: true, category_id: 'c-merc', card_id: null },
      ],
      goals: [
        { kind: 'budget', name: null, amount: 100, category_id: 'c-merc', deadline: null, start_date: '2026-01-01', archived: false },
        { kind: 'income', name: null, amount: 5000, category_id: null, deadline: null, start_date: '2026-01-01', archived: false },
        { kind: 'save', name: 'Reserva', amount: 10000, category_id: null, deadline: '2027-12-31', start_date: '2026-01-01', archived: false },
      ],
      transactions: [
        { id: 't1', type: 'in', amount: 3000, date: '2026-10-02', description: 'Vendas da semana', category_id: 'c-vend', card_id: null, installments: 1, invest_kind: null, recurring_id: null, recurring_month: null },
        { id: 't2', type: 'out', amount: 60, date: '2026-10-03', description: 'Mercado', category_id: 'c-merc', card_id: null, installments: 1, invest_kind: null, recurring_id: null, recurring_month: null },
        { id: 't3', type: 'card', amount: 1200, date: '2026-09-20', description: 'Curso', category_id: 'c-edu', card_id: 'k-nu', installments: 3, invest_kind: null, recurring_id: null, recurring_month: null },
      ],
    },
  };
  const rpc = async (fn, a) => {
    db.calls.push([fn, a]);
    const clone = (x) => JSON.parse(JSON.stringify(x));
    switch (fn) {
      case 'wa_user': { const uid = db.links[a.p_phone]; return uid ? clone(db.users[uid]) : null; }
      case 'wa_link_finish': {
        if (a.p_phone === '5511999990009') return { ok: false, reason: 'rate' };
        const uid = db.codes[a.p_code]; if (!uid) return { ok: false, reason: 'code' };
        if (db.links[a.p_phone] && db.links[a.p_phone] !== uid) return { ok: false, reason: 'in_use' }; // número de outra conta não é tomado
        delete db.codes[a.p_code]; db.links[a.p_phone] = uid; return { ok: true, user_id: uid, name: db.users[uid].name };
      }
      case 'wa_data': return clone(db.data);
      case 'ai_consume_for': { db.quota[a.p_uid] = (db.quota[a.p_uid] ?? 0) + 1; return db.users[a.p_uid].access ? (db.quota[a.p_uid] > db.quotaLimit ? { ok: false, reason: 'limit', limit: db.quotaLimit } : { ok: true }) : { ok: false, reason: 'plan' }; }
      case 'wa_add_tx': {
        if (!db.users[a.p_uid].access) return { ok: false, reason: 'plan' };
        const t = { ...a.p_tx };
        if (t.category_id && !db.data.categories.some((c) => c.id === t.category_id)) throw new Error('categoria inválida');
        if (t.recurring_id && db.data.transactions.some((x) => x.recurring_id === t.recurring_id && x.recurring_month === t.recurring_month)) throw new Error('duplicate key value violates unique constraint "tx_recurring_once" (23505)');
        const row = { id: 'n' + (++db.seq), ...t };
        db.data.transactions.unshift(row); db.lastTx = row.id; return { ok: true, tx: clone(row) };
      }
      case 'wa_undo_target': { // só aponta; quem apaga é a função (delete_tx abaixo)
        if (!db.users[a.p_uid].access) return { ok: false, reason: 'plan' };
        const row = db.lastTx && db.data.transactions.find((t) => t.id === db.lastTx);
        return row ? { ok: true, tx: clone(row) } : { ok: false, reason: 'nada' };
      }
      case 'delete_tx': { // imita o delete da função "whatsapp" (id + dono); ao apagar, last_tx_id vira nulo
        const i = db.data.transactions.findIndex((t) => t.id === a.id);
        if (i < 0 || a.uid !== ANA) return false;
        db.data.transactions.splice(i, 1); if (db.lastTx === a.id) db.lastTx = null; return true;
      }
      default: throw new Error('rpc inesperada: ' + fn);
    }
  };
  return { db, rpc };
}
function botDeps(rpc, over = {}) {
  const asked = [], extracted = [], heard = [];
  const deps = {
    rpc, today: () => TODAY, appUrl: APP, deleteTx: (uid, id) => rpc('delete_tx', { uid, id }),
    ask: async (system, q) => { asked.push({ system, q }); return 'Resposta da IA: você pode gastar com cuidado.'; },
    extract: async (text) => { extracted.push(text); return /quarenta/.test(text) ? { type: 'out', amount: 40, installments: 1, date: TODAY, description: 'Mercado', investKind: null } : null; },
    transcribe: async (id) => { heard.push(id); return { a1: 'Gastei 40 reais de Uber ontem.', a2: 'gastei quarenta reais no mercado', a3: '' }[id] ?? ''; },
    ...over,
  };
  return { deps, asked, extracted, heard };
}
const lastAdd = (db) => [...db.calls].reverse().find(([fn]) => fn === 'wa_add_tx')?.[1]?.p_tx;
const count = (db, fn) => db.calls.filter(([f]) => f === fn).length;

// ---------- conectar ----------
{
  const { db, rpc } = fakeDb(); const { deps } = botDeps(rpc);
  has(await answer({ phone: PHONE, kind: 'text', text: 'oi', lastHour: 1 }, deps), 'Ajustes → WhatsApp → Conectar', 'número desconhecido recebe o caminho para conectar');
  has(await answer({ phone: PHONE, kind: 'text', text: 'oi', lastHour: 1 }, deps), APP, '... com o link do app');
  ok(await answer({ phone: PHONE, kind: 'text', text: 'oi', lastHour: 5 }, deps) === null, 'quem insiste sem conectar não recebe resposta a cada mensagem');
  ok(await answer({ phone: PHONE, kind: 'audio', audioId: 'a1', lastHour: 1 }, deps) !== null && count(db, 'ai_consume_for') === 0, 'áudio de número desconhecido não gasta transcrição');
  has(await answer({ phone: PHONE, kind: 'text', text: 'MC 00000000', lastHour: 1 }, deps), 'Código inválido ou vencido', 'código errado');
  has(await answer({ phone: '5511999990009', kind: 'text', text: 'MC 12345678', lastHour: 1 }, deps), 'Muitas tentativas', 'muitas tentativas');
  const w = await answer({ phone: PHONE, kind: 'text', text: 'MC 12345678', lastHour: 1 }, deps);
  has(w, 'Pronto, Ana!', 'código certo conecta e cumprimenta pelo primeiro nome');
  ok(db.links[PHONE] === ANA, 'número ligado à conta da Ana');
  has(w, 'mercado 52,90', 'boas-vindas já ensinam a lançar');
  // já conectado: a mensagem que é só um código reconecta ou é recusada; nunca vira lançamento
  has(await answer({ phone: PHONE, kind: 'text', text: '87654321', lastHour: 1 }, deps), 'já está conectado a outra conta', 'código de outra conta num número já conectado: recusado (desconectar antes)');
  ok(db.links[PHONE] === ANA && !lastAdd(db), 'número continua na conta da Ana e nada é lançado');
  has(await answer({ phone: PHONE, kind: 'text', text: '11112222', lastHour: 1 }, deps), 'Código inválido', 'conectado: 8 dígitos sozinhos são código, nunca R$ 11 milhões');
  ok(!lastAdd(db), 'nada lançado com o número de 8 dígitos');
  db.codes['55556666'] = ANA;
  has(await answer({ phone: PHONE, kind: 'text', text: 'MC 55556666', lastHour: 1 }, deps), 'Pronto, Ana!', 'reconectar com código novo da mesma conta');
  has(await answer({ phone: '5522991110009', kind: 'text', text: 'MC12345678', lastHour: 1 }, deps), 'Código inválido', 'código já usado não conecta outro número');
}

// ---------- lançar ----------
const linked = () => { const f = fakeDb(); f.db.links[PHONE] = ANA; return f; };
const msg = (text, extra = {}) => ({ phone: PHONE, kind: 'text', text, lastHour: 1, ...extra });
{
  const { db, rpc } = linked(); const { deps, asked } = botDeps(rpc);
  let r = await answer(msg('mercado 52,90'), deps), t = lastAdd(db);
  ok(t && t.type === 'out' && t.amount === 52.9 && t.date === TODAY && t.category_id === 'c-merc' && t.recurring_id === null, 'mercado 52,90 → saída na categoria Mercado, hoje: ' + JSON.stringify(t));
  has(r, '💸 *Saída* de *R$ 52,90*', 'confirma a saída'); has(r, '🏷️ Mercado · 📅 hoje', 'mostra categoria e data');
  has(r, 'Saldo de outubro: *R$ 2.487,10*', 'saldo do mês já com o lançamento (3000 − 60 − 52,90 − parcela 400)');
  has(r, '🚨 Limite de Mercado: 113% (R$ 112,90 de R$ 100,00)', 'avisa que passou do limite da categoria');
  has(r, 'desfazer', 'ensina a desfazer');
  ok(asked.length === 0 && count(db, 'ai_consume_for') === 0, 'lançamento por texto não gasta IA');

  r = await answer(msg('desfazer'), deps);
  has(r, '↩️ Apaguei: Saída de R$ 52,90 (Mercado)', 'desfazer apaga o último');
  ok(!db.data.transactions.some((x) => x.amount === 52.9), 'lançamento removido');
  ok(JSON.stringify(db.calls.find(([f]) => f === 'delete_tx')?.[1]) === JSON.stringify({ uid: ANA, id: 'n1' }), 'desfazer apaga pelo id indicado pelo banco e pelo dono');
  has(await answer(msg('desfazer'), deps), 'Não há lançamento recente', 'nada mais para desfazer');

  r = await answer(msg('notebook 3.600 12x'), deps); t = lastAdd(db);
  ok(t.type === 'card' && t.card_id === 'k-nu' && t.installments === 12 && t.category_id === 'c-edu', 'parcelado vai para o cartão: ' + JSON.stringify(t));
  has(r, '💳 *Nubank*: *R$ 3.600,00* em 12x de R$ 300,00', 'mostra as parcelas');
  has(r, '1ª parcela na fatura de nov/2026', 'compra depois do fechamento cai na próxima fatura');

  r = await answer(msg('uber 23 ontem'), deps); t = lastAdd(db);
  ok(t.date === '2026-10-08' && t.category_id === 'c-transp', 'uber 23 ontem → Transporte, ontem');
  has(r, '📅 ontem', 'mostra "ontem"');

  r = await answer(msg('recebi 45 mensalidade do joão'), deps); t = lastAdd(db);
  ok(t.type === 'in' && t.category_id === 'c-mens', 'categoria própria encontrada pelo nome (Mensalidades): ' + t.category_id);
  r = await answer(msg('investi 500 no tesouro'), deps); t = lastAdd(db);
  ok(t.type === 'invest' && t.invest_kind === 'aporte' && t.category_id === 'c-tes', 'aporte no Tesouro');
  has(r, '📈 *Aporte* de *R$ 500,00*', 'confirma o aporte');
  r = await answer(msg('vendi 1.250,00'), deps); t = lastAdd(db);
  ok(t.type === 'in' && t.amount === 1250, 'venda com milhar');
  r = await answer(msg('pastel 12'), deps); t = lastAdd(db);
  ok(t.category_id === 'c-out' || t.category_id === 'c-merc' || t.category_id, 'sem categoria clara cai em uma categoria (Outros ou sugerida)');
}
{
  const { db, rpc } = linked(); db.data.cards = []; const { deps } = botDeps(rpc);
  const r = await answer(msg('tv 2.400 10x'), deps), t = lastAdd(db);
  ok(t.type === 'out' && t.installments === 1 && t.card_id === null, 'sem cartão cadastrado: lança como saída à vista');
  has(r, 'não tem cartão cadastrado', 'avisa que falta cadastrar o cartão');
}

// ---------- contas fixas ----------
{
  const { db, rpc } = linked(); const { deps } = botDeps(rpc);
  let r = await answer(msg('paguei aluguel'), deps), t = lastAdd(db);
  ok(t.recurring_id === 'r-alug' && t.recurring_month === '2026-10' && t.amount === 900 && t.category_id === 'c-mor', '"paguei aluguel" usa valor e categoria da conta fixa');
  has(r, 'Conta fixa *Aluguel* marcada como paga em outubro', 'confirma a conta paga');
  r = await answer(msg('paguei aluguel'), deps);
  has(r, 'já estava', 'conta já paga não é paga 2x');
  r = await answer(msg('mercado 50'), deps); t = lastAdd(db);
  ok(t.recurring_id === null, 'compra comum não vira pagamento da conta "Mercado do mês"');
  r = await answer(msg('mercado do mês 600'), deps); t = lastAdd(db);
  ok(t.recurring_id === 'r-merc', 'mesmo valor da conta fixa → marca como paga');
  r = await answer(msg('recebi mensalidade rogério'), deps); t = lastAdd(db);
  ok(t.type === 'in' && t.recurring_id === 'r-rog' && t.amount === 45, '"recebi mensalidade rogério" marca a conta a receber');
  r = await answer(msg('contas'), deps);
  has(r, '🗓️ *Contas de outubro*', 'lista as contas do mês'); has(r, '✅ Aluguel · R$ 900,00 · dia 5 (paga)', 'mostra a paga');
  has(r, '✅ Mensalidade Rogério · R$ 45,00 · dia 10 (recebida)', 'mostra a recebida');
}
{
  const { rpc } = linked(); const { deps } = botDeps(rpc);
  const r = await answer(msg('contas'), deps);
  has(r, '⚠️ Aluguel · R$ 900,00 · dia 5 (atrasada)', 'conta vencida aparece como atrasada');
  has(r, '🔜 Mensalidade Rogério · R$ 45,00 · dia 10 (a receber)', 'conta a receber futura');
  has(r, 'paguei aluguel', 'ensina a marcar');
}

// ---------- consultas ----------
{
  const { rpc } = linked(); const { deps } = botDeps(rpc);
  let r = await answer(msg('Saldo'), deps);
  has(r, '📊 *Outubro de 2026*', 'saldo: título do mês'); has(r, '💰 Entradas: R$ 3.000,00', 'entradas'); has(r, '💸 Saídas: R$ 60,00', 'saídas');
  has(r, '💳 Cartão (fatura): R$ 400,00', 'parcela do mês no cartão'); has(r, '*Saldo: R$ 2.540,00*', 'saldo');
  has(r, 'A pagar ainda: R$ 1.500,00 (2 contas)', 'contas a pagar pendentes');
  r = await answer(msg('fatura'), deps);
  has(r, '*Nubank* (fecha dia 5, vence dia 12)', 'fatura por cartão'); has(r, '• outubro (este mês): R$ 400,00', 'fatura do mês'); has(r, '• dezembro: R$ 400,00', 'próximas faturas');
  r = await answer(msg('metas'), deps);
  has(r, '🛒 Limite Mercado: R$ 60,00 de R$ 100,00 (60%)', 'meta de limite'); has(r, '💼 Faturamento: R$ 3.000,00 de R$ 5.000,00 (60%)', 'meta de faturamento');
  has(r, '🐷 Reserva: R$ 0,00 de R$ 10.000,00 (0%) · até 31/12/2027', 'objetivo');
  has(await answer(msg('ajuda'), deps), 'Para consultar', 'ajuda');
  ok(await answer(msg('ok'), deps) === null && await answer(msg('obrigado!'), deps) === null && await answer(msg('👍'), deps) === null, '"ok", "obrigado" e emoji não geram resposta nem gastam IA');
}

// ---------- IA ----------
{
  const { db, rpc } = linked(); const { deps, asked } = botDeps(rpc);
  let r = await answer(msg('quanto posso gastar até o fim do mês?'), deps);
  ok(r === 'Resposta da IA: você pode gastar com cuidado.' && asked.length === 1 && count(db, 'ai_consume_for') === 1, 'pergunta vai para a IA e gasta 1 da cota');
  has(asked[0].system, 'DADOS REAIS de Ana Souza', 'IA recebe os números do usuário'); has(asked[0].system, 'NUNCA recomende pagar só o mínimo', 'regra do cartão no prompt');
  has(asked[0].system, 'CONTAS FIXAS DO MÊS: pagar Aluguel', 'IA vê as contas fixas');
  r = await answer(msg('posso gastar 300 hoje'), deps);
  ok(asked.length === 2 && !lastAdd(db), '"posso gastar 300" é pergunta, não lançamento');
  db.quotaLimit = 2;
  has(await answer(msg('e se eu cortar o mercado?'), deps), 'perguntas/áudios de hoje', 'limite diário da IA');
  ok(asked.length === 2, 'acima do limite não chama a IA');
}
{
  const { db, rpc } = linked(); db.users[ANA].settings = { features: { bills: false, goals: false } }; const { deps, asked } = botDeps(rpc);
  await answer(msg('como estou indo?'), deps);
  ok(!asked[0].system.includes('pagar Aluguel') && asked[0].system.includes('CONTAS FIXAS DO MÊS: nenhuma'), 'contas fixas desligadas: IA não usa');
  has(await answer(msg('contas'), deps), 'desligadas', 'comando "contas" respeita o desligado');
  const r = await answer(msg('paguei aluguel 900'), deps);
  ok(lastAdd(db).recurring_id === null, 'contas desligadas: não marca conta fixa');
}

// ---------- áudio ----------
{
  const { db, rpc } = linked(); const { deps, heard, extracted } = botDeps(rpc);
  let r = await answer({ phone: PHONE, kind: 'audio', audioId: 'a1', lastHour: 1 }, deps), t = lastAdd(db);
  has(r, '🎙️ _"Gastei 40 reais de Uber ontem."_', 'mostra o que entendeu do áudio');
  ok(t.amount === 40 && t.date === '2026-10-08' && t.category_id === 'c-transp' && heard[0] === 'a1', 'áudio vira lançamento (Uber, ontem)');
  ok(count(db, 'ai_consume_for') === 1, 'áudio gasta 1 da cota');
  r = await answer({ phone: PHONE, kind: 'audio', audioId: 'a2', lastHour: 1 }, deps); t = lastAdd(db);
  ok(t.amount === 40 && t.category_id === 'c-merc' && extracted.length === 1 && count(db, 'ai_consume_for') === 2, 'áudio sem número ("quarenta") a IA extrai, sem gastar cota 2x');
  has(await answer({ phone: PHONE, kind: 'audio', audioId: 'a3', lastHour: 1 }, deps), 'Não consegui entender o áudio', 'áudio vazio');
  r = await answer(msg('gastei quarenta no mercado'), deps);
  ok(extracted.length === 2 && lastAdd(db).amount === 40 && count(db, 'ai_consume_for') === 4, 'texto sem número com "gastei" também é extraído (gasta 1 da cota)');
}

// ---------- plano, robô desligado, tipos e excesso ----------
{
  const { db, rpc } = linked(); db.users[ANA].access = false; const { deps } = botDeps(rpc);
  has(await answer(msg('mercado 10'), deps), 'Seu plano venceu', 'plano vencido não lança'); ok(!lastAdd(db), 'nada gravado');
  has(await answer(msg('saldo'), deps), '*Saldo: R$ 2.540,00*', 'plano vencido ainda consulta');
  has(await answer(msg('desfazer'), deps), 'Seu plano venceu', 'plano vencido não apaga'); ok(count(db, 'delete_tx') === 0, 'nenhum delete com plano vencido');
}
{
  const { db, rpc } = linked(); db.users[ANA].settings = { features: { whatsapp: false } }; const { deps } = botDeps(rpc);
  has(await answer(msg('mercado 10'), deps), 'robô está desligado', 'robô desligado nos Ajustes');
}
{
  const { rpc } = linked(); const { deps } = botDeps(rpc);
  has(await answer({ phone: PHONE, kind: 'image', lastHour: 1 }, deps), 'texto* e *áudio', 'foto: explica o que entende');
  ok(await answer({ phone: PHONE, kind: 'other', lastHour: 1 }, deps) === null, 'figurinha/reação: sem resposta');
  has(await answer(msg('mercado 10', { lastHour: 61 }), deps), 'Muitas mensagens', 'excesso: avisa uma vez');
  ok(await answer(msg('mercado 10', { lastHour: 62 }), deps) === null, 'excesso: depois fica quieto');
}
ok(matchCategory('Drogasil', 'out', fakeDb().db.data)?.id === 'c-farm', 'Drogasil → Farmácia (mesma regra do app)');

// ---------- Groq: extrair, conversar, transcrever ----------
{
  const q = (o) => toQuick(JSON.stringify(o), TODAY);
  ok(JSON.stringify(q({ lancamento: true, tipo: 'saida', valor: 52.9, parcelas: 1, descricao: 'mercado', data: '2026-10-08' })) === JSON.stringify({ type: 'out', amount: 52.9, installments: 1, date: '2026-10-08', description: 'Mercado', investKind: null }), 'extração válida');
  ok(q({ lancamento: false }) === null && toQuick('não sei', TODAY) === null && q({ lancamento: true, valor: 0 }) === null, 'sem lançamento/valor → nada');
  ok(q({ lancamento: true, tipo: 'cartão', valor: '1.200,50', parcelas: 99 }).installments === 48 && q({ lancamento: true, tipo: 'cartão', valor: '1.200,50' }).amount === 1200.5, 'cartão com acento, valor em texto, parcelas limitadas');
  ok(q({ lancamento: true, tipo: 'resgate', valor: 10 }).investKind === 'resgate' && q({ lancamento: true, tipo: 'saida', valor: 10, data: '2031-01-01' }).date === TODAY, 'resgate; data absurda vira hoje');
  ok(toQuick('```json\n{"lancamento": true, "tipo": "entrada", "valor": 300}\n```', TODAY)?.type === 'in', 'JSON dentro de bloco de código');

  const sent = [];
  const fake = (responses) => async (url, init) => { sent.push({ url, init }); const r = responses.shift(); return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status }); };
  let g = groq('k', fake([{ status: 500, body: {} }, { status: 200, body: { choices: [{ message: { content: 'oi' } }] } }]));
  ok(await g.ask('s', 'q') === 'oi' && JSON.parse(sent[1].init.body).model === 'llama-3.3-70b-versatile', 'modelo reserva quando o principal falha');
  g = groq('k', fake([{ status: 401, body: {} }]));
  let threw = false; try { await g.ask('s', 'q'); } catch { threw = true; } ok(threw && sent.length === 3, 'chave errada: para na hora');
  sent.length = 0;
  g = groq('k', fake([{ status: 200, body: { choices: [{ message: { content: '{"lancamento": true, "tipo": "saida", "valor": 40, "descricao": "Uber"}' } }] } }]));
  const ex = await g.extract('gastei quarenta no uber', TODAY), body = JSON.parse(sent[0].init.body);
  ok(ex.amount === 40 && body.response_format?.type === 'json_object' && body.reasoning_effort === 'low' && body.temperature === 0, 'extração pede JSON, esforço baixo, temperatura 0');
  sent.length = 0;
  g = groq('k', fake([{ status: 200, body: { text: ' mercado 52,90 ' } }]));
  const tx = await g.transcribe(new Blob(['x'], { type: 'audio/ogg' }), 'audio.ogg'), form = sent[0].init.body;
  ok(tx === 'mercado 52,90' && form.get('model') === 'whisper-large-v3-turbo' && form.get('language') === 'pt' && sent[0].url.endsWith('/audio/transcriptions'), 'transcrição: Whisper turbo em português');
}

// ---------- porta de entrada (Meta) ----------
const SECRET = 'segredo-do-app', PHONE_ID = '1112223334';
const cfg = { verifyToken: 'mc-verifica', appSecret: SECRET, phoneId: PHONE_ID, token: 'tok', apiVersion: 'v24.0', allowed: ['https://iptvquantic.github.io'] };
const sign = (body) => 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');
const payload = (msgs, phoneId = PHONE_ID, extra = {}) => JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'w', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: phoneId }, messages: msgs, ...extra } }] }] });
function handlerDeps(over = {}) {
  resetPhoneCache();
  const graphCalls = [], botCalls = [], seen = new Set();
  const d = {
    cfg, log: () => {},
    rpc: async (fn, a) => { if (fn !== 'wa_seen') throw new Error(fn); const isNew = !seen.has(a.p_id); seen.add(a.p_id); return { new: isNew, last_hour: 1 }; },
    bot: async (m) => { botCalls.push(m); return 'resposta para ' + (m.text ?? m.kind); },
    graph: async (path, init) => { graphCalls.push({ path, init, body: init?.body ? JSON.parse(init.body) : null }); return path.includes('fields=display_phone_number') ? new Response(JSON.stringify({ display_phone_number: '+1 555-010-0000' })) : new Response('{}'); },
    ...over,
  };
  return { d, graphCalls, botCalls };
}
{
  const { d } = handlerDeps();
  let r = await handle(new Request('https://x/functions/v1/whatsapp?hub.mode=subscribe&hub.verify_token=mc-verifica&hub.challenge=abc123'), d);
  ok(r.status === 200 && await r.text() === 'abc123', 'cadastro do webhook: devolve o desafio');
  r = await handle(new Request('https://x/functions/v1/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc'), d);
  ok(r.status === 403, 'token de verificação errado é recusado');
  r = await handle(new Request('https://x/functions/v1/whatsapp?info=1', { headers: { origin: 'https://iptvquantic.github.io' } }), d);
  const info = await r.json();
  ok(info.configured === true && info.number === '15550100000' && r.headers.get('access-control-allow-origin') === 'https://iptvquantic.github.io', 'app descobre o número do robô: ' + JSON.stringify(info));
  const health = await (await handle(new Request('https://x/?health=1'), handlerDeps({ rpc: async () => null }).d)).json();
  ok(health.db === true && health.configured === true, 'saúde: banco alcançado e robô configurado');
  const sick = await (await handle(new Request('https://x/?health=1'), handlerDeps({ rpc: async () => { throw new Error('chave recusada'); } }).d)).json();
  ok(sick.db === false, 'saúde: acusa quando o banco recusa a chave');
  const h2 = handlerDeps({ cfg: { ...cfg, token: '' } });
  ok((await (await handle(new Request('https://x/?info=1'), h2.d)).json()).configured === false, 'sem token: app sabe que o robô não está pronto');
}
{
  const { d, graphCalls, botCalls } = handlerDeps();
  const body = payload([{ from: PHONE, id: 'wamid.1', timestamp: '1', type: 'text', text: { body: 'mercado 52,90' } }]);
  let r = await handle(new Request('https://x/', { method: 'POST', body }), d);
  ok(r.status === 401 && botCalls.length === 0, 'sem assinatura: recusado');
  r = await handle(new Request('https://x/', { method: 'POST', body, headers: { 'x-hub-signature-256': sign(body + ' ') } }), d);
  ok(r.status === 401 && botCalls.length === 0, 'assinatura de outro conteúdo: recusado');
  r = await handle(new Request('https://x/', { method: 'POST', body, headers: { 'x-hub-signature-256': sign(body) } }), d);
  ok(r.status === 200 && botCalls.length === 1 && botCalls[0].text === 'mercado 52,90' && botCalls[0].kind === 'text' && botCalls[0].phone === PHONE, 'mensagem assinada chega ao robô');
  const reply = graphCalls.find((c) => c.body?.type === 'text');
  ok(reply && reply.path === `${PHONE_ID}/messages` && reply.body.to === PHONE && reply.body.text.body === 'resposta para mercado 52,90', 'resposta enviada ao mesmo número');
  ok(graphCalls.some((c) => c.body?.status === 'read' && c.body.message_id === 'wamid.1'), 'marca como lida');
  r = await handle(new Request('https://x/', { method: 'POST', body, headers: { 'x-hub-signature-256': sign(body) } }), d);
  ok(botCalls.length === 1, 'mesma mensagem reenviada pela Meta não é processada 2x');
  const viaWaba = handlerDeps({ cfg: { ...cfg, phoneId: 'waba-1' } });
  const wabaBody = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'waba-1', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: PHONE_ID }, messages: [{ from: PHONE, id: 'wamid.w1', type: 'text', text: { body: 'saldo' } }] } }] }] });
  await handle(new Request('https://x/', { method: 'POST', body: wabaBody, headers: { 'x-hub-signature-256': sign(wabaBody) } }), viaWaba.d);
  ok(viaWaba.botCalls.length === 1 && viaWaba.graphCalls.some((c) => c.body?.type === 'text' && c.path === `${PHONE_ID}/messages`), 'ID da conta configurado: mensagem aceita e resposta sai pelo número que recebeu');
  const lixo = handlerDeps({ cfg: { ...cfg, phoneId: 'abc-errado' } });
  await handle(new Request('https://x/', { method: 'POST', body: wabaBody, headers: { 'x-hub-signature-256': sign(wabaBody) } }), lixo.d);
  ok(lixo.botCalls.length === 1 && lixo.graphCalls.some((c) => c.body?.type === 'text' && c.path === `${PHONE_ID}/messages`) && !lixo.graphCalls.some((c) => c.path.includes('abc-errado')),
    'ID salvo errado (não é número): a mensagem é atendida e respondida pelo número que recebeu');
  const other = payload([{ from: PHONE, id: 'wamid.2', type: 'text', text: { body: 'oi' } }], '999');
  await handle(new Request('https://x/', { method: 'POST', body: other, headers: { 'x-hub-signature-256': sign(other) } }), d);
  ok(botCalls.length === 1, 'aviso de outro número da Meta é ignorado');
  const status = JSON.stringify({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: PHONE_ID }, statuses: [{ id: 'x', status: 'delivered' }] } }] }] });
  r = await handle(new Request('https://x/', { method: 'POST', body: status, headers: { 'x-hub-signature-256': sign(status) } }), d);
  ok(r.status === 200 && botCalls.length === 1, 'aviso de entrega: só confirma');
  const audio = payload([{ from: PHONE, id: 'wamid.3', type: 'audio', audio: { id: 'media-9', mime_type: 'audio/ogg; codecs=opus' } }]);
  await handle(new Request('https://x/', { method: 'POST', body: audio, headers: { 'x-hub-signature-256': sign(audio) } }), d);
  ok(botCalls[1]?.kind === 'audio' && botCalls[1]?.audioId === 'media-9', 'áudio chega ao robô com o id da mídia');
}
{
  const { d, botCalls } = handlerDeps(); let pending = null; d.waitUntil = (p) => { pending = p; };
  const body = payload([{ from: PHONE, id: 'wamid.9', type: 'text', text: { body: 'saldo' } }]);
  const r = await handle(new Request('https://x/', { method: 'POST', body, headers: { 'x-hub-signature-256': sign(body) } }), d);
  ok(r.status === 200 && pending instanceof Promise, 'responde 200 à Meta na hora e termina o trabalho depois');
  await pending; ok(botCalls.length === 1, 'trabalho em segundo plano concluído');
}
{
  const { d, graphCalls } = handlerDeps({ bot: async () => { throw new Error('banco fora'); } });
  const body = payload([{ from: PHONE, id: 'wamid.7', type: 'text', text: { body: 'mercado 10' } }]);
  await handle(new Request('https://x/', { method: 'POST', body, headers: { 'x-hub-signature-256': sign(body) } }), d);
  ok(graphCalls.some((c) => c.body?.text?.body?.includes('Tive um problema')), 'erro inesperado: avisa o usuário em vez de ficar mudo');
}
{
  let cleaned = 0;
  const post = async (d, id) => { const b = payload([{ from: PHONE, id, type: 'text', text: { body: 'oi' } }]); return handle(new Request('https://x/', { method: 'POST', body: b, headers: { 'x-hub-signature-256': sign(b) } }), d); };
  await post(handlerDeps({ housekeeping: async () => { cleaned++; }, random: () => 0 }).d, 'wamid.20');
  ok(cleaned === 1, 'limpeza dos ids antigos roda de vez em quando');
  await post(handlerDeps({ housekeeping: async () => { cleaned++; }, random: () => 0.5 }).d, 'wamid.21');
  ok(cleaned === 1, '... e não a cada mensagem');
  const h = handlerDeps({ housekeeping: async () => { throw new Error('banco fora'); }, random: () => 0 });
  const r = await post(h.d, 'wamid.22');
  ok(r.status === 200 && h.graphCalls.some((c) => c.body?.type === 'text'), 'limpeza que falha não atrapalha a resposta');
}
// ---------- ativação na Meta pelo app do dono ----------
function metaFake(state = {}) {
  const st = { subs: [], wabaApps: [], expires: 0, valid: true, phoneErr: null, proofErr: false, appNeedsProof: false, secretOk: true, scopes: [{ scope: 'whatsapp_business_management', target_ids: ['555'] }, { scope: 'whatsapp_business_messaging', target_ids: ['555'] }], ...state }, calls = [];
  const graph = async (path, init = {}, token, proof = true) => {
    const method = init.method ?? 'GET'; calls.push({ path, method, token, proof });
    const [p, qs] = path.split('?'); const q = new URLSearchParams(qs ?? '');
    const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
    // chave secreta errada: a Meta recusa toda chamada com a prova; sem a prova só se o app não exigir
    if (st.proofErr && (proof || st.appNeedsProof)) return j({ error: { message: 'Invalid appsecret_proof provided in the API argument', type: 'GraphMethodException', code: 100 } }, 400);
    const noField = (f) => j({ error: { message: `(#100) Tried accessing nonexisting field (${f})`, type: 'OAuthException', code: 100 } }, 400);
    if (p === PHONE_ID) return st.phoneErr ? j({ error: st.phoneErr }, 400) : j({ display_phone_number: '+55 22 99999-0000', verified_name: 'Meu Caixa', quality_rating: 'GREEN' });
    if ((p === '555' || p === '777') && /display_phone_number/.test(q.get('fields') || '')) return noField('display_phone_number'); // conta (WABA) e app não são números
    if (p === '555/phone_numbers' && /verified_name/.test(q.get('fields') || '')) return j({ data: [{ id: PHONE_ID, display_phone_number: '+55 22 99999-0000', verified_name: 'Meu Caixa' }].concat(st.twoNumbers ? [{ id: '2223334445', display_phone_number: '+1 555-010-0000', verified_name: 'Test Number' }] : []) });
    if (p === '777/phone_numbers') return noField('phone_numbers');
    if (p === 'app') return j({ id: '777', name: 'Meu Caixa' });
    if (p === '777' && method === 'GET') return st.secretOk ? j({ id: '777' }) : j({ error: { message: 'Error validating client secret.', type: 'OAuthException', code: 1 } }, 400);
    if (p === 'debug_token') return j({ data: { app_id: '777', is_valid: st.valid, expires_at: st.expires, granular_scopes: st.scopes } });
    if (p === '777/subscriptions' && method === 'GET') return j({ data: st.subs });
    if (p === '777/subscriptions' && method === 'POST') {
      st.verify = q.get('verify_token');
      st.subs = [{ object: q.get('object'), callback_url: q.get('callback_url'), active: true, fields: [{ name: q.get('fields'), version: 'v24.0' }] }];
      return j({ success: true });
    }
    if (/^(555|556)\/phone_numbers$/.test(p)) return j({ data: p.startsWith('556') ? [{ id: PHONE_ID }] : [{ id: '999' }] });
    if (/^(555|556)\/subscribed_apps$/.test(p) && method === 'GET') return j({ data: st.wabaApps });
    if (/^(555|556)\/subscribed_apps$/.test(p) && method === 'POST') { st.subscribedWaba = p.slice(0, 3); st.wabaApps = [{ whatsapp_business_api_data: { id: '777', name: 'Meu Caixa' } }]; return j({ success: true }); }
    return j({ error: { message: 'não simulado ' + p, code: 100 } }, 400);
  };
  return { st, calls, graph };
}
{
  const SELF = 'https://proj.supabase.co/functions/v1/whatsapp';
  const setupReq = (jwt) => new Request('https://x/functions/v1/whatsapp?setup=1', { method: 'POST', headers: { origin: 'https://iptvquantic.github.io', ...(jwt ? { authorization: 'Bearer ' + jwt } : {}) } });
  const run = async (m, over = {}) => { const { d } = handlerDeps({ cfg: { ...cfg, selfUrl: SELF }, graph: m.graph, isAdmin: async (t) => t === 'jwt-dono', ...over }); const r = await handle(setupReq('jwt-dono'), d); return { r, rep: await r.json() }; };
  // WHATSAPP_PHONE_ID com o ID da conta (WABA) no lugar do número — o caso do dono em 09/10: funciona e avisa
  const wabaCase = metaFake(), w1 = (await run(wabaCase, { cfg: { ...cfg, selfUrl: SELF, phoneId: '555' } })).rep;
  ok(w1.ok && w1.number === '5522999990000' && w1.phoneId === PHONE_ID && wabaCase.st.subscribedWaba === '555', 'ID da conta no lugar do número: descobre o número, ativa e inscreve a conta: ' + JSON.stringify(w1));
  has(w1.message, `troque esse segredo pelo ID do número: ${PHONE_ID}`, '... e diz qual ID colocar');
  const w2 = (await run(metaFake(), { cfg: { ...cfg, selfUrl: SELF, phoneId: '777' } })).rep;
  ok(w2.ok && w2.phoneId === PHONE_ID, 'ID de outra coisa (app): descobre o número pelo token e ativa: ' + JSON.stringify(w2));
  has(w2.message, `não é o ID do número. Já estou usando o número da sua conta (+5522999990000); para deixar definitivo, troque esse segredo pelo ID do número: ${PHONE_ID}`, '... e diz o ID certo');
  ok(w2.fix?.secrets?.endsWith('/functions/secrets'), '... com o link dos segredos');
  // a chave secreta colada no lugar do ID (o caso do dono em 09/10 13h20): descobre o número e nunca manda a chave para a Meta
  const HEX2 = '0123456789abcdef0123456789abcdef', w3m = metaFake(), w3 = (await run(w3m, { cfg: { ...cfg, selfUrl: SELF, phoneId: HEX2, appSecret: HEX2 } })).rep;
  ok(w3.ok && w3.phoneId === PHONE_ID && w3m.st.subscribedWaba === '555', 'chave secreta no lugar do ID: robô ativa com o número descoberto: ' + JSON.stringify(w3));
  has(w3.message, 'No WHATSAPP_PHONE_ID foi colada a chave secreta do app', '... avisa o que foi colado (sem mostrar)'); ok(!w3.message.includes(HEX2), '... e a chave não aparece');
  ok(!w3m.calls.some((x) => x.path.includes(HEX2)), 'o valor errado nunca vai para a Meta (nem para os registros)');
  const w4 = (await run(metaFake({ twoNumbers: true }), { cfg: { ...cfg, selfUrl: SELF, phoneId: '' } })).rep;
  ok(!w4.ok && w4.phones?.length === 2, 'dois números na conta e nenhum ID: pede para escolher');
  has(w4.message, `mais de um número; coloque no WHATSAPP_PHONE_ID o ID do número do robô: ${PHONE_ID} (+5522999990000, Meu Caixa); 2223334445`, '... listando os dois');
  const m = metaFake();
  const { d } = handlerDeps({ cfg: { ...cfg, selfUrl: SELF }, graph: m.graph, isAdmin: async (t) => t === 'jwt-dono' });
  let r = await handle(setupReq(null), d); ok(r.status === 403 && m.calls.length === 0, 'ativação sem login: recusada sem falar com a Meta');
  r = await handle(setupReq('jwt-cliente'), d); ok(r.status === 403 && m.calls.length === 0, 'ativação por cliente comum: recusada');
  r = await handle(setupReq('jwt-dono'), d); let rep = await r.json();
  ok(r.status === 200 && rep.ok && rep.webhook === 'ativado' && rep.waba === 'ativado' && rep.number === '5522999990000' && rep.name === 'Meu Caixa', 'dono ativa: webhook e conta do WhatsApp ligados: ' + JSON.stringify(rep));
  has(rep.message, 'Robô ativado na Meta agora', 'avisa que ativou agora');
  ok(m.st.subs[0]?.callback_url === SELF && m.st.verify === 'mc-verifica' && m.st.subs[0].fields[0].name === 'messages' && m.st.subs[0].object === 'whatsapp_business_account',
    'webhook cadastrado com o endereço da função, o token de verificação e o campo messages');
  ok(m.calls.filter((c) => /^(777\/|debug_token)/.test(c.path)).every((c) => c.token === '777|' + SECRET), 'chamadas do app usam o token do app (id|chave secreta)');
  ok(m.calls.filter((c) => /^(555\/|app$|1112223334)/.test(c.path)).every((c) => c.token === undefined), 'chamadas da conta usam o token do robô');
  ok(r.headers.get('access-control-allow-origin') === 'https://iptvquantic.github.io' && r.headers.get('cache-control') === 'no-store', 'resposta ao app com CORS e sem cache');
  const posts = m.calls.filter((c) => c.method === 'POST').length;
  rep = await (await handle(setupReq('jwt-dono'), d)).json();
  ok(rep.ok && rep.webhook === 'ok' && rep.waba === 'ok' && m.calls.filter((c) => c.method === 'POST').length === posts, 'conferir de novo: nada a mudar, nenhuma escrita na Meta');
  has(rep.message, 'Robô ativo na Meta.', 'mensagem de robô ativo');
  const pre = await handle(new Request('https://x/?setup=1', { method: 'OPTIONS', headers: { origin: 'https://iptvquantic.github.io' } }), d);
  ok(pre.status === 204 && /authorization/.test(pre.headers.get('access-control-allow-headers')) && /POST/.test(pre.headers.get('access-control-allow-methods')), 'pré-checagem do navegador libera o login e o POST');

  const two = metaFake({ scopes: [{ scope: 'whatsapp_business_management', target_ids: ['555', '556'] }] });
  ok((await run(two)).rep.ok && two.st.subscribedWaba === '556', 'duas contas do WhatsApp no token: escolhe a que tem o número do robô');
  ({ rep } = await run(metaFake({ expires: Math.floor(Date.parse('2026-12-01T12:00:00Z') / 1000) })));
  ok(rep.ok, 'token com validade ainda ativa o robô'); has(rep.message, 'o token vence em 01/12/2026', '... mas avisa que o token não é permanente');
  ({ rep } = await run(metaFake({ phoneErr: { message: 'Invalid appsecret_proof provided in the API argument', code: 100 } })));
  ok(!rep.ok, 'erro da Meta: não fica como ativo'); has(rep.message, 'WHATSAPP_APP_SECRET', 'chave secreta errada: diz qual segredo conferir');
  has((await run(metaFake({ phoneErr: { message: 'Error validating access token: Session has expired', code: 190 } }))).rep.message, 'WHATSAPP_TOKEN', 'token vencido: explica');
  has((await run(metaFake({ phoneErr: { message: 'Unsupported get request.', code: 100 } }))).rep.message, 'WHATSAPP_PHONE_ID', 'número errado: explica');
  has((await run(metaFake(), { cfg: { ...cfg, selfUrl: SELF, token: '', verifyToken: '' } })).rep.message, 'WHATSAPP_TOKEN, WHATSAPP_VERIFY_TOKEN', 'segredos faltando: diz quais');
  // chave secreta de outro app: diz qual app e onde corrigir, com links diretos (sem mostrar a chave)
  const SELF2 = 'https://jgqhtshcuyzytljkmmxd.supabase.co/functions/v1/whatsapp', HEX = '0123456789abcdef0123456789abcdef';
  let wrong = metaFake({ proofErr: true, secretOk: false });
  ({ rep } = await run(wrong, { cfg: { ...cfg, selfUrl: SELF2, appSecret: HEX } }));
  ok(!rep.ok && rep.fix?.meta === 'https://developers.facebook.com/apps/777/settings/basic/' && rep.fix?.secrets === 'https://supabase.com/dashboard/project/jgqhtshcuyzytljkmmxd/functions/secrets',
    'chave secreta errada: links diretos para copiar na Meta e trocar no Supabase: ' + JSON.stringify(rep.fix));
  has(rep.message, 'não é a do app "Meu Caixa"', 'diz de qual app tem que ser a chave'); ok(!rep.message.includes(HEX), 'a chave nunca aparece na mensagem');
  ok(wrong.calls.filter((c) => c.path.startsWith('app') || c.path.startsWith('777?')).every((c) => c.proof === false), 'diagnóstico só lê, e sem a prova');
  ok(!wrong.calls.some((c) => c.method === 'POST'), 'diagnóstico não escreve nada na Meta');
  has((await run(metaFake({ proofErr: true, secretOk: false }), { cfg: { ...cfg, selfUrl: SELF2, appSecret: '1234567890123456' } })).rep.message, 'parece o ID do app', 'ID do app no lugar da chave: avisa');
  ({ rep } = await run(metaFake({ proofErr: true, appNeedsProof: true }), { cfg: { ...cfg, selfUrl: SELF2, appSecret: HEX } }));
  has(rep.message, 'não confere com o token do WhatsApp', 'app que exige a prova em tudo: explica que os dois têm que ser do mesmo app'); ok(!rep.fix?.meta && !!rep.fix?.secrets, '... e leva aos segredos do Supabase');
  ok((await run(metaFake(), { isAdmin: async () => { throw new Error('auth fora'); } })).r.status === 403, 'falha ao conferir o login: recusa (não ativa)');
}
ok(await signatureOk('', new ArrayBuffer(0), 'sha256=00') === false, 'sem chave secreta: nada é aceito');
ok(messagesOf({ entry: [{ changes: [{ field: 'messages', value: { messages: [{ from: 'abc', id: '1', type: 'text', text: { body: 'x' } }] } }] }] }, '').length === 0, 'remetente inválido ignorado');

// ---------- o código da função ----------
const idx = readFileSync(new URL('./supabase/functions/whatsapp/index.ts', import.meta.url), 'utf8');
ok(!/gsk_[A-Za-z0-9]{10,}|sb_secret_[A-Za-z0-9]{6,}|EAA[A-Za-z0-9]{20,}/.test(idx), 'nenhuma chave no código da função');
ok(/WHATSAPP_APP_SECRET/.test(idx) && /SUPABASE_SECRET_KEYS/.test(idx) && /npm:@supabase\/supabase-js@2\.117\.3/.test(idx), 'segredos pelos Secrets; biblioteca com versão fixa');

console.log(`${fail ? '❌' : '✅'} robô do WhatsApp: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
