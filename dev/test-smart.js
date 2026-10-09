// Ícone automático pelo nome, categoria pela família do ícone e lançamento rápido por texto.
// Roda as funções do próprio app.html (parte antes do app: ícones + funções "inteligentes").
const vm = require('vm');
const { appHtml, inlineScripts, checker } = require('./lib');

const code = inlineScripts(appHtml())[1];
const cut = code.indexOf('\n(() => {\n');
if (cut < 0) throw new Error('não achei o início do app no script principal');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code.slice(0, cut) + ';Object.assign(this,{ICONS,ICON_GROUPS,ICON_RULES,ICON_FAMILY,suggestIcon,parseQuick,parseAmountBR,stripLeadingEmoji,familyOf,iconIsSpecific})', ctx);

const { ok, done } = checker('ícones e lançamento rápido');
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} → ${JSON.stringify(a)} (esperado ${JSON.stringify(b)})`);

// todo ícone usado nas regras, grupos e famílias existe
for (const [, i] of ctx.ICON_RULES) ok(ctx.ICONS[i], 'ícone inexistente nas regras: ' + i);
for (const list of Object.values(ctx.ICON_GROUPS)) for (const i of list) ok(ctx.ICONS[i], 'ícone inexistente nos grupos: ' + i);
for (const kind of Object.values(ctx.ICON_FAMILY)) for (const list of Object.values(kind)) for (const i of list.split(' ')) ok(ctx.ICONS[i], 'ícone inexistente nas famílias: ' + i);

const cases = {
  'Farmácia': 'i:pill', 'drogasil': 'i:pill', 'Droga Raia': 'i:pill', 'Remédios da mãe': 'i:pill', 'Mercado': 'i:shopping-cart',
  'Supermercado Guanabara': 'i:shopping-cart', 'Padaria': 'i:croissant', 'iFood': 'i:utensils', 'Uber': 'i:car-taxi-front', 'Gasolina': 'i:fuel',
  'Aluguel': 'i:key-round', 'Conta de luz': 'i:lightbulb', 'Água': 'i:droplet', 'Gás': 'i:flame', 'Internet': 'i:wifi', 'Celular Claro': 'i:smartphone',
  'Netflix': 'i:film', 'Spotify': 'i:music', 'Academia': 'i:dumbbell', 'Dentista': 'i:toothbrush', 'Consulta médica': 'i:stethoscope',
  'Ração do Thor': 'i:paw-print', 'Faculdade': 'i:graduation-cap', 'Barbearia': 'i:scissors', 'Presente': 'i:gift', 'Dízimo': 'i:church',
  'Imposto DAS MEI': 'i:landmark', 'Venda de IPTV': 'i:tv', 'Banca de Apostas': 'i:dices', 'Juros Agiota': 'i:hand-coins', 'Salário': 'i:wallet',
  'Freelance': 'i:briefcase', 'Vendas': 'i:shopping-bag', 'Bitcoin': 'i:bitcoin', 'Tesouro Selic': 'i:vault', 'CDB Nubank': 'i:landmark',
  'Ações': 'i:chart-candlestick', 'Poupança': 'i:piggy-bank', 'Fornecedor': 'i:truck', 'Estacionamento': 'i:square-parking', 'Pet shop': 'i:paw-print',
  'Coisa aleatória': 'i:tag', '💊 Remédio': '💊', '🎸 Banda': '🎸'
};
for (const [t, e] of Object.entries(cases)) eq(ctx.suggestIcon(t, 'out'), e, t);
eq(ctx.suggestIcon('qualquer', 'in'), 'i:banknote-arrow-down', 'padrão de entrada');
eq(ctx.suggestIcon('qualquer', 'invest'), 'i:trending-up', 'padrão de investimento');
eq(ctx.stripLeadingEmoji('💊 Remédio'), 'Remédio', 'tira o emoji do nome');
eq(ctx.iconIsSpecific('i:tag'), false, 'ícone padrão não conta como sugestão');

// família do ícone → categoria padrão
eq(ctx.familyOf('i:car-taxi-front', 'out'), 'transporte', 'Uber → Transporte');
eq(ctx.familyOf('i:pill', 'out'), 'farmacia', 'Drogasil → Farmácia');
eq(ctx.familyOf('i:bitcoin', 'invest'), 'cripto', 'Bitcoin → Criptomoedas');
eq(ctx.familyOf('i:shopping-bag', 'in'), 'vendas', 'Vendas → Vendas');

// valores em reais
eq(ctx.parseAmountBR('52,90'), 52.9, '52,90'); eq(ctx.parseAmountBR('1.234,56'), 1234.56, '1.234,56'); eq(ctx.parseAmountBR('1234'), 1234, '1234');
eq(ctx.parseAmountBR('2k'), 2000, '2k'); eq(ctx.parseAmountBR('15.5'), 15.5, '15.5'); eq(ctx.parseAmountBR('R$ 15'), 15, 'R$ 15'); eq(ctx.parseAmountBR('abc'), null, 'texto não é valor');

// lançamento rápido
const T = '2026-10-08';
const q = s => { const r = ctx.parseQuick(s, T); return r && { type: r.type, amount: r.amount, inst: r.installments, date: r.date, desc: r.description, kind: r.investKind }; };
eq(q('mercado 52,90'), { type: 'out', amount: 52.9, inst: 1, date: T, desc: 'Mercado', kind: null }, 'mercado 52,90');
eq(q('uber 23 ontem'), { type: 'out', amount: 23, inst: 1, date: '2026-10-07', desc: 'Uber', kind: null }, 'uber 23 ontem');
eq(q('recebi 300 pix cliente joão'), { type: 'in', amount: 300, inst: 1, date: T, desc: 'Cliente joão', kind: null }, 'recebi 300 pix');
eq(q('geladeira 2.400 10x'), { type: 'card', amount: 2400, inst: 10, date: T, desc: 'Geladeira', kind: null }, 'parcelado 10x');
eq(q('netflix 55,90 no cartão'), { type: 'card', amount: 55.9, inst: 1, date: T, desc: 'Netflix', kind: null }, 'no cartão');
eq(q('apliquei 500 tesouro'), { type: 'invest', amount: 500, inst: 1, date: T, desc: 'Tesouro', kind: 'aporte' }, 'aporte');
eq(q('resgatei 200 cdb'), { type: 'invest', amount: 200, inst: 1, date: T, desc: 'Cdb', kind: 'resgate' }, 'resgate');
eq(q('farmácia 37,50 05/10'), { type: 'out', amount: 37.5, inst: 1, date: '2026-10-05', desc: 'Farmácia', kind: null }, 'data dd/mm');
eq(q('sem valor aqui'), null, 'sem valor não lança');
// frases com pontuação (áudio transcrito, mensagem do WhatsApp)
eq(q('Gastei 40 reais de Uber ontem.'), { type: 'out', amount: 40, inst: 1, date: '2026-10-07', desc: 'Uber', kind: null }, 'ponto final não atrapalha a data');
eq(q('Uber, ontem, 23'), { type: 'out', amount: 23, inst: 1, date: '2026-10-07', desc: 'Uber', kind: null }, 'vírgulas entre palavras');
eq(q('notebook 3.600 12x.'), { type: 'card', amount: 3600, inst: 12, date: T, desc: 'Notebook', kind: null }, 'milhar com ponto + ponto final');
eq(q('mercado 52,90!'), { type: 'out', amount: 52.9, inst: 1, date: T, desc: 'Mercado', kind: null }, 'centavos + exclamação');
eq(q('resgatei 200 do tesouro'), { type: 'invest', amount: 200, inst: 1, date: T, desc: 'Tesouro', kind: 'resgate' }, 'preposição no começo da descrição sai');

done();
