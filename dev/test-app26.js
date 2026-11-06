// Versão 2.6 (jsdom, modo demonstração): detector de fugas de gastos (as 10 áreas, parcelas do cartão mês a mês,
// assinatura esquecida, contas que subiram, pequenos gastos, prioridade, plano de 30 dias com verba livre, IA opcional)
// e o tutorial opcional (oferecido uma vez, só para conta nova; "Mais tarde" no máximo 2 vezes; teclado e foco).
const { bootApp, click, type, localToday, sleep } = require('./jsdom-app');
const { checker } = require('./lib');
const { ok, done } = checker('versão 2.6 (fugas de gastos e tutorial)');

(async () => {
  const w = await bootApp({ onError: m => ok(false, m) }), d = w.document, M = w.__mc, S = M.S;
  await sleep(50);
  // o jsdom não mede a tela: todo elemento fora de [hidden] conta como visível
  w.Element.prototype.getClientRects = function () { return this.closest('[hidden]') ? [] : [{ x: 0, y: 0, width: 10, height: 10 }]; };
  const keep = { txs: S.txs, goals: S.goals, mode: S.mode, profile: { ...S.profile } };
  const cat = key => S.cats.find(c => c.legacy_key === key && c.kind === 'out').id;
  const now = new w.Date(), ago = n => { const x = new w.Date(now); x.setDate(x.getDate() - n); return M.isoOf(x); };
  const mon = (k, dom = 1) => M.isoOf(new w.Date(now.getFullYear(), now.getMonth() - k, dom));
  let n = 0;
  const T = (type, amount, date, description, category_id, extra = {}) => ({ id: 'lk' + (++n), type, amount, date, description, category_id, card_id: null, installments: 1, invest_kind: null, ...extra });
  const txs = [T('out', 200, ago(89), 'Mercado do mês', cat('mercado'))];
  for (let i = 0; i < 8; i++) txs.push(T('out', 45, ago(3 + i * 10), 'iFood', cat('lazer')));
  for (let k = 0; k < 3; k++) txs.push(
    T('out', 55.9, mon(k), 'Netflix', cat('assinaturas')), T('out', 21.9, mon(k), 'Spotify', cat('assinaturas')),
    T('out', 89, mon(k), 'Clube do vinho', cat('outros')), T('out', 32.9, mon(k), 'Tarifa pacote de serviços', cat('outros')),
    T('out', 180, mon(k), 'Conta de luz Enel', cat('contas')), T('in', 3500, mon(k), 'Salário', S.cats.find(c => c.kind === 'in').id),
    T('out', k ? 99.9 : 129.9, mon(k), 'Internet Fibra', cat('contas')), T('out', k ? 300 : 360, mon(k), 'Plano de saúde', cat('saude')));
  for (let i = 0; i < 12; i++) txs.push(T('out', 8.5, ago(2 + i * 7), 'Café', cat('alimentacao')));
  for (let i = 0; i < 10; i++) txs.push(T('out', 25, ago(4 + i * 8), 'Uber', cat('transporte')));
  txs.push(T('card', 2400, ago(40), 'TV Samsung', cat('outros'), { installments: 10 }), T('card', 360, ago(50), 'Shopee capinha', cat('outros'), { installments: 3 }));
  txs.push(T('out', 19.9, ago(6), '<img src=x onerror=alert(1)> presente', cat('outros')));
  S.txs = txs;
  S.goals = keep.goals.filter(g => g.category_id !== cat('lazer'));

  const A = M.leakAnalysis({ people: 1, income: 0 }), L = k => A.leaks.find(l => l.k === k);
  ok(A.days === 90 && Math.abs(A.months - 3) < 0.01, `90 dias analisados (3 meses): ${A.days}`);
  ok(Math.abs(A.incomeAvg - 3500) < 0.5 && Math.abs(A.income - 3500) < 0.5, 'renda: a média das entradas quando não informada (R$ 3.500)');
  ok(L('delivery') && Math.abs(L('delivery').monthly - 120) < 0.5 && Math.abs(L('delivery').save - 48) < 0.5, 'entrega de comida: R$ 120/mês, economia possível de 40% (R$ 48)');
  ok(L('subs') && L('subs').items.some(i => i.name === 'Clube do vinho') && L('subs').items.some(i => i.name === 'Netflix'), 'assinaturas: Netflix e a esquecida (o mesmo valor todo mês, "Clube do vinho")');
  ok(L('fees') && /Tarifa/.test(L('fees').items[0].name) && L('fees').diff === 'facil', 'taxas bancárias: a tarifa do pacote, fácil de cortar');
  ok(L('energy') && L('transport') && Math.abs(L('transport').monthly - 250 / 3) < 0.5, 'energia e transporte (Uber: R$ 83/mês)');
  const bills = L('bills');
  ok(bills && bills.rising.some(r => r.name === 'Plano de saúde' && r.pct === 20) && bills.rising.some(r => r.name === 'Internet Fibra' && r.pct === 30), 'contas que subiram: plano de saúde +20% e internet +30%');
  ok(bills && Math.abs(bills.save - ((99.9 * 2 + 129.9) / 3 * 0.2 + 60)) < 0.05 && bills.items.filter(i => i.name === 'Internet Fibra').length === 1, 'economia nas contas: 20% da internet + o aumento do plano (R$ 60); a internet aparece uma vez só');
  ok(L('small') && L('small').items[0].name === 'Café' && !L('small').items.some(i => /Mercado/.test(i.name)), 'pequenos gastos: o café (mercado não entra)');
  const impulse = L('impulse');
  ok(impulse && Math.abs(impulse.monthly - 240 / 3) < 0.5, 'cartão parcelado pesa por parcela: Shopee 3x conta só as 2 parcelas que já venceram');
  const spendTV = M.leakSpend(ago(89), localToday(w)).filter(s => s.t.description === 'TV Samsung');
  ok(spendTV.length === 2 && spendTV.every(s => s.amount === 240), 'TV em 10x: 2 parcelas de R$ 240 nos 90 dias (não R$ 2.400 de uma vez)');
  ok(!A.leaks.some(l => l.items.some(i => /Mercado do mês/.test(i.name))), 'mercado do mês não vira fuga');
  ok(A.leaks.every(l => ['alta', 'media', 'baixa'].includes(l.prio) && l.save > 0 && LEVELS.has(l.diff) && LEVELS.has(l.life)), 'toda fuga com economia, dificuldade, impacto e prioridade');
  ok(A.leaks[0].prio === 'alta' && A.leaks.every((l, i) => i === 0 || A.leaks[i - 1].score >= l.score), 'ordenadas pela prioridade (a primeira é Alta)');
  ok(Math.abs(A.saveTotal - A.leaks.reduce((s, l) => s + l.save, 0)) < 0.01 && A.saveTotal > 100, 'economia total = soma das fugas');
  const ids = A.plan.map(wk => wk.steps.map(s => s.id).join(','));
  ok(A.plan.length === 4 && /fees/.test(ids[0]) && /subs/.test(ids[0]) && /bills/.test(ids[0]) && /delivery/.test(ids[1]) && /small/.test(ids[1]) && /energy/.test(ids[2]) && /transport/.test(ids[2]) && /free/.test(ids[3]),
    'plano de 30 dias: corte rápido, comida e compras, casa e transporte, hábito (com verba livre): ' + JSON.stringify(ids));
  ok(A.freeWeek >= 20 && A.freeWeek % 5 === 0 && A.plan[3].steps[0].text.includes(`R$ ${A.freeWeek} por semana`), 'verba livre por semana, sem culpa (R$ ' + A.freeWeek + ')');
  const A4 = M.leakAnalysis({ people: 4, income: 2000 });
  ok(Math.abs(A4.leaks.find(l => l.k === 'delivery').perPerson - 30) < 0.5 && A4.income === 2000, 'casa com 4 pessoas: R$ 30 por pessoa no delivery; renda informada vale');
  const P = M.leakPrompt(A);
  ok(P.length <= 2000 && /auditor de gastos pessoais/.test(P) && /Tamanho da casa: 1 pessoa\./.test(P) && /Renda mensal: R\$\s?3\.500,00/.test(P) && /prisão financeira/.test(P), 'pedido para a IA: o do auditor, com a casa, a renda e as fugas (até 2.000 caracteres)');

  // ---- a página ----
  ok(!!d.querySelector('#side-nav [data-page="leaks"]'), 'menu lateral: Fugas de gastos');
  M.go('more'); await sleep(20);
  ok(!!d.querySelector('#page .setrow[data-page="leaks"]') && !!d.querySelector('#page .setrow[data-act="tourStart"]'), 'Menu do celular: Fugas de gastos e Tutorial do app');
  M.go('leaks'); await sleep(30);
  const cards = [...d.querySelectorAll('#page .lk-card')];
  ok(cards.length === A.leaks.length && d.querySelector('#page .lk-big').textContent.includes(','), `um cartão por fuga (${cards.length}) e o total no topo`);
  ok(cards.every(c => /Economia possível/.test(c.textContent) && /Dificuldade/.test(c.textContent) && /Impacto na vida/.test(c.textContent) && /Prioridade (Alta|Média|Baixa)/.test(c.textContent)), 'cada cartão: economia, dificuldade, impacto e prioridade');
  ok(!d.querySelector('#page img') && d.querySelector('#page').textContent.includes('<img src=x'), 'descrição do usuário aparece como texto (escapada)');
  ok(d.querySelector('.lk-day') === null && !!d.querySelector('[data-act="leakStart"]'), 'plano ainda não começado: botão Começar hoje');
  click(w, '[data-act="leakPeople"][data-d="1"]'); await sleep(20);
  ok(d.querySelector('#lk-people').textContent === '2' && M.leakSettings().people === 2, 'pessoas na casa: + vira 2');
  click(w, '[data-act="leakPeople"][data-d="-1"]'); await sleep(20);
  ok(d.querySelector('[data-act="leakPeople"][data-d="-1"]').disabled, 'não fica abaixo de 1 pessoa');
  type(w, '#lk-income', '5.000,00'); await sleep(20);
  ok(M.leakSettings().income === 5000 && /Renda mensal<\/span>/.test(d.querySelector('#page').innerHTML), 'renda informada: R$ 5.000 (sai o "média das entradas")');
  const step = d.querySelector('[data-act="leakStep"][data-id="subs"]');
  click(w, step); await sleep(20);
  ok(M.leakSettings().done.includes('subs') && M.leakSettings().start === localToday(w) && /Dia 1 de 30/.test(d.querySelector('.lk-day').textContent) && d.querySelector('[data-act="leakStep"][data-id="subs"]').checked,
    'marcar um passo começa o plano (dia 1 de 30) e fica marcado');
  click(w, '[data-act="leakStep"][data-id="subs"]'); await sleep(20);
  ok(!M.leakSettings().done.includes('subs'), 'desmarcar volta');
  const goalBtn = d.querySelector('#lk-delivery').closest('.lk-card').querySelector('[data-act="leakGoal"]');
  ok(goalBtn && goalBtn.dataset.cat === cat('lazer') && +goalBtn.dataset.v === 70, 'delivery: sugere limite de R$ 70 em Lazer (R$ 120 − R$ 48 de economia, que ainda não tem limite)');
  ok(!d.querySelector('#lk-bills').closest('.lk-card').querySelector('[data-act="leakGoal"]') && !d.querySelector('#lk-energy').closest('.lk-card').querySelector('[data-act="leakGoal"]'), 'conta (preço) não vira limite de gasto');
  click(w, goalBtn); await sleep(60);
  ok(d.querySelector('.sheet #ge-cat')?.value === cat('lazer') && +d.querySelector('.sheet #ge-amount').value.replace(',', '.') === +goalBtn.dataset.v, 'abre a meta já preenchida (categoria e limite)');
  M.ACT.closeSheet(); await sleep(20);
  click(w, '[data-act="leakAI"]'); await sleep(700);
  ok(M.LEAK.ai && /Maior fuga/.test(M.LEAK.ai.text) && d.querySelector('#page .lk-ai'), 'auditoria com IA (demonstração): parecer na tela');
  ok(!/_/.test(d.querySelector('#page .lk-ai').textContent), 'sem sublinhados soltos no parecer');

  // ---- Início: uma linha discreta ----
  M.go('home'); await sleep(30);
  const ins = [...d.querySelectorAll('#page .ins-row')].find(r => /Fugas de gastos/.test(r.textContent));
  ok(ins && ins.querySelector('[data-act="go"][data-page="leaks"]'), 'resumo do Início: "Fugas de gastos: até R$ … por mês" com Ver fugas');

  // ---- ligar e desligar sem perder nada ----
  M.ACT.feature({ dataset: { k: 'leaks' } }); await sleep(20);
  ok(!d.querySelector('#side-nav [data-page="leaks"]') && !M.insightItems(S.month).items.some(i => /Fugas/.test(i.text)), 'desligado em Ajustes: some do menu e do Início');
  M.go('leaks'); await sleep(20);
  ok(S.page === 'home', 'desligado: a página não abre');
  M.ACT.feature({ dataset: { k: 'leaks' } }); await sleep(20);
  ok(!!d.querySelector('#side-nav [data-page="leaks"]') && M.leakSettings().income === 5000, 'religado: volta com a renda que estava');

  // ---- sem gastos ----
  S.txs = [];
  M.go('leaks'); await sleep(20);
  ok(/Ainda não há gastos para analisar/.test(d.querySelector('#page').textContent), 'sem gastos: explica o que fazer');
  S.txs = txs;

  // ---- tutorial: oferecido só para conta nova, uma vez, sem insistir ----
  M.go('home'); await sleep(20);
  const T0 = M.TOUR, settings = () => S.profile.settings || {};
  const asLive = (plan = 'trial', list = []) => { S.mode = 'live'; S.profile.plan = plan; S.profile.active = true; S.profile.plan_expiry = new w.Date(Date.now() + 10 * 864e5).toISOString(); S.txs = list; T0.offered = false; };
  asLive('master');
  M.tourMaybeOffer();
  ok(!d.querySelector('#tour-ask'), 'dono (master): não oferece');
  asLive('trial', txs);
  M.tourMaybeOffer();
  ok(!d.querySelector('#tour-ask'), 'conta com muitos lançamentos: não oferece');
  asLive('trial', []);
  M.tourMaybeOffer();
  ok(!!d.querySelector('#tour-ask') && /Quer um tour rápido/.test(d.querySelector('#tour-ask').textContent), 'conta nova: oferece o tour, sem travar a tela');
  ok(['Fazer o tour', 'Mais tarde', 'Não, obrigado'].every(t => [...d.querySelectorAll('#tour-ask button')].some(b => b.textContent === t)), 'três escolhas: fazer, mais tarde, não');
  click(w, '#tour-ask [data-act="tourLater"]'); await sleep(20);
  ok(!d.querySelector('#tour-ask') && settings().tour.asks === 1 && !!settings().tour.later, '"Mais tarde": some e anota');
  T0.offered = false; M.tourMaybeOffer();
  ok(!d.querySelector('#tour-ask'), 'antes de 24 h não pergunta de novo');
  S.profile.settings = { ...settings(), tour: { ...settings().tour, later: new w.Date(Date.now() - 2 * 864e5).toISOString() } };
  T0.offered = false; M.tourMaybeOffer();
  ok(!!d.querySelector('#tour-ask'), 'depois de 24 h pergunta mais uma vez');
  M.go('txs'); await sleep(20);
  ok(!d.querySelector('#tour-ask') && settings().tour.asks === 2, 'ignorou (foi para outra página): conta como mais tarde');
  M.go('home'); await sleep(20);
  S.profile.settings = { ...settings(), tour: { ...settings().tour, later: new w.Date(Date.now() - 3 * 864e5).toISOString() } };
  T0.offered = false; M.tourMaybeOffer();
  ok(!d.querySelector('#tour-ask'), 'depois de 2 vezes nunca mais pergunta sozinho');
  S.profile.settings = { ...settings(), tour: { asks: 0 } };
  T0.offered = false; M.tourMaybeOffer();
  click(w, '#tour-ask [data-act="tourNo"]'); await sleep(20);
  T0.offered = false; M.tourMaybeOffer();
  ok(settings().tour.skip === true && !d.querySelector('#tour-ask'), '"Não, obrigado": não pergunta mais');

  // ---- o tour ----
  const steps = M.tourSteps();
  ok(steps[0].title === 'Bem-vindo ao Meu Caixa' && steps.at(-1).last && steps.some(s => s.title === 'Menu') && !steps.some(s => s.title === 'Ajustes'), 'celular: passos com o Menu');
  ok(steps.some(s => s.title === 'Lançar com IA') && steps.some(s => s.sel === '#mnav .fab'), 'mostra Lançar com IA e o botão +');
  M.go('more'); await sleep(20);
  click(w, '#page .setrow[data-act="tourStart"]'); await sleep(30);
  const tip = () => d.querySelector('#tour-root .tour-tip'), title = () => d.querySelector('#tour-t').textContent;
  ok(S.page === 'home' && tip() && tip().getAttribute('role') === 'dialog' && tip().getAttribute('aria-modal') === 'true' && title() === 'Bem-vindo ao Meu Caixa', 'pelo Menu: abre o tour no Início, como janela acessível');
  ok(/^1 de \d+$/.test(d.querySelector('.tour-n').textContent) && !!d.querySelector('.tour-btns [data-act="tourEnd"]'), 'passo 1: contador e Pular');
  click(w, '.tour-btns [data-act="tourNext"]'); await sleep(20);
  ok(title() === 'O saldo do mês' && !d.querySelector('.tour-hole').hidden, 'Próximo: o saldo do mês, com destaque');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await sleep(20);
  ok(title() === 'Lançar com IA', 'seta para a direita avança');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await sleep(20);
  ok(title() === 'O saldo do mês', 'seta para a esquerda volta');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'n', bubbles: true })); await sleep(20);
  ok(!d.querySelector('.sheet'), 'atalho N não abre lançamento com o tour aberto');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(20);
  ok(!d.querySelector('#tour-root') && T0.i === -1 && settings().tour.done === true, 'Esc fecha e anota que viu');
  // recurso desligado: o passo some; até o fim
  S.profile.settings = { ...settings(), features: { ...(settings().features || {}), assist: false } };
  M.render(); M.ACT.tourStart(); await sleep(20);
  for (let i = 0; i < 12 && !M.TOUR.steps[M.TOUR.i].last; i++) { click(w, '.tour-btns [data-act="tourNext"]'); await sleep(5); }
  ok(!M.TOUR.steps.some(s => s.title === 'Lançar com IA') && title() === 'Pronto!', 'Lançar com IA desligado: o passo não aparece; chega ao fim');
  ok(!!d.querySelector('.tour-btns [data-act="tourFirstTx"]'), 'sem lançamentos: o fim oferece o primeiro lançamento');
  click(w, '.tour-btns [data-act="tourFirstTx"]'); await sleep(60);
  ok(!d.querySelector('#tour-root') && !!d.querySelector('.sheet #tx-amount'), 'Primeiro lançamento: fecha o tour e abre o lançamento');
  M.ACT.closeSheet(); await sleep(20);
  M.go('settings'); await sleep(20);
  ok(!!d.querySelector('#page [data-act="tourStart"]') && !!d.querySelector('#page [data-act="feature"][data-k="leaks"]'), 'Ajustes: Tutorial do app e o interruptor de Fugas de gastos');

  // devolve a demonstração como estava
  S.mode = keep.mode; Object.assign(S.profile, keep.profile); S.txs = keep.txs; S.goals = keep.goals;
  done();
})().catch(e => { ok(false, 'erro: ' + (e.stack || e)); done(); });
const LEVELS = new Set(['facil', 'media', 'dificil', 'baixo', 'medio', 'alto']);
