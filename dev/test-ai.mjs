// IA do Meu Caixa: o resumo financeiro que a função "ai" envia à Groq (context.ts) tem que bater com as contas
// do app, e a função precisa checar login e limite antes de chamar a Groq. Roda no Node (sem Deno).
// Uso: node --experimental-strip-types --no-warnings test-ai.mjs   (npm run test:ai)
import { readFileSync } from 'node:fs';
import { addMonths, buildContext } from './supabase/functions/ai/context.ts';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('❌', msg); } };
const has = (txt, part, msg) => ok(txt.includes(part), `${msg}\n   esperado: ${part}\n   veio: ${txt.split('\n').find(l => l.startsWith(part.split(':')[0])) ?? '(nada)'}`);
const norm = s => s.replace(/ /g, ' ');

// ---------- meses ----------
ok(addMonths('2026-12', 1) === '2027-01', 'virada de ano para frente');
ok(addMonths('2026-01', -1) === '2025-12', 'virada de ano para trás');
ok(addMonths('2026-10', -24) === '2024-10', '24 meses para trás');
ok(addMonths('2026-03', 0) === '2026-03', 'mesmo mês');

// ---------- dados de exemplo ----------
const cats = [
  { id: 'c_in', name: 'Serviços', kind: 'in' }, { id: 'c_mkt', name: 'Mercado', kind: 'out' },
  { id: 'c_edu', name: 'Educação', kind: 'out' }, { id: 'c_inv', name: 'Tesouro', kind: 'invest' }
];
const cards = [
  { id: 'k1', name: 'Nubank', closing_day: 9, due_day: 16, archived: false },
  { id: 'k2', name: 'Loja', closing_day: 25, due_day: 5, archived: false },
  { id: 'k3', name: 'Antigo', closing_day: 1, due_day: 10, archived: true }
];
const tx = (type, amount, date, description, extra = {}) => ({ type, amount, date, description, category_id: null, card_id: null, installments: 1, invest_kind: null, ...extra });
const txs = [
  tx('in', 5000, '2026-03-05', 'Cliente X', { category_id: 'c_in' }),
  tx('out', 300, '2026-03-10', 'Mercado do mês', { category_id: 'c_mkt' }),
  tx('card', 1200, '2026-03-05', 'Curso', { category_id: 'c_edu', card_id: 'k1', installments: 3 }),   // fatura 03, 04, 05
  tx('card', 100, '2026-02-20', 'Livro', { category_id: 'c_edu', card_id: 'k1' }),                     // depois do fechamento → fatura 03
  tx('card', 250, '2026-03-10', 'Tênis', { card_id: 'k2' }),                                           // vence antes de fechar → fatura 04
  tx('invest', 1000, '2026-03-15', 'Aporte', { category_id: 'c_inv', invest_kind: 'aporte' }),
  tx('invest', 200, '2026-03-20', 'Resgate', { category_id: 'c_inv', invest_kind: 'resgate' }),
  tx('out', 900, '2026-03-05', 'Aluguel', { recurring_id: 'r1', recurring_month: '2026-03' })
];
const recs = [
  { id: 'r1', type: 'out', name: 'Aluguel', amount: 900, day: 5, start_month: '2026-01', end_month: null, active: true },
  { id: 'r2', type: 'in', name: 'Mensalidade Rogério', amount: 45, day: 10, start_month: '2026-01', end_month: null, active: true },
  { id: 'r3', type: 'out', name: 'Internet', amount: 100, day: 20, start_month: '2026-04', end_month: null, active: true },
  { id: 'r4', type: 'out', name: 'Academia', amount: 90, day: 1, start_month: '2026-01', end_month: null, active: false }
];
const goals = [
  { kind: 'budget', name: null, amount: 250, category_id: 'c_mkt', deadline: null, start_date: '2026-01-01', archived: false },
  { kind: 'income', name: null, amount: 4000, category_id: null, deadline: null, start_date: '2026-01-01', archived: false },
  { kind: 'save', name: 'Reserva', amount: 10000, category_id: null, deadline: '2027-12-31', start_date: '2026-03-01', archived: false },
  { kind: 'save', name: 'Velha', amount: 1, category_id: null, deadline: null, start_date: '2020-01-01', archived: true }
];

// ---------- cartão pela fatura (padrão) ----------
const c = norm(buildContext(txs, cats, cards, '2026-03', 'invoice', 'Guilherme', recs, goals));
has(c, 'RESUMO DO MÊS: entradas R$ 5.000,00; saídas PIX/débito/dinheiro R$ 1.200,00; fatura do cartão R$ 500,00; investido líquido R$ 800,00; saldo R$ 2.500,00.',
  'resumo do mês pela fatura (parcela 400 + compra após o fechamento 100)');
has(c, 'Taxa de sobra: 50% | gastos sobre entradas: 34% | cartão sobre entradas: 10%.', 'percentuais');
has(c, 'GASTOS POR CATEGORIA: Sem categoria R$ 900,00; Educação R$ 500,00; Mercado R$ 300,00.', 'gastos por categoria (parcelas do mês entram)');
has(c, 'ENTRADAS POR FONTE: Serviços R$ 5.000,00.', 'entradas por fonte');
has(c, 'INVESTIMENTOS POR TIPO (líquido): Tesouro R$ 800,00.', 'investimento líquido (aporte − resgate)');
has(c, 'PARCELAS JÁ COMPROMETIDAS NAS PRÓXIMAS FATURAS: 2026-04: R$ 650,00; 2026-05: R$ 400,00; 2026-06: R$ 0,00.',
  'próximas faturas (parcelas + cartão que vence antes de fechar)');
has(c, 'CARTÕES: Nubank (fecha dia 9, vence dia 16); Loja (fecha dia 25, vence dia 5).', 'cartões ativos (arquivado fora)');
has(c, 'CONTAS FIXAS DO MÊS: pagar Aluguel R$ 900,00 dia 5 (pago); receber Mensalidade Rogério R$ 45,00 dia 10 (ATRASADO).',
  'contas fixas: paga, atrasada; fora do período e inativa não aparecem');
has(c, 'METAS: limite Mercado: R$ 300,00 de R$ 250,00 (120%); faturamento: R$ 5.000,00 de R$ 4.000,00 (125%); objetivo Reserva: R$ 800,00 de R$ 10.000,00 até 2027-12-31.',
  'metas (arquivada fora)');
has(c, '2026-03: entradas R$ 5.000,00, saídas R$ 1.200,00, cartão R$ 500,00, investido R$ 800,00, saldo R$ 2.500,00', 'histórico do mês');
has(c, '2026-02: entradas R$ 0,00, saídas R$ 0,00, cartão R$ 0,00, investido R$ 0,00, saldo R$ 0,00', 'compra de fevereiro após o fechamento não cai em fevereiro');
ok(c.startsWith('DADOS REAIS de Guilherme'), 'nome do usuário no resumo');
ok(c.includes('pela fatura (mês do vencimento)'), 'explica o modo do cartão');
ok(!/NaN|undefined|null/.test(c), 'sem NaN/undefined/null no texto');

// ---------- cartão pela data da compra ----------
const p = norm(buildContext(txs, cats, cards, '2026-03', 'purchase', '', recs, goals));
has(p, 'RESUMO DO MÊS: entradas R$ 5.000,00; saídas PIX/débito/dinheiro R$ 1.200,00; fatura do cartão R$ 1.450,00; investido líquido R$ 800,00; saldo R$ 1.550,00.',
  'resumo pela data da compra (compras de março inteiras)');
has(p, 'GASTOS POR CATEGORIA: Educação R$ 1.200,00; Sem categoria R$ 1.150,00; Mercado R$ 300,00.', 'gastos por categoria pela data da compra');
ok(p.startsWith('DADOS REAIS (hoje:'), 'sem nome quando o perfil não tem');

// ---------- centavos das parcelas e conta a vencer ----------
const s = norm(buildContext([tx('card', 100, '2026-03-05', 'Fone', { card_id: 'k1', installments: 3 })], cats, cards, '2026-03', 'invoice', '', [], []));
has(s, 'PARCELAS JÁ COMPROMETIDAS NAS PRÓXIMAS FATURAS: 2026-04: R$ 33,33; 2026-05: R$ 33,34; 2026-06: R$ 0,00.', 'R$ 100 em 3x: centavo vai para a última parcela');
has(s, 'fatura do cartão R$ 33,33;', 'primeira parcela');
has(s, 'CONTAS FIXAS DO MÊS: nenhuma cadastrada.', 'sem contas fixas');
has(s, 'METAS: nenhuma cadastrada.', 'sem metas');
const f = norm(buildContext([], cats, cards, '2099-01', 'invoice', '', recs, []));
has(f, 'receber Mensalidade Rogério R$ 45,00 dia 10 (a vencer)', 'conta futura aparece como a vencer');

// ---------- a função "ai" (index.ts) ----------
const fn = readFileSync(new URL('./supabase/functions/ai/index.ts', import.meta.url), 'utf8');
const at = s => fn.indexOf(s);
ok(at('auth.getUser(') > 0 && at('auth.getUser(') < at("rpc('ai_consume')"), 'confere o login antes de tudo');
ok(at("rpc('ai_consume')") < at('callGroq([{'), 'gasta a cota (limite diário) antes de chamar a Groq');
ok(fn.includes("Deno.env.get('GROQ_API_KEY')") && !/gsk_[A-Za-z0-9]{10,}|sb_secret_|service_role/.test(fn), 'chave da Groq só pelos Secrets; nenhuma chave no código');
ok(fn.includes("'https://iptvquantic.github.io'"), 'só o site do Meu Caixa (e localhost) pode chamar');
ok(fn.includes('feats.bills === false ? []') && fn.includes('feats.goals === false ? []'), 'respeita Contas fixas/Metas desligadas em Ajustes');
ok(fn.includes('.slice(-12)') && fn.includes('.slice(0, 2000)'), 'limita histórico (12) e tamanho das mensagens');
ok(fn.includes('NUNCA recomende pagar só o mínimo'), 'regra do cartão: nunca recomendar só o mínimo');
const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
ok(!app.includes('api.groq.com') && app.includes("/functions/v1/${CFG.aiFunction || 'ai'}"), 'o app nunca chama a Groq direto (só a função)');

console.log(`${fail ? '❌' : '✅'} IA (resumo e função): ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
