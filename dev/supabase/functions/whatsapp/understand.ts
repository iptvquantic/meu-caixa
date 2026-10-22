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
    type: 'object', additionalProperties: false, required: ['acao', 'faltou', 'lancamentos'],
    properties: {
      acao: { type: 'string', enum: ['lancar', 'falta_valor', 'consulta', 'desfazer', 'fatura', 'nada'] },
      faltou: { type: 'string' },
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

export const SYSTEM = `Você registra o dinheiro de autônomos e pequenos negócios no Brasil (app Meu Caixa). A pessoa falou (áudio transcrito) ou escreveu o que aconteceu. Entenda o sentido da frase inteira e devolva os lançamentos prontos, sem a pessoa precisar consertar nada.

acao: "lancar" (1 a 5 lançamentos, um por valor citado); "falta_valor" (quer lançar mas não disse o valor; em "faltou", o que entendeu); "consulta" (pergunta: saldo, quanto gastou, fatura, conselho); "desfazer" (apagar o último); "fatura" (pagou a fatura do PRÓPRIO cartão: não se lança); "nada".

tipo:
- entrada: dinheiro que entrou (recebi, caiu, vendi, cliente pagou, me pagou, PIX recebido, salário, comissão, reembolso, estorno).
- saida: saiu à vista (PIX, débito, dinheiro, boleto, transferência) — inclui pagar conta, parcela de algo já existente (empréstimo, carnê, financiamento) e conta ou cartão de OUTRA pessoa.
- cartao: compra NOVA no cartão de crédito da própria pessoa (comprei no cartão, passei no crédito, parcelei em 10x).
- investimento: aplicou/guardou (investi, aporte, poupança, caixinha, CDB, Tesouro, ações, cripto) ou tirou (resgatei: investimento "resgate").

Regras:
1. PIX, débito, dinheiro, boleto ou transferência citados = pagamento à vista: NUNCA "cartao", mesmo falando de cartão. "Pagamento do cartão do meu pai com pix" = saida por PIX.
2. "parcela 3/12", "3 de 12", "terceira parcela" = parcela de algo que já existe: só o valor desta parcela, e "3/12" na descrição. Não é data nem compra parcelada.
3. Compra nova "em 10x" no crédito: tipo cartao, parcelas 10, valor = TOTAL ("10x de 240" = 2400).
4. Valor falado vira número: "cinquenta e dois e noventa" = 52.9; "mil e duzentos" = 1200; "trinta conto/pila" = 30; "1k" = 1000. Telefone, data e parcela não são valor.
5. data AAAA-MM-DD: sem data = hoje; "ontem"; "anteontem"; "dia 15" = o dia 15 mais recente já passado; "15/10". Nunca futura.
6. descricao: 2 a 6 palavras, inicial maiúscula, do jeito da pessoa (cliente, loja, pessoa, o que comprou), sem valor, data e sem "entrada/saída/paguei/recebi". Ex.: "Parcela cartão do pai 3/12", "Josimar", "Mercado Guanabara".
7. categoria: um nome EXATO da lista da pessoa, do lado certo (saida e cartao: de saída; entrada: de entrada; investimento: de investimento). Os exemplos e os lançamentos parecidos mostram como ELA classifica (cliente que sempre foi de uma categoria continua nela). Supermercado → a categoria de mercado. Nenhuma serve: "".
8. cartao (só tipo cartao): nome exato do cartão citado; não citou: "". conta_fixa: nome exato da conta fixa paga/recebida (sem valor dito, use o valor dela); senão "".
9. Áudio pode trocar palavras de som parecido: corrija pelo contexto e pelos nomes da lista ("pics" = pix).
10. Aba tocada no app (se informada) define o tipo, a não ser que a frase diga outro.

Sem valor nos campos: "" (texto), 1 (parcelas), "nao" (investimento), "outro" (pagamento).`;

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
  lines.push(`Cartões de crédito: ${cards.length ? cards.map((c) => c.name + (c === top && cards.length > 1 ? ' (o mais usado)' : '')).join(', ') : 'nenhum cadastrado'}.`);
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

// Vocabulário para a transcrição do áudio (o Whisper acerta mais nomes e termos que já conhece)
export function vocabOf(data: Data) {
  const names = new Set<string>();
  for (const c of data.cards ?? []) if (!c.archived) names.add(c.name);
  for (const c of data.categories ?? []) if (!c.archived && c.legacy_key !== 'outros') names.add(c.name);
  const recent = [...(data.transactions ?? [])].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 150);
  for (const t of recent) { const d = clip(t.description, 24); if (d && !/\d{3,}/.test(d)) names.add(d); }
  let out = 'Lançamentos de dinheiro em reais: recebi 300 no PIX; paguei 52,90 no débito; parcela 3/12; comprei em 10x no cartão; investi 500. ';
  for (const n of names) { if (out.length + n.length > 620) break; out += n + ', '; }
  return out.replace(/, $/, '.');
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
  return d;
}

// Resposta da IA → plano conferido (null: resposta fora do formato)
export function toPlan(raw: string, today: string): Plan | null {
  const m = /\{[\s\S]*\}/.exec(raw || '');
  if (!m) return null;
  let j: any;
  try { j = JSON.parse(m[0]); } catch { return null; }
  const action = plain(j?.acao);
  if (['consulta', 'desfazer', 'fatura', 'nada'].includes(action)) return { action: action as 'consulta' | 'desfazer' | 'fatura' | 'nada' };
  const list: any[] = Array.isArray(j?.lancamentos) ? j.lancamentos.slice(0, 5) : [];
  if (action === 'falta_valor') return { action: 'falta_valor', description: cleanDescription(j?.faltou || list[0]?.descricao || '') };
  if (action !== 'lancar') return null;
  const items: Item[] = [];
  let noValue = '';
  for (const l of list) {
    const type = TYPES[plain(l?.tipo)];
    const amount = Math.round(money(l?.valor) * 100) / 100;
    if (!type) continue;
    if (!(amount > 0 && amount < 1e7)) { noValue ||= cleanDescription(l?.descricao) || ' '; continue; }
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
