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
function parseQuick(text, today) {
  // pontuação de frase ("…uber ontem.", "uber, ontem") não atrapalha; "3.600" e "52,90" continuam valores
  const raw = String(text || '').replace(/[!?.;…]+(?=\s|$)/g, ' ').replace(/,(?=\s)/g, ' ').trim();
  if (!raw) return null;
  const n = norm(raw);
  const out = { type: 'out', amount: null, installments: 1, date: today, description: '', investKind: null };
  // valor: primeiro número "de dinheiro" (ignora "10x" e datas tipo 05/10)
  const amtRx = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?(?:\s?k\b)?)(?![\d/x])/i;
  const parcRx = /(\d{1,2})\s*x\b/i;
  const pm = parcRx.exec(n);
  if (pm) { out.installments = Math.min(48, Math.max(1, +pm[1])); out.type = 'card'; }
  const cleanForAmt = raw.replace(parcRx, ' ').replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ');
  const am = amtRx.exec(cleanForAmt);
  if (am) out.amount = parseAmountBR(am[1].replace(/\s+/g, ''));
  // tipo
  if (/(^| )(recebi|recebido|entrada|ganhei|vendi|venda|faturei|pix recebido|caiu|salario|pagamento recebido)( |$)/.test(n)) out.type = 'in';
  if (/(^| )(apliquei|aporte|investi|investimento|guardei)( |$)/.test(n)) { out.type = 'invest'; out.investKind = 'aporte'; }
  if (/(^| )(resgatei|resgate|saquei do investimento)( |$)/.test(n)) { out.type = 'invest'; out.investKind = 'resgate'; }
  if (/(^| )(cartao|credito|no credito|parcelado)( |$)/.test(n) && out.type === 'out') out.type = 'card';
  // data
  const d = new Date(today + 'T12:00:00');
  if (/(^| )anteontem( |$)/.test(n)) d.setDate(d.getDate() - 2);
  else if (/(^| )ontem( |$)/.test(n)) d.setDate(d.getDate() - 1);
  const dm = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(raw);
  if (dm) {
    const y = dm[3] ? (+dm[3] < 100 ? 2000 + +dm[3] : +dm[3]) : d.getFullYear();
    const cand = new Date(y, +dm[2] - 1, +dm[1], 12);
    if (cand.getMonth() === +dm[2] - 1) d.setTime(cand.getTime());
  }
  out.date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  // descrição: o texto sem valor/datas/palavras de comando
  let desc = raw
    .replace(am ? am[0].trim() : '', ' ')
    .replace(parcRx, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
    .replace(/\b(r\$|reais|real|ontem|anteontem|hoje|no cart[aã]o|cart[aã]o|cr[eé]dito|no cr[eé]dito|parcelado|em|de|no|na|com|gastei|paguei|comprei|recebi|recebido|ganhei|apliquei|investi|resgatei|aporte|resgate|pix)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^(do|da|dos|das|pro|pra|pelo|pela)\s+/i, '');
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

export { norm, suggestIcon, iconIsSpecific, familyOf, parseQuick, parseAmountBR, stripLeadingEmoji };
