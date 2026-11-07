// @ts-nocheck
// GERADO por dev/sync-bot.js a partir do app.html (ícone automático e lançamento rápido). Não edite aqui.
/* ===== Ícone automático, emojis e lançamento rápido (roda 100% no aparelho, grátis) ===== */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

// [palavras (regex sem acento), ícone]. Ordem importa: o mais específico primeiro.
const ICON_RULES = [
  ['farmacia|drogaria|drogasil|droga raia|raia|pague menos|panvel|remedio|medicamento|pacheco|venancio', 'pill'],
  ['dentista|odonto|ortodont|aparelho dental', 'toothbrush'],
  ['oculos|otica|lente de contato', 'glasses'],
  ['vacina|injecao|seringa', 'syringe'],
  ['exame|laboratorio|ultrassom|raio x|tomografia', 'microscope'],
  ['hospital|pronto socorro|internacao|upa\\b', 'hospital'],
  ['medic|consulta|clinica|plano de saude|unimed|amil|hapvida|psicolog|terapia|fisioterap|nutricionista', 'stethoscope'],
  ['academia|gym|musculacao|crossfit|pilates|personal|smart ?fit|treino', 'dumbbell'],
  ['bebe|fralda|creche|bercario|infantil', 'baby'],
  ['pet\\b|petshop|pet shop|racao|veterinari|banho e tosa|cachorro|gato\\b', 'paw-print'],
  ['supermercado|mercado|atacad|assai|atacadao|carrefour|extra\\b|guanabara|prezunic|mercearia|sacolao', 'shopping-cart'],
  ['hortifruti|feira|verdur|fruta|quitanda', 'apple'],
  ['acougue|carne|churrasco|frigorifico', 'beef'],
  ['peixe|peixaria|frutos do mar|sushi|japones', 'fish'],
  ['padaria|panificadora|pao\\b|paes|confeitaria|bolo', 'croissant'],
  ['sorvete|acai|gelato|picole', 'ice-cream-cone'],
  ['doce|doceria|chocolate|bombom|brigadeiro', 'candy'],
  ['pizza|pizzaria', 'pizza'],
  ['hamburguer|burger|lanche|lanchonete|mc ?donald|burger king|bk\\b|cachorro quente|hot dog|salgado', 'hamburger'],
  ['cafe\\b|cafeteria|starbucks|capuccino|expresso', 'coffee'],
  ['cerveja|chopp|bar\\b|boteco|balada|drink|bebida|adega|vinho|whisky', 'beer'],
  ['agua mineral|galao de agua', 'glass-water'],
  ['ifood|delivery|rappi|aiqfome|restaurante|almoco|janta|jantar|marmita|refeicao|self service|quentinha|comida', 'utensils'],
  ['gasolina|combustivel|posto|etanol|alcool|diesel|gnv|shell|ipiranga|petrobras', 'fuel'],
  ['estacionamento|zona azul|valet|parking', 'square-parking'],
  ['uber|99\\b|99 ?pop|taxi|cabify|indrive|corrida', 'car-taxi-front'],
  ['onibus|passagem de onibus|rodoviaria|brt\\b', 'bus'],
  ['metro|trem|supervia|vlt\\b|cptm', 'train-front'],
  ['bike|bicicleta|patinete', 'bike'],
  ['moto\\b|motoboy|motoqueiro|entregador', 'motorbike'],
  ['aviao|passagem aerea|voo\\b|latam|gol\\b|azul\\b|aeroporto|milhas', 'plane'],
  ['viagem|hotel|pousada|airbnb|hospedagem|turismo|ferias', 'palmtree'],
  ['pedagio|sem parar|conectcar|veloe', 'ticket'],
  ['mecanic|oficina|pneu|revisao|lava ?jato|lavagem|seguro auto|ipva|licenciamento|detran|carro|veiculo|financiamento do carro', 'car'],
  ['frete|mudanca|transportadora|carreto|fornecedor|distribuidora', 'truck'],
  ['correios|sedex|envio|encomenda|embalage|caixa de papelao', 'package'],
  ['estoque|mercadoria|revenda|atacado|insumo|materia prima', 'boxes'],
  ['aluguel|locacao|imobiliaria', 'key-round'],
  ['condominio|predio', 'building'],
  ['iptu|imposto|das\\b|mei\\b|simples nacional|darf|irpf|imposto de renda|tributo|taxa municipal|alvara|cartorio|inss', 'landmark'],
  ['multa', 'triangle-alert'],
  ['luz|energia|eletric|enel|light\\b|cemig|copel|cpfl|neoenergia', 'lightbulb'],
  ['agua\\b|saneamento|cedae|sabesp|esgoto|aguas do', 'droplet'],
  ['gas\\b|botijao|ultragaz|liquigas|gas encanado|naturgy', 'flame'],
  ['internet|wifi|wi-fi|fibra|banda larga|provedor|net\\b', 'wifi'],
  ['celular|telefone|recarga|claro|vivo|tim\\b|oi\\b|chip|plano movel', 'smartphone'],
  ['iptv|tv a cabo|sky\\b|televisao|tv\\b', 'tv'],
  ['netflix|prime video|disney|hbo|max\\b|globoplay|paramount|streaming|deezer|youtube premium|crunchyroll', 'film'],
  ['spotify|musica|show\\b|ingresso de show|instrumento|violao', 'music'],
  ['assinatura|mensalidade de app|icloud|google one|chatgpt|software|saas|microsoft 365|adobe|canva', 'repeat'],
  ['site|dominio|hospedagem de site|servidor|hostinger|cloud', 'globe'],
  ['marketing|anuncio|trafego|impulsion|ads\\b|panfleto|divulgacao|publicidade', 'megaphone'],
  ['maquininha|stone|cielo|pagseguro|pagbank|mercado pago|sumup|tarifa de cartao|taxa de cartao', 'credit-card'],
  ['cartao|fatura|credito', 'credit-card'],
  ['boleto|conta a pagar|parcela', 'receipt'],
  ['reforma|obra|pedreiro|material de construcao|cimento|tinta|leroy|telha', 'hammer'],
  ['manutencao|conserto|reparo|encanador|eletricista|tecnico|assistencia tecnica', 'wrench'],
  ['limpeza|diarista|faxina|produto de limpeza|detergente', 'spray-can'],
  ['lavanderia|lavagem de roupa', 'washing-machine'],
  ['movel|moveis|sofa|colchao|cama\\b|decoracao', 'sofa'],
  ['eletrodomestic|geladeira|fogao|microondas|maquina de lavar', 'refrigerator'],
  ['computador|notebook|laptop|informatica|teclado|mouse|monitor', 'laptop'],
  ['impressora|impressao|grafica|copia|xerox', 'printer'],
  ['curso|faculdade|escola|colegio|mensalidade escolar|matricula|aula|educacao|treinamento|mentoria|ead\\b', 'graduation-cap'],
  ['livro|livraria|apostila|material escolar|papelaria', 'book-open'],
  ['jogo|game|steam|playstation|xbox|nintendo|psn|free fire|skin', 'gamepad-2'],
  ['cinema|filme|teatro|ingresso', 'clapperboard'],
  ['festa|aniversario|evento|comemoracao|casamento', 'party-popper'],
  ['presente|lembrancinha|gift', 'gift'],
  ['roupa|moda|vestuario|camisa|calca|vestido|renner|riachuelo|cea\\b|shein|zara', 'shirt'],
  ['sapato|tenis|calcado|chinelo|sandalia', 'footprints'],
  ['cabelo|salao|barbearia|barbeiro|corte|manicure|unha|estetica|depilacao|sobrancelha', 'scissors'],
  ['perfume|cosmetic|maquiagem|boticario|natura|avon|skincare|beleza', 'sparkles'],
  ['joia|bijuteria|ouro|prata\\b|anel|colar', 'gem'],
  ['relogio', 'watch'],
  ['flor|floricultura|jardim|planta|jardinagem', 'flower-2'],
  ['igreja|dizimo|oferta|templo', 'church'],
  ['doacao|caridade|vaquinha|ajuda', 'hand-heart'],
  ['cigarro|tabacaria|vape|narguile|fumo', 'cigarette'],
  ['seguro|protecao veicular|seguro de vida', 'shield-check'],
  ['advogado|juridico|processo|honorario', 'scale'],
  ['contador|contabilidade|contabil', 'calculator'],
  ['funcionario|salario de funcionario|folha|equipe|ajudante|colaborador|comissao de vendedor', 'users'],
  ['comissao|parceria|indicacao', 'handshake'],
  ['apostas?|bet\\b|bets|banca|cassino|loteria|mega ?sena|bicho|jogo do bicho|aposta esportiva', 'dices'],
  ['agiota|emprestimo|juros|credito pessoal|financeira', 'hand-coins'],
  ['salario|holerite|contracheque|clt\\b|pro ?labore|adiantamento salarial|13o|decimo terceiro|ferias recebidas', 'wallet'],
  ['freela|freelance|projeto|consultoria|servico prestado|prestacao de servico|honorarios recebidos', 'briefcase'],
  ['venda|vendas|cliente|pedido|loja virtual|e-?commerce|marketplace|shopee|mercado livre', 'shopping-bag'],
  ['loja|comercio|ponto comercial|quiosque', 'store'],
  ['bonus|premio|premiacao|gratificacao', 'trophy'],
  ['reembolso|estorno|devolucao', 'refresh-ccw'],
  ['cashback|pontos|recompensa', 'coins'],
  ['pix recebido|recebi pix|transferencia recebida|deposito', 'arrow-down-left'],
  ['pix\\b|transferencia|ted\\b|doc\\b', 'arrow-up-right'],
  ['saque|dinheiro vivo|especie', 'banknote'],
  ['dividendo|rendimento|proventos|jcp\\b', 'trending-up'],
  ['tesouro|selic|ipca', 'vault'],
  ['cdb|lci|lca|renda fixa|debenture|cri\\b|cra\\b', 'landmark'],
  ['acoes|acao\\b|bolsa de valores|b3\\b|etf|fii|fundo imobiliario|day ?trade', 'chart-candlestick'],
  ['fundo|fundos', 'chart-pie'],
  ['bitcoin|btc\\b|ethereum|eth\\b|cripto|usdt|binance|token|nft|solana', 'bitcoin'],
  ['previdencia|pgbl|vgbl|aposentadoria', 'umbrella'],
  ['poupanca|cofrinho|reserva|caixinha', 'piggy-bank'],
  ['dolar|euro|cambio|moeda estrangeira', 'circle-dollar-sign'],
  ['agro|fazenda|sitio|gado|plantacao|colheita', 'tractor'],
  ['construcao civil|engenharia|epi\\b|obra civil', 'hard-hat'],
  ['foto|fotografia|camera|ensaio', 'camera'],
  ['design|arte|pintura|desenho|ilustracao', 'palette'],
  ['jornal|revista|noticia', 'newspaper'],
];
const ICON_RX = ICON_RULES.map(([w, i]) => [new RegExp('(^|[^a-z0-9])(' + w + ')'), i]);

// Ícone para um nome. Emoji digitado no começo vale mais que a sugestão.
function suggestIcon(text, kind) {
  const raw = String(text || '').trim();
  const em = raw.match(/^(\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*)/u);
  if (em) return em[0];
  const n = norm(raw);
  if (n) for (const [rx, icon] of ICON_RX) if (rx.test(n)) return 'i:' + icon;
  return kind === 'in' ? 'i:banknote-arrow-down' : kind === 'invest' ? 'i:trending-up' : 'i:tag';
}
// Só o nome, sem o emoji do começo
const stripLeadingEmoji = s => String(s || '').replace(/^(\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u, '').trim();
// Achou ícone de verdade (não o padrão)?
const iconIsSpecific = (icon) => !['i:tag', 'i:banknote-arrow-down', 'i:trending-up'].includes(icon);



/* ===== Lançamento rápido: "mercado 52,90 ontem", "recebi 300 pix", "tv 2400 10x no cartão" ===== */
function parseAmountBR(s) {
  // aceita 52,90 · 52.90 · 1.234,56 · 1234 · R$ 15 · 2k
  let t = String(s).replace(/r\$\s*/i, '').trim();
  const k = /^(\d+(?:[.,]\d+)?)\s*k$/i.exec(t);
  if (k) return Math.round(parseFloat(k[1].replace(',', '.')) * 1000 * 100) / 100;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) t = t.replace(/,/g, '');
  const v = parseFloat(t);
  return isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}
// "no cartão", "no crédito", "parcelado" ou "cartão" no fim = pagou no cartão; "cartão da Bruna", "fatura" ou
// "cartão do pai" = pagamento do cartão de outra pessoa (saída), que não é compra no cartão da própria pessoa
const CARD_CUE = /(^| )(no|pelo|com o|com|no meu|pelo meu|com meu) (cartao|credito)( |$)|(^| )(credito|parcelado|parcelei)( |$)| cartao$/;
const NOT_MY_CARD = /(^| )(fatura|pai|mae|irma|irmao|filho|filha|esposa|marido|sogra|sogro|namorada|namorado|amigo|amiga|tio|tia|avo|vo)( |$)/;
function parseQuick(text, today) {
  // pontuação de frase ("…uber ontem.", "uber, ontem") não atrapalha; "3.600" e "52,90" continuam valores
  const raw = moneySaid(String(text || '')).replace(/[!?.;…]+(?=\s|$)/g, ' ').replace(/,(?=\s)/g, ' ').trim(); // "20 reais e 50 centavos" = 20,50
  if (!raw) return null;
  const n = norm(raw);
  const out = { type: 'out', amount: null, installments: 1, date: today, description: '', investKind: null };
  // "parcela 3/12" (ou "3/12" com "parcela" na frase): número da parcela de algo que já existe — não é data nem valor
  const nm = /(?:^|[^\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/.exec(raw);
  const inst = nm && /(^| )(parcela|parcelas|prestacao|prestacoes|carne)( |$)/.test(n) && +nm[1] >= 1 && +nm[1] <= +nm[2] && +nm[2] <= 60 ? `${+nm[1]}/${+nm[2]}` : '';
  // valor: primeiro número "de dinheiro" (ignora "10x", datas tipo 05/10 e a parcela 3/12)
  const amtRx = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?(?:\s?k\b)?)(?![\d/x])/i;
  const parcRx = /(\d{1,2})\s*x\b/i;
  const pm = parcRx.exec(n);
  if (pm) { out.installments = Math.min(48, Math.max(1, +pm[1])); out.type = 'card'; }
  // horário que ficou na frase ("almoço às 12h30 25") não é valor
  const cleanForAmt = raw.replace(parcRx, ' ').replace(/\b\d{1,2}\s*\/\s*\d{1,2}(\/\d{2,4})?\b/g, ' ').replace(/\b\d{1,2}(?: ?h ?|:)[0-5]\d\b/gi, ' ');
  const am = amtRx.exec(cleanForAmt);
  if (am) out.amount = parseAmountBR(am[1].replace(/\s+/g, ''));
  // tipo
  if (/(^| )(recebi|recebido|entrada|ganhei|vendi|venda|faturei|pix recebido|caiu|salario|pagamento recebido)( |$)/.test(n)) out.type = 'in';
  if (/(^| )(apliquei|aporte|investi|investimento|guardei)( |$)/.test(n)) { out.type = 'invest'; out.investKind = 'aporte'; }
  if (/(^| )(resgatei|resgate|saquei do investimento)( |$)/.test(n)) { out.type = 'invest'; out.investKind = 'resgate'; }
  const cardPaid = CARD_CUE.test(n) && !NOT_MY_CARD.test(n);
  if (cardPaid && out.type === 'out') out.type = 'card';
  // data
  const d = new Date(today + 'T12:00:00');
  if (/(^| )anteontem( |$)/.test(n)) d.setDate(d.getDate() - 2);
  else if (/(^| )ontem( |$)/.test(n)) d.setDate(d.getDate() - 1);
  const dm = inst ? null : /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(raw);
  if (dm) {
    const y = dm[3] ? (+dm[3] < 100 ? 2000 + +dm[3] : +dm[3]) : d.getFullYear();
    const cand = new Date(y, +dm[2] - 1, +dm[1], 12);
    if (cand.getMonth() === +dm[2] - 1) d.setTime(cand.getTime());
  }
  out.date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  // descrição: o texto sem valor/datas/palavras de comando ("Entrada"/"Saída" no começo também saem); a parcela 3/12 fica
  let desc = raw
    .replace(am ? am[0].trim() : '', ' ')
    .replace(parcRx, ' ')
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}(\/\d{2,4})?\b/g, ' ')
    .replace(cardPaid ? /\b((no|pelo|com o|com|no meu|pelo meu|com meu)\s+)?(cart[aã]o|cr[eé]dito)( de cr[eé]dito)?\b/gi : /\bcr[eé]dito\b/gi, ' ')
    .replace(/\b(r\$|reais|real|ontem|anteontem|hoje|parcelado|em|de|no|na|com|gastei|paguei|comprei|recebi|recebido|ganhei|apliquei|investi|resgatei|aporte|resgate|pix)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^(entrada|sa[ií]da|gasto|despesa|receita)\s+/i, '')
    .replace(/^(do|da|dos|das|pro|pra|pelo|pela)\s+/i, '');
  if (inst) desc = (desc ? desc + ' ' : '') + inst;
  out.description = desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : '';
  return out.amount ? out : null;
}

// Família do ícone → categoria padrão (para "Uber" cair em Transporte, "iFood" em Alimentação…)
const ICON_FAMILY = {
  out: {
    transporte: 'car car-front car-taxi-front bus train-front tram-front bike motorbike square-parking ticket plane',
    alimentacao: 'utensils utensils-crossed hamburger pizza coffee croissant ice-cream-cone candy beer cake sandwich soup',
    mercado: 'shopping-cart shopping-basket apple beef fish egg milk carrot',
    farmacia: 'pill pill-bottle',
    saude: 'stethoscope hospital microscope toothbrush syringe glasses heart-pulse dumbbell baby',
    contas: 'lightbulb droplet flame wifi smartphone',
    moradia: 'key-round building house hammer wrench sofa refrigerator spray-can washing-machine',
    assinaturas: 'film music repeat tv globe',
    lazer: 'gamepad-2 clapperboard party-popper palmtree beer dices',
    educacao: 'graduation-cap book-open printer laptop',
    roupas: 'shirt footprints scissors sparkles gem watch',
    fornecedores: 'truck package boxes',
    impostos: 'landmark triangle-alert scale calculator',
    pix: 'arrow-up-right',
    combustivel: 'fuel'
  },
  in: { vendas: 'shopping-bag store tv', servicos: 'briefcase laptop wrench', salario: 'wallet', pix_recebido: 'arrow-down-left' },
  invest: { tesouro: 'vault', renda_fixa: 'landmark', acoes: 'chart-candlestick', fundos: 'chart-pie', cripto: 'bitcoin', previdencia: 'umbrella', poupanca: 'piggy-bank' }
};
const familyOf = (icon, kind) => { const name = String(icon || '').replace(/^i:/, ''); const fam = ICON_FAMILY[kind] || {}; for (const [k, list] of Object.entries(fam)) if (list.split(' ').includes(name)) return k; return null; };

/* ===== Tipo automático: entrada, saída, cartão ou investimento ===== */
// "recebi", "paguei", "investi", "no cartão" e "3x" decidem sozinhos. Sem essas palavras, vale o jeito da pessoa:
// o que ela já lançou com as mesmas palavras, os nomes das categorias e contas fixas dela e o ícone (iFood é gasto,
// freela é entrada). Sem pista, vale a aba escolhida no app; sem aba, saída. A aba tocada pela pessoa vence as pistas.
const TYPE_RX = {
  invest: /(^| )(apliquei|aplicacao|aporte|aportei|investi|guardei|resgatei|resgate)( |$)/,
  in: /(^| )(recebi|recebido|recebida|recebimento|ganhei|vendi|venda|vendas|faturei|caiu|entrou|pix recebido|pagamento recebido)( |$)/,
  card: /(^| )(no|pelo|com o|com|no meu|pelo meu|com meu) (cartao|credito)( |$)|(^| )(credito|parcelado|parcelei|\d{1,2} ?x)( |$)| cartao$/,
  out: /(^| )(gastei|paguei|comprei|gasto|despesa|saida|pago)( |$)/,
  cash: /(^| )(pix|debito|dinheiro|especie|boleto|a vista)( |$)/,
  product: /(^| )(cdb|lci|lca|tesouro|selic|ipca|poupanca|acoes|fii|fiis|etf|bitcoin|btc|cripto|criptomoeda|previdencia|pgbl|vgbl)( |$)/
};
const typeText = s => norm(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
function explicitType(text) {
  const n = typeText(text);
  for (const k of ['invest', 'in', 'card', 'out']) if (TYPE_RX[k].test(n) && !(k === 'card' && NOT_MY_CARD.test(n))) return k;
  return null;
}
const TYPE_STOP = new Set(('de da do das dos para pra pro com sem por pelo pela uma um uns umas no na nos nas em que meu minha meus minhas seu sua seus suas '
  + 'reais real pix ted doc valor mes dia hoje ontem anteontem cartao credito debito dinheiro especie parcelado vista boleto '
  + 'gastei paguei comprei recebi recebido recebida ganhei vendi apliquei investi resgatei aporte resgate gasto pago entrada saida despesa receita').split(' '));
// palavras que ajudam a reconhecer o lançamento ("Venda de IPTV" → venda, iptv); plural vira singular
const typeWords = s => typeText(s).split(' ').filter(w => w.length >= 3 && !/^\d/.test(w) && !TYPE_STOP.has(w)).map(w => w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
// palavras dos nomes das categorias que todo mundo começa tendo: valem menos que um nome criado pela pessoa
const TYPE_GENERIC = new Set(typeWords('Alimentação Mercado Transporte Combustível Contas da casa Moradia Saúde Farmácia Lazer Assinaturas Educação Roupas PIX enviado Fornecedores Impostos e taxas Outros Vendas Serviços Salário PIX recebido Renda Fixa CDB Tesouro Direto Ações Fundos Criptomoedas Previdência Poupança'));
// q: o lançamento rápido (parseQuick); data: { txs, cats, recs, cards } do app ou { transactions, categories, recurring, cards } do banco;
// hint: { type, sure, pay, card } da tela (sure = a pessoa tocou na aba; pay = escolheu como pagou).
// Devolve o tipo, a categoria e o cartão sugeridos, de onde veio a decisão (by) e as pistas (votes).
function guessType(q, text, data, hint) {
  const desc = (q && q.description) || text || '', W = typeWords(desc), set = new Set(W), full = W.join(' ');
  const vote = { in: 0, out: 0, invest: 0 }, cats = {}, cardIds = {};
  let outW = 0, cardW = 0;
  const dirOf = t => (t === 'card' ? 'out' : t), add = (o, k, w) => { o[k] = (o[k] || 0) + w; };
  const list = (a, b) => (data && (data[a] || data[b])) || [];
  const catList = list('cats', 'categories'), cardList = list('cards', 'cards').filter(c => !c.archived);
  if (W.length) {
    // o que já foi lançado com as mesmas palavras (o mais recente pesa mais; descrição igual pesa o dobro)
    const txs = list('txs', 'transactions').slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 2000);
    txs.forEach((t, i) => {
      const dir = dirOf(t.type); if (!(dir in vote)) return;
      const D = typeWords(t.description); if (!D.length) return;
      const hit = D.filter(w => set.has(w)).length; if (!hit) return;
      const w = hit / (W.length + D.length - hit) * (D.join(' ') === full ? 2 : 1) / (1 + i / 300);
      vote[dir] += w;
      if (t.type === 'card') { cardW += w; if (t.card_id) add(cardIds, t.card_id, w); } else if (dir === 'out') outW += w;
      if (t.category_id) add(cats, dir + '|' + t.category_id, w);
    });
    // nomes das categorias e das contas fixas da pessoa ("Venda de IPTV" é entrada)
    // (nome inteiro na frase pesa mais na escolha da categoria: "Cerveja" antes de "Categoria importada")
    const nameW = name => { const C = typeWords(name), hits = C.filter(w => set.has(w)); return !hits.length ? [0, 0] : [hits.some(w => !TYPE_GENERIC.has(w)) ? 2 : 1, 0.5 + 0.5 * hits.length / C.length]; };
    for (const c of catList) {
      if (c.archived || c.legacy_key === 'outros' || !(c.kind in vote)) continue;
      const [w, cover] = nameW(c.name); if (w) { vote[c.kind] += w; add(cats, c.kind + '|' + c.id, w * cover); }
    }
    for (const r of list('recs', 'recurring')) {
      const dir = dirOf(r.type), [w, cover] = r.active === false || !(dir in vote) ? [0, 0] : nameW(r.name); if (!w) continue;
      vote[dir] += w;
      if (r.type === 'card') { cardW += w; if (r.card_id) add(cardIds, r.card_id, w); } else if (dir === 'out') outW += w;
      if (r.category_id) add(cats, dir + '|' + r.category_id, w * cover);
    }
    // o ícone, quando só faz sentido de um lado (uber → transporte, freela → serviços); "Pix Fulano" não diz o lado
    const icon = suggestIcon(desc.replace(/(^|\s)(pix|ted|doc|transferencia|transferência)(?=\s|$)/gi, ' '), 'out');
    if (iconIsSpecific(icon)) { const f = ['in', 'out', 'invest'].filter(k => familyOf(icon, k)); if (f.length === 1) vote[f[0]] += 1; }
  }
  const h = hint && ['in', 'out', 'card', 'invest'].includes(hint.type) ? hint : null;
  const exp = explicitType(text), qType = (q && q.type) || 'out', n = typeText(text);
  let dir, by;
  if (exp) { dir = dirOf(exp); by = 'texto'; }
  else if (h && h.sure) { dir = dirOf(h.type); by = 'aba'; }
  else {
    if (qType !== 'out') vote[dirOf(qType)] += 2; // palavra mais fraca do lançamento rápido ("salário", "entrada")
    if (TYPE_RX.product.test(n)) vote.invest += 2; // "cdb 500", "tesouro 1000"
    const tot = vote.in + vote.out + vote.invest, best = ['out', 'in', 'invest'].reduce((a, b) => (vote[b] > vote[a] ? b : a));
    if (vote[best] >= 0.25 && vote[best] >= 0.6 * tot) { dir = best; by = 'historico'; }
    else if (h) { dir = dirOf(h.type); by = 'aba'; }
    else { dir = dirOf(qType); by = 'padrao'; }
  }
  // saída: cartão quando a frase ou a tela dizem, ou quando a pessoa costuma pagar isso no cartão
  let type = dir, card_id = null;
  if (dir === 'out') {
    if (exp === 'card' || qType === 'card' || (h && h.type === 'card' && (by === 'aba' || h.pay))) type = 'card';
    else if (!(h && h.sure && h.pay) && !TYPE_RX.cash.test(n) && cardW >= 0.25 && cardW >= 0.6 * (cardW + outW)) type = 'card';
    if (type === 'card') {
      const ok = id => cardList.some(c => c.id === id);
      if (h && h.type === 'card' && h.card && ok(h.card)) card_id = h.card;
      else { const top = Object.entries(cardIds).filter(([id]) => ok(id)).sort((a, b) => b[1] - a[1])[0]; card_id = top ? top[0] : null; }
    }
  }
  // categoria mais usada com essas palavras (ou com o nome dela) do mesmo lado
  const catFor = (kind, min = 0.25) => {
    const top = Object.entries(cats).filter(([k]) => k.startsWith(kind + '|') && catList.some(c => c.id === k.slice(kind.length + 1) && c.kind === kind && !c.archived))
      .sort((a, b) => b[1] - a[1])[0];
    return top && top[1] >= min ? top[0].slice(kind.length + 1) : null;
  };
  const investKind = dir === 'invest' ? ((q && q.investKind === 'resgate') || /(^| )(resgatei|resgate|saquei)( |$)/.test(n) ? 'resgate' : 'aporte') : null;
  return { type, investKind, category_id: catFor(dir), card_id, by, votes: vote, catFor };
}
// ---------- descrição: tudo o que a pessoa disse ----------
// A IA às vezes resume ("Venda IPTV", "Farmácia") e perde o que importa (o cliente, a loja, para quem foi). Quando a
// descrição dela deixa de fora alguma palavra que a pessoa disse, vale a frase da pessoa, na ordem dela, sem o valor,
// a data, a forma de pagamento, o cartão e as palavras de comando: "entrada 30 venda iptv cliente odair" →
// "Venda IPTV cliente Odair". O nome depois de "cliente" sai com inicial maiúscula.
const NAME_STOP = new Set(('de da do das dos e o a os as no na nos nas em com pix via valor reais real hoje ontem anteontem pagou pago paga '
  + 'pagamento pagando mensal mensalidade renovou renovacao entrada saida venda vendi recebi recebido novo nova antigo antiga fixo fixa').split(' '));
const NAME_WORD = /^\p{L}[\p{L}'’-]*$/u;
const titleName = s => String(s || '').replace(/\p{L}[\p{L}'’-]*/gu, (w, i) => i && /^(de|da|do|das|dos|e)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1));
// "cliente odair", "do cliente José Carlos", "clienta Ana": o nome que vem depois (até 3 palavras)
function clientName(text) {
  const words = String(text || '').replace(/[.,;:!?()"“”]/g, ' ').split(/\s+/).filter(Boolean);
  const i = words.findIndex(w => /^(cliente|clienta|fregues|freguesa)$/.test(norm(w)));
  if (i < 0) return '';
  let j = i + 1;
  if (words[j] && /^(o|a|do|da|de)$/.test(norm(words[j]))) j++;
  const out = [];
  for (; j < words.length && out.length < 3; j++) {
    if (!NAME_WORD.test(words[j]) || NAME_STOP.has(norm(words[j])) || SAID_FUNC.has(norm(words[j]))) break;
    out.push(words[j]);
  }
  return out.join(' ');
}
// valor falado com centavos: "20 reais e 50 centavos" / "20 e 50 centavos" → "20,50" (um valor só). O reconhecimento
// de voz às vezes escreve o valor como hora ("onze e quarenta" → "11h40" ou "11:40"): vira 11,40 quando é o único
// número com cara de valor e nada em volta indica horário ("às", "das", "horas", "da manhã"…)
const CLOCK_BEFORE = /(?:^|\s)(?:as|às|das|pelas|ate|até|desde|hora|horas|horario|horário)\s*$/i;
const CLOCK_AFTER = /^\s*(?:h\b|hs\b|hrs?\b|horas?\b|min\b|minutos?\b|(?:da|de) (?:manh|tarde|noite|madrugada))/i;
function moneySaid(s) {
  const t = String(s || '').replace(/(\d+)\s*(?:reais|real|conto|contos)?\s+e\s+(\d{1,2})\s*centavos?/gi, (m, a, b) => `${a},${b.padStart(2, '0')}`);
  const hits = [...t.matchAll(/(\d{1,2})(?: ?h ?|:)([0-5]\d)(?![\d:])/gi)];
  if (hits.length !== 1) return t;
  const m = hits[0], before = t.slice(0, m.index), after = t.slice(m.index + m[0].length);
  if (+m[1] > 23 || /[\d.,:/]$/.test(before) || /^[.,:/]?\d/.test(after)) return t; // parte de outro número ou não é hora
  if (CLOCK_BEFORE.test(before) || CLOCK_AFTER.test(after)) return t; // horário de verdade
  if (/\d+[.,]\d{1,2}(?!\d)|(^|\D)\d{2,}(?!\d)|R\$\s*\d/i.test(`${before} ${after}`)) return t; // a frase já tem outro valor
  return `${before}${+m[1]},${m[2]}${after}`;
}
// palavras que não são "o que foi": números falados, comando, pagamento, tempo, muleta da fala
const NUM_WORDS = new Set('zero dois duas tres quatro cinco seis sete oito nove dez onze doze treze catorze quatorze quinze dezesseis dezessete dezoito dezenove vinte trinta quarenta cinquenta sessenta setenta oitenta noventa cem cento duzentos duzentas trezentos quatrocentos quinhentos seiscentos setecentos oitocentos novecentos mil milhao milhoes'.split(' '));
const SAID_SKIP = new Set(('lanca lancar lance lancado coloca colocar coloque bota botar registra registrar registre anota anotar anote ai mim favor ' +
  'reais real conto contos pila centavo centavos vez vezes x entrada saida gasto gastei gastou paguei pago paga pagou recebi recebido recebeu ganhei comprei comprou vendi vendeu ' +
  'foi teve tive hoje ontem anteontem agora dia mes semana passada passado ah eh hum hmm entao tipo ne bom olha assim oi ola ok okay beleza pronto isso aqui la so mais tambem ' +
  'valor pix pics piks debito dinheiro especie boleto transferencia ted doc cartao credito vista parcelado parcelei').split(' '));
const SAID_UNITS = /^(meses|mes|telas|tela|telinhas|unidades|unidade|kg|quilos|kilos|litros|litro|caixas|caixa|pacotes|pacote|horas|hora|pecas|itens|pontos|pessoas|semanas)$/;
// palavras de ligação: não contam como "o que foi"
const SAID_FUNC = new Set('de da do das dos no na nos nas em com sem e o a os as um uma uns umas que pelo pela pelos pelas por pra pro para eu ele ela meu minha meus minhas seu sua nosso nossa esse essa este esta isso aquele aquela ja ainda muito pouco'.split(' '));
// não precisam estar na descrição (a IA pode tirar): dizem o tipo, não o que foi
const SAID_GENERIC = new Set('cliente clienta pagamento pagamentos compra compras valor gasto gastos despesa despesas coisa coisas lancamento lancamentos referente'.split(' '));
const sayKey = w => { const n = norm(w).replace(/[^a-z0-9]/g, ''); return n.length > 4 && n.endsWith('s') ? n.slice(0, -1) : n; };
const sayLike = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) || (a.length >= 5 && b.length >= 5 && editDist1(a, b));
function editDist1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, d = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
  return d + (a.length - i) + (b.length - j) <= 1;
}
// a frase da pessoa, limpa: sem valor, data, parcelas "10x", forma de pagamento, cartão e comando (o "3/12" da parcela fica)
function saidPhrase(text, data) {
  const cards = new Set(((data && data.cards) || []).flatMap(c => norm(c.name).split(' ')).filter(w => w.length > 2));
  const parc = /(^| )(parcela|parcelas|prestacao|prestacoes|carne)( |$)/.test(norm(text));
  const toks = moneySaid(text).replace(/[“”"!?;:…()]+/g, ' ').replace(/,(?=\s|$)/g, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (let k = 0; k < toks.length; k++) {
    const w = toks[k], n = norm(w).replace(/[.,]+$/, '');
    if (parc && /^\d{1,2}\/\d{1,2}$/.test(n)) { out.push(n); continue; }
    if (/^\d{1,3}$/.test(n) && SAID_UNITS.test(norm(toks[k + 1] || ''))) { out.push(n); continue; } // "3 meses", "2 telas": quantidade, não valor
    if (/\d/.test(n) || /^r\$/.test(n) || NUM_WORDS.has(n) || SAID_SKIP.has(n) || cards.has(n)) { out.push(null); continue; }
    if (n === 'e' && (out.at(-1) === null || NUM_WORDS.has(norm(toks[k + 1] || '')))) { out.push(null); continue; } // "trinta e cinco"
    out.push(w.replace(/[.,]+$/, ''));
  }
  // tira a palavra de ligação que ficou solta: no começo, no fim ou antes de um buraco ("no pix pro joão" → "joão")
  const link = w => SAID_FUNC.has(norm(w));
  for (let again = true; again;) { // "que eu [comprei]": tira "eu", depois "que"
    again = false;
    for (let k = out.length - 1; k >= 0; k--) if (out[k] !== null && link(out[k]) && (k === out.length - 1 || out[k + 1] === null)) { out[k] = null; again = true; }
  }
  const words = out.filter(w => w !== null);
  while (words.length && link(words[0])) words.shift();
  return words.join(' ');
}
// parcela falada: "parcela três de doze", "parcela 3 de 12", "terceira parcela de doze", "última parcela de doze" → "3/12"
const SMALL_NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60 };
const ORD_NUM = { primeira: 1, primeiro: 1, segunda: 2, segundo: 2, terceira: 3, terceiro: 3, quarta: 4, quarto: 4, quinta: 5, quinto: 5, sexta: 6, sexto: 6,
  setima: 7, setimo: 7, oitava: 8, oitavo: 8, nona: 9, nono: 9, decima: 10, decimo: 10 };
function installmentSaid(text) {
  const t = norm(moneySaid(text)).replace(/[^a-z0-9/ ]+/g, ' ').split(' ').filter(Boolean);
  const num = i => {
    const w = t[i];
    if (w === undefined) return null;
    if (/^\d{1,2}$/.test(w)) return [+w, i + 1];
    const v = SMALL_NUM[w], u = SMALL_NUM[t[i + 2]];
    if (v === undefined) return null;
    return v >= 20 && t[i + 1] === 'e' && u >= 1 && u <= 9 ? [v + u, i + 3] : [v, i + 1];
  };
  const isMoney = i => /^(reais|real|conto|contos|centavo|centavos)$/.test(t[i] || '');
  for (let i = 0; i < t.length; i++) {
    if (!/^(parcela|parcelas|prestacao|prestacoes)$/.test(t[i])) continue;
    const near = t.slice(Math.max(0, i - 3), i + 5).find(w => /^\d{1,2}\/\d{1,2}$/.test(w));
    if (near) { const [a, b] = near.split('/').map(Number); if (a >= 1 && a <= b) return `${a}/${b}`; }
    const j = t[i + 1] === 'numero' ? i + 2 : i + 1, a = num(j);
    if (a && t[a[1]] === 'de') { const b = num(a[1] + 1); if (b && !isMoney(b[1]) && a[0] >= 1 && a[0] <= b[0]) return `${a[0]}/${b[0]}`; }
    const o = t[i - 1] === 'ultima' ? -1 : ORD_NUM[t[i - 1]];
    if (o && t[i + 1] === 'de') { const b = num(i + 2); if (b && !isMoney(b[1]) && o <= b[0]) return `${o < 0 ? b[0] : o}/${b[0]}`; }
  }
  return '';
}
// descrição final do assistente: a da IA se ela guardou tudo o que foi dito; senão a frase da pessoa
function personalDescription(desc, text, cat, data) {
  desc = String(desc || '').trim();
  const said = saidPhrase(text, data);
  const want = said.split(/\s+/).filter(w => w && NAME_WORD.test(w)).map(sayKey).filter(k => k.length > 1 && !SAID_GENERIC.has(k) && !TYPE_STOP.has(k) && !SAID_FUNC.has(k));
  const have = desc.split(/[\s/]+/).map(sayKey).filter(Boolean);
  const missing = want.filter(k => !have.some(h => sayLike(k, h)));
  let out = desc;
  if (missing.length && said) {
    const n = said.split(/\s+/).length;
    // a frase da pessoa (com os acentos dela), com as maiúsculas que a IA usou (IPTV, Drogasil)
    const aiCase = new Map(desc.split(/\s+/).filter(w => /\p{Lu}/u.test(w)).map(w => [sayKey(w), w]));
    const phrase = said.split(/\s+/).map(w => { const a = aiCase.get(sayKey(w)); return !a ? w : a.length > 1 && a === a.toUpperCase() ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
    out = n <= 12 ? phrase : `${desc} ${said.split(/\s+/).filter(w => missing.includes(sayKey(w))).join(' ')}`.trim();
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  // o nome do cliente com inicial maiúscula ("cliente odair" → "cliente Odair")
  const name = clientName(text);
  if (name) {
    const nw = new Set(name.split(/\s+/).map(norm));
    out = norm(out).includes(norm(name)) ? out.split(/\s+/).map(w => nw.has(norm(w)) ? titleName(w) : w).join(' ') : `${out} ${titleName(name)}`.trim();
  }
  // a parcela dita por extenso fica anotada: "parcela três de doze" → "… 3/12"
  const inst = installmentSaid(text);
  if (inst) {
    const [a, b] = inst.split('/');
    if (!out.includes(inst) && installmentSaid(out) !== inst && !new RegExp(`(^|\\D)${a}\\s*(de|/)\\s*${b}(\\D|$)`).test(norm(out))) out = `${out} ${inst}`.trim();
  }
  return out.slice(0, 140);
}

export { norm, suggestIcon, iconIsSpecific, familyOf, parseQuick, parseAmountBR, stripLeadingEmoji, explicitType, guessType, typeWords, personalDescription, clientName, titleName, saidPhrase, moneySaid, installmentSaid };
