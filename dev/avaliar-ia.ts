// Avaliação TEMPORÁRIA do "entender" (whatsapp/understand.ts) com o modelo de verdade da Groq. Roda como uma função
// separada do Supabase ("mc-avaliar"), com dados de exemplo no jeito do dono (nomes fictícios), e não grava
// nada. Protegida por senha (só o hash vai no código publicado) e desliga sozinha no horário de ATE.
// Gerar e publicar: node avaliar-ia.js <commit> <senha> [horas]  → out/deploy/mc-avaliar/index.ts (deploy pelo conector)
// Usar: GET …/functions/v1/mc-avaliar/<senha>/<casos: 1,5,7 ou 3-9>/<esforço: low|medium>/<modelo: 120|20>
import { contextOf, SCHEMA, SYSTEM, toPlan } from '__UNDERSTAND__';

const HASH = '__HASH__';
const ATE = Date.parse('__ATE__');
const TODAY = '2026-10-22';
const C = (id: string, kind: string, name: string, legacy_key: string | null = null) => ({ id, kind, name, legacy_key, archived: false, sort: 1, icon: '', color: null });
const cats = [
  C('alim', 'out', 'Alimentação', 'alimentacao'), C('ass', 'out', 'Assinaturas', 'assinaturas'), C('cerv', 'out', 'Cerveja'), C('comb', 'out', 'Combustível', 'combustivel'),
  C('casa', 'out', 'Contas da casa', 'contas'), C('edu', 'out', 'Educação', 'educacao'), C('farm', 'out', 'Farmácia', 'farmacia'), C('forn', 'out', 'Fornecedores', 'fornecedores'),
  C('imp', 'out', 'Impostos e taxas', 'impostos'), C('lanche', 'out', 'Lanche / ifood'), C('lazer', 'out', 'Lazer', 'lazer'), C('merc', 'out', 'Mercado', 'mercado'),
  C('mor', 'out', 'Moradia', 'moradia'), C('outo', 'out', 'Outros', 'outros'), C('pixe', 'out', 'PIX enviado', 'pix'), C('roupa', 'out', 'Roupas', 'roupas'),
  C('saude', 'out', 'Saúde', 'saude'), C('shopee', 'out', 'Shopee'), C('transp', 'out', 'Transporte', 'transporte'),
  C('banca', 'in', 'Banca de Apostas', 'apostas'), C('juros', 'in', 'Juros Agiota', 'agiota'), C('outi', 'in', 'Outros', 'outros'), C('pixr', 'in', 'PIX recebido', 'pix_recebido'),
  C('sal', 'in', 'Salário', 'salario'), C('serv', 'in', 'Serviços', 'servicos'), C('iptv', 'in', 'Venda de IPTV', 'iptv'), C('vend', 'in', 'Vendas', 'vendas'),
  C('acoes', 'invest', 'Ações', 'acoes'), C('cripto', 'invest', 'Criptomoedas', 'cripto'), C('fundos', 'invest', 'Fundos', 'fundos'), C('outv', 'invest', 'Outros', 'outros'),
  C('poup', 'invest', 'Poupança', 'poupanca'), C('prev', 'invest', 'Previdência', 'previdencia'), C('cdb', 'invest', 'Renda Fixa/CDB', 'renda_fixa'), C('tes', 'invest', 'Tesouro Direto', 'tesouro'),
];
const T = (type: string, amount: number, date: string, description: string, category_id: string, card_id: string | null = null, installments = 1) => ({ id: crypto.randomUUID(), type, amount, date, description, category_id, card_id, installments, invest_kind: type === 'invest' ? 'aporte' : null, recurring_id: null, recurring_month: null });
const data: any = {
  categories: cats,
  cards: [{ id: 'meu', name: 'Meu cartão', closing_day: 9, due_day: 16, archived: false }],
  recurring: [
    { id: 'r-alug', type: 'out', name: 'Aluguel', amount: 1200, day: 5, start_month: '2026-01', end_month: null, active: true, category_id: 'mor', card_id: null },
    { id: 'r-net', type: 'out', name: 'Internet', amount: 89.9, day: 20, start_month: '2026-01', end_month: null, active: true, category_id: 'casa', card_id: null },
  ],
  goals: [],
  transactions: [
    T('in', 30, '2026-10-17', 'Entrada Fábio Nunes mensalidade IPTV', 'iptv'), T('out', 194, '2026-10-17', 'Saída terceira parcela Celular enviados para o meu pai', 'pixe'),
    T('card', 297.13, '2026-10-16', 'Mercado', 'alim', 'meu'), T('in', 30, '2026-10-15', 'Entrada IPTV Nélio', 'iptv'), T('in', 30, '2026-10-15', 'Entrada Pedro Alencar', 'iptv'),
    T('in', 15, '2026-10-10', 'venda ibo carla', 'iptv'), T('in', 30, '2026-10-10', 'Joaquim', 'iptv'), T('in', 30, '2026-10-09', 'Valdir', 'iptv'), T('in', 45, '2026-10-08', 'Rodrigo', 'iptv'),
    T('out', 280, '2026-10-06', 'cartao bruna', 'pixe'), T('out', 109.49, '2026-10-04', 'ifood mensalidade iptv renan drograria padaria', 'pixe'),
    T('in', 30, '2026-09-15', 'Joaquim', 'iptv'), T('out', 300, '2026-09-04', 'Cartão Bruna', 'pixe'), T('out', 120, '2026-09-06', 'Painel Prime', 'forn'),
    T('out', 35, '2026-10-09', 'iFood', 'lanche'), T('out', 120, '2026-10-11', 'Gasolina', 'comb'), T('card', 80, '2026-10-01', 'Shopee', 'shopee', 'meu'),
    T('out', 1200, '2026-10-05', 'Aluguel', 'mor'),
  ],
};
// a = veio de áudio (frase como o reconhecimento de voz escreve); hint = aba tocada no app; x = o que se espera
type Case = { t: string; a?: boolean; hint?: any; x: any };
const CASES: Case[] = [
  { t: 'pagamento cartao pai parcela com pix 3/12 350', x: { acao: 'lancar', n: 1, tipo: 'out', valor: 350, pay: 'pix', desc: /3\/12/ } },
  { t: 'Pagamento cartão pai parcela com Pix 3/12', a: true, x: { acao: 'falta_valor', desc: /pai/i } },
  { t: 'Paguei trezentos e cinquenta reais da parcela do cartão do meu pai no pix, parcela três de doze.', a: true, x: { acao: 'lancar', tipo: 'out', valor: 350, pay: 'pix', desc: /3\/12|3 de 12/ } },
  { t: 'comprei uma tv de 2400 em 10x no cartão', x: { acao: 'lancar', tipo: 'card', valor: 2400, parc: 10 } },
  { t: 'geladeira 10x de 240 no meu cartão', x: { acao: 'lancar', tipo: 'card', valor: 2400, parc: 10 } },
  { t: 'Gastei cinquenta no mercado e trinta na farmácia ontem.', a: true, x: { acao: 'lancar', n: 2, tipo: 'out', valor: 50, cat: /Mercado|Alimentação/, data: '2026-10-21', v2: 30, cat2: /Farm/ } },
  { t: 'joaquim 30', x: { acao: 'lancar', tipo: 'in', valor: 30, cat: 'Venda de IPTV' } },
  { t: 'Recebi trinta reais do Valdir.', a: true, x: { acao: 'lancar', tipo: 'in', valor: 30, cat: 'Venda de IPTV' } },
  { t: 'paguei a fatura do meu cartão 1500', x: { acao: 'fatura' } },
  { t: 'investi 500 no cdb', x: { acao: 'lancar', tipo: 'invest', valor: 500, cat: 'Renda Fixa/CDB', inv: 'aporte' } },
  { t: 'Resgatei duzentos da poupança.', a: true, x: { acao: 'lancar', tipo: 'invest', valor: 200, cat: 'Poupança', inv: 'resgate' } },
  { t: 'Uber.', a: true, x: { acao: 'falta_valor' } },
  { t: 'Quanto eu gastei esse mês com mercado?', a: true, x: { acao: 'consulta' } },
  { t: 'Apaga o último lançamento.', a: true, x: { acao: 'desfazer' } },
  { t: 'gasolina 150 no débito', x: { acao: 'lancar', tipo: 'out', valor: 150, cat: 'Combustível', pay: 'debito' } },
  { t: 'pastel e caldo de cana 18', x: { acao: 'lancar', tipo: 'out', valor: 18, cat: /Alimentação|Lanche/ } },
  { t: 'Vendi um painel IPTV pro Marcos por quarenta.', a: true, x: { acao: 'lancar', tipo: 'in', valor: 40, cat: 'Venda de IPTV', desc: /marcos/i } },
  { t: 'emprestei 100 pro meu irmão', x: { acao: 'lancar', tipo: 'out', valor: 100 } },
  { t: 'meu irmão me devolveu os 100', x: { acao: 'lancar', tipo: 'in', valor: 100 } },
  { t: 'dia 15 paguei a luz 180', x: { acao: 'lancar', tipo: 'out', valor: 180, data: '2026-10-15', cat: 'Contas da casa' } },
  { t: 'Saída terceira parcela celular enviados para o meu pai 194', a: true, x: { acao: 'lancar', tipo: 'out', valor: 194, desc: /^(?!sa[ií]da)/i } },
  { t: 'Entrada Pedro Alencar 30', x: { acao: 'lancar', tipo: 'in', valor: 30, desc: /^Pedro Alencar$/, cat: 'Venda de IPTV' } },
  { t: 'Entrada Fábio Nunes mensalidade IPTV 30', a: true, x: { acao: 'lancar', tipo: 'in', valor: 30, desc: /^Fábio Nunes/, cat: 'Venda de IPTV' } },
  { t: 'shopee 120 em 3x', x: { acao: 'lancar', tipo: 'card', valor: 120, parc: 3, cat: 'Shopee' } },
  { t: 'Pague 52 no pics do mercado', a: true, x: { acao: 'lancar', tipo: 'out', valor: 52, pay: 'pix' } },
  { t: 'caiu 450 do cliente joão', x: { acao: 'lancar', tipo: 'in', valor: 450 } },
  { t: 'transferi 300 pra poupança', x: { acao: 'lancar', tipo: 'invest', valor: 300, cat: 'Poupança', inv: 'aporte' } },
  { t: 'xpto 41', hint: { type: 'in', sure: true }, x: { acao: 'lancar', tipo: 'in', valor: 41 } },
  { t: 'cartão bruna 300', x: { acao: 'lancar', tipo: 'out', valor: 300 } },
  { t: 'pagamento cartão da Bruna com pix 280', a: true, x: { acao: 'lancar', tipo: 'out', valor: 280, pay: 'pix' } },
  { t: 'comprei um tênis de 300 em 3x no meu cartão', x: { acao: 'lancar', tipo: 'card', valor: 300, parc: 3 } },
  { t: 'mercado 297,13 no cartão', x: { acao: 'lancar', tipo: 'card', valor: 297.13 } },
  { t: 'Entrada IPTV Nélio 30', a: true, x: { acao: 'lancar', tipo: 'in', valor: 30, cat: 'Venda de IPTV' } },
  { t: 'É... paguei, deixa eu ver, quarenta e cinco reais de gasolina hoje.', a: true, x: { acao: 'lancar', tipo: 'out', valor: 45, cat: 'Combustível' } },
  { t: 'Recebi do Joaquim trinta e cinco no pix.', a: true, x: { acao: 'lancar', tipo: 'in', valor: 35, cat: 'Venda de IPTV' } },
  { t: 'Qual o meu saldo?', a: true, x: { acao: 'consulta' } },
  { t: 'painel prime 120', x: { acao: 'lancar', tipo: 'out', valor: 120 } },
  { t: 'paguei o cartão 1500', x: { acao: 'fatura' } },
  { t: 'pagamento do cartão', a: true, x: { acao: 'fatura' } },
  { t: 'paguei a parcela do carro 890 no boleto', x: { acao: 'lancar', tipo: 'out', valor: 890, pay: 'boleto', desc: /carro/i } },
  { t: 'Recebi mil e duzentos do cliente Rafael pelo serviço de instalação.', a: true, x: { acao: 'lancar', tipo: 'in', valor: 1200, desc: /rafael/i } },
  { t: 'Comprei gasolina, cem reais, no cartão de crédito.', a: true, x: { acao: 'lancar', tipo: 'card', valor: 100, cat: 'Combustível' } },
  // 43+ (23/10): mais frases faladas como o reconhecimento de voz escreve
  { t: 'Paguei a parcela do cartão do meu pai, trezentos e cinquenta reais no Pix, parcela 3 de 12.', a: true, x: { acao: 'lancar', tipo: 'out', valor: 350, pay: 'pix', desc: /3\/12/ } },
  { t: 'Recebi 30 reais do Fábio, mensalidade do IPTV.', a: true, x: { acao: 'lancar', tipo: 'in', valor: 30, cat: 'Venda de IPTV' } },
  { t: 'Gastei 20 reais de lanche e 15 de Uber.', a: true, x: { acao: 'lancar', n: 2, tipo: 'out', valor: 20, cat: /Lanche|Alimentação/, v2: 15, cat2: 'Transporte' } },
  { t: 'Comprei um celular de mil e quinhentos em 12 vezes no cartão.', a: true, x: { acao: 'lancar', tipo: 'card', valor: 1500, parc: 12 } },
  { t: 'Coloquei 120 de gasolina.', a: true, x: { acao: 'lancar', tipo: 'out', valor: 120, cat: 'Combustível' } },
  { t: 'mercado 52 e 90', x: { acao: 'lancar', valor: 52.9 } },
  { t: 'Hoje vendi dois painéis por 60 reais.', a: true, x: { acao: 'lancar', tipo: 'in', valor: 60, cat: /Venda de IPTV|Vendas/ } },
  { t: 'paguei o fornecedor do painel 120 no pix', x: { acao: 'lancar', tipo: 'out', valor: 120, cat: 'Fornecedores', pay: 'pix' } },
  { t: 'Transferi 500 para a conta da minha esposa.', a: true, x: { acao: 'lancar', tipo: 'out', valor: 500 } },
  { t: 'Recebi o salário, 2.500.', a: true, x: { acao: 'lancar', tipo: 'in', valor: 2500, cat: 'Salário' } },
  { t: 'Recebi 50 de juros do empréstimo do Carlos.', a: true, x: { acao: 'lancar', tipo: 'in', valor: 50, cat: 'Juros Agiota' } },
  { t: 'emprestei 500 pro carlos', x: { acao: 'lancar', tipo: 'out', valor: 500 } },
  { t: 'Ganhei 200 na banca.', a: true, x: { acao: 'lancar', tipo: 'in', valor: 200, cat: 'Banca de Apostas' } },
  { t: 'Paguei o aluguel.', a: true, x: { acao: 'lancar', tipo: 'out', valor: 1200, bill: 'Aluguel' } },
  { t: 'pix 35 ifood', x: { acao: 'lancar', tipo: 'out', valor: 35, pay: 'pix', cat: 'Lanche / ifood' } },
  { t: 'Parcela do cartão do pai.', a: true, x: { acao: 'falta_valor', desc: /pai/i } },
  { t: 'Quanto eu tenho na fatura do cartão?', a: true, x: { acao: 'consulta' } },
  { t: 'Cancela esse último que eu lancei.', a: true, x: { acao: 'desfazer' } },
  { t: 'Netflix 55,90 no cartão.', a: true, x: { acao: 'lancar', tipo: 'card', valor: 55.9, cat: 'Assinaturas' } },
  { t: 'Recebi 300 no pix do Joaquim e paguei 50 de gasolina.', a: true, x: { acao: 'lancar', n: 2, tipo: 'in', valor: 300, cat: 'Venda de IPTV', v2: 50, cat2: 'Combustível' } },
  { t: 'Pagamento cartão pai parcela com pix 3/12, 194 reais.', a: true, x: { acao: 'lancar', tipo: 'out', valor: 194, pay: 'pix', desc: /3\/12/ } },
  { t: 'trinta e cinco reais de uber ontem', a: true, x: { acao: 'lancar', tipo: 'out', valor: 35, cat: 'Transporte', data: '2026-10-21' } },
  { t: 'Paguei 89,90 da internet no débito.', a: true, x: { acao: 'lancar', tipo: 'out', valor: 89.9, pay: 'debito', cat: 'Contas da casa' } },
];
const enc = new TextEncoder();
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const fmt = (v: number) => v.toFixed(2);
const like = (want: any, got: string) => want instanceof RegExp ? want.test(got) : got === want;
function check(c: Case, p: any): string[] {
  const bad: string[] = [], x = c.x;
  if (!p) return ['plano nulo'];
  if (p.action !== x.acao) return ['acao ' + p.action + '≠' + x.acao];
  if (x.acao === 'falta_valor') { if (x.desc && !x.desc.test(p.description)) bad.push('entendido "' + p.description + '"'); return bad; }
  if (x.acao !== 'lancar') return bad;
  const it = p.items[0];
  if (x.n && p.items.length !== x.n) bad.push('n ' + p.items.length + '≠' + x.n);
  if (x.tipo && it.type !== x.tipo) bad.push('tipo ' + it.type + '≠' + x.tipo);
  if (x.valor && Math.abs(it.amount - x.valor) > 0.005) bad.push('valor ' + it.amount + '≠' + x.valor);
  if (x.pay && it.payment !== x.pay) bad.push('pag ' + it.payment + '≠' + x.pay);
  if (x.desc && !x.desc.test(it.description)) bad.push('desc "' + it.description + '"');
  // como no app: conta fixa reconhecida sem categoria usa a categoria da conta fixa
  const billCat = it.bill ? cats.find((c) => c.id === data.recurring.find((r: any) => r.name === it.bill)?.category_id)?.name ?? '' : '';
  if (x.cat && !like(x.cat, it.category || billCat)) bad.push('cat "' + it.category + '"≠' + x.cat);
  if (x.parc && it.installments !== x.parc) bad.push('parc ' + it.installments + '≠' + x.parc);
  if (x.inv && it.investKind !== x.inv) bad.push('inv ' + it.investKind);
  if (x.data && it.date !== x.data) bad.push('data ' + it.date + '≠' + x.data);
  if (x.bill && it.bill !== x.bill) bad.push('conta "' + it.bill + '"≠' + x.bill);
  if (x.v2) { const b = p.items[1]; if (!b || Math.abs(b.amount - x.v2) > 0.005) bad.push('2º valor'); if (x.cat2 && !like(x.cat2, b?.category ?? '')) bad.push('2ª cat "' + b?.category + '"'); }
  return bad;
}
Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (Date.now() > ATE) return new Response('encerrada', { status: 410 });
  const seg = u.pathname.split('/').filter(Boolean), at = seg.indexOf('mc-avaliar');
  const [pass, which, e, m] = seg.slice(at + 1);
  if ((await sha(pass ?? '')) !== HASH) return new Response('não encontrado', { status: 404 });
  const model = m === '20' ? 'openai/gpt-oss-20b' : 'openai/gpt-oss-120b', effort = e || 'low';
  const ids: number[] = [];
  for (const part of String(which ?? '').split(',')) { const [a, b] = part.split('-').map(Number); if (a) for (let i = a; i <= (b || a); i++) ids.push(i); }
  const key = Deno.env.get('GROQ_API_KEY') ?? '', out: string[] = [], t0 = Date.now();
  let limits = '';
  for (let k = 0; k < ids.length; k++) {
    const i = ids[k] - 1, c = CASES[i];
    if (!c) continue;
    if (Date.now() - t0 > 40e3) { out.push('… parou antes do ' + ids[k] + ' (tempo)'); break; }
    const ctx = contextOf(c.t, data, TODAY, { hint: c.hint, fromAudio: !!c.a });
    const s0 = Date.now();
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: ctx }], temperature: 0, max_tokens: 2000, reasoning_effort: effort, response_format: { type: 'json_schema', json_schema: SCHEMA } }),
    });
    const ms = Date.now() - s0;
    limits = ['x-ratelimit-remaining-tokens', 'x-ratelimit-remaining-requests', 'x-ratelimit-reset-tokens'].map((h) => h.replace('x-ratelimit-', '') + '=' + (r.headers.get(h) ?? '?')).join(' ');
    if (r.status === 429) {
      const wait = Math.ceil(Number(r.headers.get('retry-after') ?? 20)) + 1;
      await r.body?.cancel();
      if (wait > 20 || Date.now() - t0 + wait * 1000 > 45e3) { out.push('… parou antes do ' + ids[k] + ' (cota por minuto, ' + wait + 's)'); break; }
      await new Promise((res) => setTimeout(res, wait * 1000)); k--; continue;
    }
    if (!r.ok) { out.push('#' + (i + 1) + ' ERRO ' + r.status + ' ' + (await r.text()).slice(0, 160)); continue; }
    const j = await r.json(), raw = j?.choices?.[0]?.message?.content ?? '', us = j?.usage ?? {};
    const p = toPlan(raw, TODAY), bad = check(c, p);
    const show = p ? (p.action === 'lancar' ? p.items.map((x: any) => x.type + ' ' + fmt(x.amount) + ' ' + x.date.slice(5) + ' "' + x.description + '" [' + x.category + ']' + (x.payment !== 'outro' ? ' ' + x.payment : '') + (x.card ? ' cartão:' + x.card : '') + (x.installments > 1 ? ' ' + x.installments + 'x' : '') + (x.investKind ? ' ' + x.investKind : '') + (x.bill ? ' conta:' + x.bill : '')).join(' + ') : p.action + ((p as any).description ? ' "' + (p as any).description + '"' : '')) : 'NULO ' + raw.slice(0, 120);
    out.push('#' + (i + 1) + (bad.length ? ' FALHOU ' + bad.join('; ') : ' OK') + ' | ' + ms + 'ms ' + (us.prompt_tokens ?? '?') + '+' + (us.completion_tokens ?? '?') + 't | ' + show);
  }
  return new Response(model + ' esforço=' + effort + ' | ' + limits + '\n' + out.join('\n') + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
});
