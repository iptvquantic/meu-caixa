// Meu Caixa — entende o que a pessoa falou ou escreveu (o "cérebro" do Lançar com IA e do robô do WhatsApp).
// Manda à IA a frase com o contexto da própria pessoa (categorias com exemplos dela, cartões, contas fixas,
// lançamentos parecidos, a aba que ela tocou no app) e devolve um plano conferido: lançar (1 a 5 lançamentos),
// faltou o valor, consulta, desfazer, pagar a fatura ou nada. Nada aqui grava: quem grava é o bot.ts.
import { norm, typeWords } from './smart.ts';
import { billsOfMonth, brl } from './context.ts';
import type { Data, Hint } from './bot.ts';

export type Item = {
  type: 'in' | 'out' | 'card' | 'invest'; amount: number; date: string; description: string; category: string;
  payment: string; card: string; installments: number; investKind: 'aporte' | 'resgate' | null; bill: string;
};
export type Plan =
  | { action: 'lancar'; items: Item[] }
  | { action: 'falta_valor'; description: string }
  | { action: 'consulta' | 'desfazer' | 'fatura' | 'nada' };

// Formato exigido da resposta (saída estruturada estrita da Groq: o modelo não consegue fugir dele)
export const SCHEMA = {
  name: 'interpretacao',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false, required: ['acao', 'entendido', 'lancamentos'],
    properties: {
      acao: { type: 'string', enum: ['lancar', 'falta_valor', 'consulta', 'desfazer', 'fatura', 'nada'] },
      entendido: { type: 'string' },
      lancamentos: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['tipo', 'valor', 'data', 'descricao', 'categoria', 'pagamento', 'cartao', 'parcelas', 'investimento', 'conta_fixa'],
          properties: {
            tipo: { type: 'string', enum: ['entrada', 'saida', 'cartao', 'investimento'] },
            valor: { type: 'number' },
            data: { type: 'string' },
            descricao: { type: 'string' },
            categoria: { type: 'string' },
            pagamento: { type: 'string', enum: ['pix', 'debito', 'dinheiro', 'boleto', 'transferencia', 'credito', 'outro'] },
            cartao: { type: 'string' },
            parcelas: { type: 'integer' },
            investimento: { type: 'string', enum: ['aporte', 'resgate', 'nao'] },
            conta_fixa: { type: 'string' },
          },
        },
      },
    },
  },
};

export const SYSTEM = `Você registra o dinheiro de autônomos e pequenos negócios no Brasil (app Meu Caixa). A pessoa falou (áudio transcrito) ou escreveu o que aconteceu. Entenda a frase inteira e devolva os lançamentos prontos, do jeito que ela mesma lançaria, sem ela precisar consertar nada.

acao: "lancar" (1 a 5 lançamentos, um por valor citado); "falta_valor" (quer lançar mas não disse quanto; em "entendido" escreva a descrição do lançamento, ex.: "Parcela cartão do pai 3/12" — nunca a palavra "valor"); "consulta" (pergunta: saldo, quanto gastou, fatura, conselho); "desfazer" (apagar ou cancelar o último lançamento); "fatura" (pagou a fatura de um cartão DELA, da lista — "paguei o cartão" sem dizer de quem é o dela: não se lança, as compras já contam); "nada".

tipo:
- entrada: dinheiro que entrou (recebi, caiu, vendi, cliente pagou, me pagou, PIX recebido, salário, reembolso, me devolveu). Frase que começa com "Entrada" é entrada.
- saida: saiu à vista (PIX, débito, dinheiro, boleto, transferência), conta paga, parcela de algo que já existe (empréstimo, carnê, celular, financiamento) e pagamento do cartão ou de conta de OUTRA pessoa ("cartão da Bruna", "cartão do pai"). Frase que começa com "Saída" é saída.
- cartao: compra NOVA no cartão de crédito DELA (da lista): "comprei no cartão", "no crédito", "parcelei em 10x", "mercado 50 cartão".
- investimento: aplicou ou guardou (investi, aporte, poupança, caixinha, CDB, Tesouro, ações, cripto); tirou = investimento "resgate".

Regras:
1. PIX, débito, dinheiro, boleto ou transferência citados = à vista: nunca "cartao", mesmo falando de cartão.
2. "parcela 3/12", "3 de 12", "terceira parcela" = parcela de algo que já existe: o valor só desta parcela e "3/12" na descrição; não é data nem compra parcelada.
3. Compra nova "em 10x" no crédito: tipo cartao, parcelas 10, valor TOTAL ("10x de 240" = 2400).
4. Valor por extenso vira número: "cinquenta e dois e noventa" = 52.9; "mil e duzentos" = 1200; "trinta conto" = 30. Telefone, data e número da parcela não são valor.
5. data AAAA-MM-DD: sem data = hoje; "ontem"; "anteontem"; "dia 15" = o dia 15 mais recente já passado; "15/10". Nunca futura.
6. descricao: 2 a 6 palavras com inicial maiúscula, do jeito dela (cliente, loja, pessoa, o que foi), sem valor, data, forma de pagamento nem as palavras entrada, saída, paguei, recebi. Ex.: "Parcela cartão do pai 3/12", "Edson Monsores", "Mercado Guanabara".
7. categoria: nome EXATO da lista dela, do lado do tipo (saida e cartao usam as de saída), pelo QUE foi (mercado, ifood, gasolina, cliente) e nunca pela forma de pagamento: "PIX enviado"/"PIX recebido" só para dinheiro de ou para uma pessoa quando nenhuma outra serve. Os exemplos e os lançamentos parecidos mostram como ELA classifica: siga o mesmo (cliente de "Venda de IPTV" continua lá). Nenhuma serve: "".
8. pagamento: só o que ela disse (pix, debito, dinheiro, boleto, transferencia, credito); senão "outro". cartao (só no tipo cartao): nome exato do cartão dela; não citou: "". conta_fixa: nome exato da conta fixa da lista que ela pagou ou recebeu; senão "".
9. Pagou ou recebeu uma conta fixa da lista sem dizer o valor ("paguei o aluguel"): "lancar" com o valor da conta fixa, não "falta_valor".
10. Áudio troca palavras de som parecido: corrija pelo contexto e pelos nomes da lista ("pics" = pix).
11. Aba tocada no app (se informada) decide o tipo quando a frase não diz.
Campos sem informação: "" (texto), 1 (parcelas), "nao" (investimento), "outro" (pagamento).`;

const WEEK = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const TYPE_PT: Record<string, string> = { in: 'entrada', out: 'saída', card: 'cartão', invest: 'investimento' };
const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// Contexto da pessoa para a IA: categorias com exemplos dela, cartões, contas fixas, lançamentos parecidos e a aba
export function contextOf(text: string, data: Data, today: string, o: { hint?: Hint; fromAudio?: boolean } = {}) {
  const d = new Date(today + 'T12:00:00Z');
  const lines = [`Hoje: ${WEEK[d.getUTCDay()]}, ${ddmm(today)}/${today.slice(0, 4)} (${today}).`];
  const txs = [...(data.transactions ?? [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const recent = txs.slice(0, 600);
  // exemplos de cada categoria: as descrições que a pessoa mais usou nela
  const examples = (id: string) => {
    const count = new Map<string, number>();
    for (const t of recent) if (t.category_id === id && t.description) { const k = clip(t.description, 28); count.set(k, (count.get(k) ?? 0) + 1); }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  };
  const catLine = (kinds: string[]) => (data.categories ?? []).filter((c) => kinds.includes(c.kind) && !c.archived)
    .map((c) => { const ex = examples(c.id); return ex.length ? `${c.name} (ex.: ${ex.join(', ')})` : c.name; }).join('; ') || '(nenhuma)';
  lines.push(`Categorias de saída e cartão: ${catLine(['out'])}.`);
  lines.push(`Categorias de entrada: ${catLine(['in'])}.`);
  lines.push(`Categorias de investimento: ${catLine(['invest'])}.`);
  const cards = (data.cards ?? []).filter((c) => !c.archived);
  const use: Record<string, number> = {};
  for (const t of recent) if (t.type === 'card' && t.card_id) use[t.card_id] = (use[t.card_id] ?? 0) + 1;
  const top = [...cards].sort((a, b) => (use[b.id] ?? 0) - (use[a.id] ?? 0))[0];
  lines.push(`Cartões de crédito dela: ${cards.length ? cards.map((c) => c.name + (c === top && cards.length > 1 ? ' (o mais usado)' : '')).join(', ') : 'nenhum cadastrado'}.`);
  const bills = billsOfMonth((data.recurring ?? []).filter((r) => r.active !== false), txs, today.slice(0, 7), today);
  if (bills.length) {
    lines.push('Contas fixas do mês: ' + bills.slice(0, 20).map((b) =>
      `${b.rec.name} (${b.rec.type === 'in' ? 'entrada' : b.rec.type === 'card' ? 'cartão' : 'saída'}, ${brl(Number(b.rec.amount))}, dia ${b.rec.day}, ${b.status === 'paid' ? (b.rec.type === 'in' ? 'já recebida' : 'já paga') : b.rec.type === 'in' ? 'a receber' : 'a pagar'})`).join('; ') + '.');
  }
  // lançamentos parecidos (mesmas palavras), do mais recente
  const W = new Set(typeWords(text));
  if (W.size) {
    const similar = txs.filter((t) => typeWords(t.description).some((w: string) => W.has(w))).slice(0, 8);
    if (similar.length) {
      const catName = (id: string | null) => (data.categories ?? []).find((c) => c.id === id)?.name;
      const cardName = (id: string | null) => (data.cards ?? []).find((c) => c.id === id)?.name;
      lines.push('Lançamentos parecidos que a pessoa já fez:');
      for (const t of similar) {
        const cat = catName(t.category_id), card = t.type === 'card' ? cardName(t.card_id) : null;
        lines.push(`- ${ddmm(String(t.date))} ${TYPE_PT[t.type] ?? t.type}${card ? ' (' + card + ')' : ''} ${brl(Number(t.amount))} "${clip(t.description, 40)}"${cat ? ' → ' + cat : ''}`);
      }
    }
  }
  if (o.hint?.sure) {
    const tab = { in: 'Entrada', out: 'Saída', card: 'Cartão', invest: 'Investir' }[o.hint.type];
    const card = o.hint.type === 'card' && o.hint.card ? (data.cards ?? []).find((c) => c.id === o.hint!.card)?.name : null;
    lines.push(`Na tela do app a pessoa tocou na aba: ${tab}${card ? ' (cartão ' + card + ')' : ''}.`);
  }
  lines.push(`${o.fromAudio ? 'Mensagem (áudio transcrito)' : 'Mensagem (escrita)'}: "${clip(text, 600).replace(/"/g, "'")}"`);
  return lines.join('\n');
}

// Vocabulário para a transcrição do áudio (o Whisper acerta mais nomes e termos que já conhece). Vai primeiro o que
// ele não adivinha: nomes de clientes, lojas e pessoas que a pessoa mais lança, os cartões e as categorias criadas por ela.
// Curto de propósito: a Groq aceita até 224 tokens de vocabulário.
const SEEDED = new Set(['alimentacao', 'mercado', 'transporte', 'combustivel', 'contas', 'moradia', 'saude', 'farmacia', 'lazer', 'assinaturas', 'educacao', 'roupas', 'pix', 'fornecedores', 'impostos', 'outros', 'vendas', 'servicos', 'salario', 'pix_recebido', 'renda_fixa', 'tesouro', 'acoes', 'fundos', 'cripto', 'previdencia', 'poupanca']);
export function vocabOf(data: Data, max = 420) {
  const out: string[] = [], seen = new Set<string>();
  const add = (s: unknown) => {
    const t = clip(String(s ?? '').replace(/^(entrada|sa[ií]da|gasto|despesa|receita)\s+/i, ''), 28);
    if (!t || /\d{3,}/.test(t) || seen.has(norm(t))) return;
    seen.add(norm(t)); out.push(t);
  };
  const count = new Map<string, { s: string; n: number }>();
  for (const t of [...(data.transactions ?? [])].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 300)) {
    const k = norm(t.description ?? '');
    if (k) count.set(k, { s: String(t.description), n: (count.get(k)?.n ?? 0) + 1 });
  }
  for (const { s: d } of [...count.values()].sort((a, b) => b.n - a.n).slice(0, 40)) add(d);
  for (const c of data.cards ?? []) if (!c.archived) add(c.name);
  for (const c of data.categories ?? []) if (!c.archived && !SEEDED.has(String(c.legacy_key ?? ''))) add(c.name);
  let v = 'Lançamentos em reais: recebi 300 no PIX, paguei 52,90 no débito, parcela 3/12, 10x no cartão.';
  for (const n of out) { if (v.length + n.length + 2 > max) break; v += ' ' + n + ','; }
  return v.replace(/,$/, '.');
}

const TYPES: Record<string, Item['type']> = { entrada: 'in', saida: 'out', cartao: 'card', investimento: 'invest' };
const PAYMENTS = ['pix', 'debito', 'dinheiro', 'boleto', 'transferencia', 'credito', 'outro'];
const plain = (s: unknown) => norm(String(s ?? ''));
function money(v: unknown) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[^\d,.-]/g, '');
  return Number(s.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
}
// data do lançamento: no passado (até ~13 meses); futura ou estranha vira hoje
function okDate(s: unknown, today: string) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T12:00:00Z'))) return today;
  const diff = (Date.parse(s + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 864e5;
  return diff > 0 || diff < -400 ? today : s;
}
// descrição limpa: sem documento/telefone, sem "Entrada"/"Saída" no começo, inicial maiúscula
export function cleanDescription(s: unknown) {
  let d = clip(s, 80).replace(/\d[\d.\-]{7,}/g, '').replace(/^(entrada|saida|saída|gasto|despesa|receita|lançamento|lancamento)\s*[:,-]?\s+/i, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (d) d = d[0].toUpperCase() + d.slice(1);
  // "Pastel Caldo De Cana" → "Pastel Caldo de Cana" (preposições e artigos em minúscula)
  return d.replace(/ (De|Da|Do|Das|Dos|E|Em|Com|Para|Pra|Pro|No|Na|Nos|Nas|Ao|À) /g, (m) => m.toLowerCase());
}

// o que a pessoa quis lançar (para pedir o valor): nunca "Valor" ou "Lançamento"
const GENERIC = /^(o )?(valor|lancamento|lancar|quanto|nada|gasto|despesa|entrada|saida)$/;
const whatOf = (...c: unknown[]) => c.map(cleanDescription).find((d) => d.length > 1 && !GENERIC.test(norm(d))) ?? '';

// Resposta da IA → plano conferido (null: resposta fora do formato)
export function toPlan(raw: string, today: string): Plan | null {
  const m = /\{[\s\S]*\}/.exec(raw || '');
  if (!m) return null;
  let j: any;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const action = plain(j?.acao);
  if (['consulta', 'desfazer', 'fatura', 'nada'].includes(action)) return { action: action as 'consulta' | 'desfazer' | 'fatura' | 'nada' };
  const list: any[] = Array.isArray(j?.lancamentos) ? j.lancamentos.slice(0, 5) : [];
  if (action === 'falta_valor') return { action: 'falta_valor', description: whatOf(j?.entendido, list[0]?.descricao) };
  if (action !== 'lancar') return null;
  const items: Item[] = [];
  let noValue = '';
  for (const l of list) {
    const type = TYPES[plain(l?.tipo)];
    const amount = Math.round(money(l?.valor) * 100) / 100;
    if (!type) continue;
    if (!(amount > 0 && amount < 1e7)) { noValue ||= whatOf(l?.descricao, j?.entendido) || ' '; continue; }
    const pay = plain(l?.pagamento);
    const inv = plain(l?.investimento);
    items.push({
      type, amount, date: okDate(l?.data, today), description: cleanDescription(l?.descricao), category: clip(l?.categoria, 60),
      payment: PAYMENTS.includes(pay) ? pay : 'outro', card: type === 'card' ? clip(l?.cartao, 60) : '',
      installments: type === 'card' ? Math.min(48, Math.max(1, Math.round(Number(l?.parcelas) || 1))) : 1,
      investKind: type === 'invest' ? (inv === 'resgate' ? 'resgate' : 'aporte') : null, bill: clip(l?.conta_fixa, 80),
    });
  }
  if (items.length) return { action: 'lancar', items };
  // a IA disse "lançar" mas nenhum valor serviu: é o mesmo que faltar o valor
  return noValue ? { action: 'falta_valor', description: noValue.trim() } : null;
}
