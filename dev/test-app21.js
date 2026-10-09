// Versão 2.1 (jsdom, modo demonstração): contas fixas, cobrança no WhatsApp, lançamento automático,
// metas e alertas, liga/desliga de recursos, instalação e atalho "Novo lançamento".
const { bootApp, click, type, localToday, sleep } = require('./jsdom-app');
const { checker, SITE } = require('./lib');
const { ok, done } = checker('versão 2.1');

(async () => {
  const w = await bootApp({ onError: m => ok(false, m) });
  const d = w.document, M = w.__mc, S = M.S;
  const today = localToday(w), cur = today.slice(0, 7);
  const prevMonth = (() => { const [y, m] = cur.split('-').map(Number); const p = new Date(y, m - 2, 1); return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}`; })();
  ok(S.recs.length === 8 && S.goals.length === 4, 'demonstração traz contas fixas e metas');

  // ---- situação das contas ----
  const prev = M.recItems(prevMonth);
  ok(prev.find(i => i.r.name === 'Aluguel').status === 'paid', 'mês passado: aluguel pago (lançamento ligado)');
  ok(prev.find(i => i.r.name === 'Cliente Ana').status === 'paid', 'mês passado: cliente pagou');
  const breno = M.recItems(cur).find(i => i.r.name === 'Cliente Breno');
  ok(breno && ['open', 'today', 'late'].includes(breno.status), 'mês atual: cliente do dia 28 pendente');
  ok(M.recSummary(cur).toReceive >= 30, 'resumo: falta receber calculado');

  // ---- tela Contas fixas ----
  M.go('bills'); await sleep(10);
  const page = () => d.querySelector('#page').textContent;
  ok(/A receber/.test(page()) && /A pagar/.test(page()), 'tela Contas fixas com A receber e A pagar');
  const cobrar = d.querySelector('a[aria-label^="Cobrar Cliente Breno"]');
  ok(cobrar && /^https:\/\/wa\.me\/5522977770000\?text=/.test(cobrar.href) && decodeURIComponent(cobrar.href).includes('R$'), 'Cobrar abre o WhatsApp com +55 e o valor');

  // ---- Recebi: lança já preenchido e marca como recebido ----
  const n0 = S.txs.length;
  click(w, `[data-act="recPay"][data-id="${breno.r.id}"]`); await sleep(20);
  ok(d.querySelector('#tx-title').textContent === 'Confirmar recebimento', 'confirmar recebimento abre já preenchido');
  ok(d.querySelector('#tx-amount').value === '30' && d.querySelector('#tx-desc').value === 'Cliente Breno', 'valor e nome vêm da conta fixa');
  click(w, '[data-act="txSave"]'); await sleep(40);
  ok(S.txs.length === n0 + 1 && M.recItems(cur).find(i => i.r.id === breno.r.id).status === 'paid', 'recebido: vira pago e lança a entrada');
  M.payRec(breno.r.id, cur); await sleep(10); click(w, '[data-act="txSave"]'); await sleep(40);
  ok(S.txs.length === n0 + 1 && /já foi lançada/.test(d.querySelector('#toast-root').textContent), 'não deixa lançar a mesma conta 2× no mês');
  M.ACT.closeSheet();

  // ---- conta automática: lança 1× no dia e não repete ----
  const auto = await M.api().addRec({ type: 'out', name: 'Seguro auto', amount: 150, day: 1, category_id: null, card_id: null, start_month: cur, end_month: null, phone: null, auto: true });
  S.recs.push(auto);
  const made1 = await M.autoRecurring(), made2 = await M.autoRecurring();
  ok(made1 === 1 && made2 === 0 && S.txs.some(t => t.recurring_id === auto.id && t.date === cur + '-01'), 'conta automática lança 1× no dia e não repete');

  // ---- cadastro pela tela ----
  M.go('bills'); await sleep(10);
  click(w, '[data-act="recEdit"][data-type="in"]'); await sleep(20);
  ok(d.querySelector('#re-title').textContent === 'Nova conta fixa' && d.querySelector('[data-act="recType"][data-t="in"]').getAttribute('aria-pressed') === 'true', 'nova conta a receber');
  type(w, '#re-name', 'Cliente Teste'); type(w, '#re-amount', '50'); type(w, '#re-phone-in', '(22) 99999-1234');
  click(w, '[data-act="recSave"]'); await sleep(40);
  const ct = S.recs.find(r => r.name === 'Cliente Teste');
  ok(ct && ct.amount === 50 && ct.phone === '22999991234' && ct.type === 'in', 'conta a receber salva com WhatsApp só em números');
  click(w, '[data-act="recEdit"][data-type="out"]'); await sleep(20);
  type(w, '#re-name', 'Internet da loja'); await sleep(5);
  const contas = S.cats.find(c => c.legacy_key === 'contas' && c.kind === 'out');
  ok(d.querySelector(`#re-cats [data-id="${contas.id}"]`).getAttribute('aria-pressed') === 'true', 'nome "Internet" escolhe Contas da casa');
  M.ACT.closeSheet();

  // ---- metas ----
  const mercado = S.goals.find(g => g.kind === 'budget' && S.catMap[g.category_id].legacy_key === 'mercado');
  const spend = M.spendByCat(cur).find(x => x.cat.id === mercado.category_id);
  ok(M.goalProgress(mercado, cur).v === (spend ? spend.v : 0), 'limite: progresso = gastos da categoria no mês');
  const inc = S.goals.find(g => g.kind === 'income');
  ok(M.goalProgress(inc, cur).v === M.totals(cur).in, 'faturamento: progresso = entradas do mês');
  const ps = M.goalProgress(S.goals.find(g => g.kind === 'save'), cur);
  ok(ps.v > 0 && ps.perMonth > 0 && ps.months >= 1, 'objetivo: soma investimentos e calcula quanto guardar por mês');
  M.openTx(); await sleep(10);
  click(w, '[data-act="txType"][data-t="out"]');
  type(w, '#tx-amount', '900'); click(w, `[data-act="txCat"][data-id="${mercado.category_id}"]`); click(w, '[data-act="txSave"]'); await sleep(40);
  ok(/limite de Mercado estourado/i.test(d.querySelector('#toast-root').textContent), 'alerta quando passa do limite');
  M.go('goals'); await sleep(10);
  click(w, '[data-act="goalEdit"]'); await sleep(20);
  click(w, '[data-act="goalKind"][data-k="save"]'); await sleep(5);
  type(w, '#ge-name', 'Moto nova'); type(w, '#ge-amount', '12.000'); type(w, '#ge-deadline', '2027-12');
  click(w, '[data-act="goalSave"]'); await sleep(40);
  const moto = S.goals.find(g => g.name === 'Moto nova');
  ok(moto && moto.amount === 12000 && moto.deadline === '2027-12-31', 'objetivo criado pela tela (prazo no fim do mês)');
  ok(/Moto nova/.test(page()), 'objetivo aparece na tela de Metas');

  // ---- Início ----
  M.go('home'); await sleep(10);
  ok(/Contas do mês/.test(page()) && /Metas/.test(page()), 'Início mostra Contas do mês e Metas');
  const RS = M.recSummary(cur);
  ok(!(RS.toPay + RS.toReceive) || /Previsto no fim do mês/.test(d.querySelector('.receipt').textContent), 'cupom mostra a previsão do fim do mês');
  ok(M.insights(cur).some(t => /conta|limite/i.test(t)), 'resumo do mês fala de contas fixas ou limites');

  // ---- cobrança leva a chave PIX ----
  S.profile.settings = { ...S.profile.settings, pixKey: 'caixa@exemplo.com' };
  ok(decodeURIComponent(M.chargeLink(M.recItems(cur).find(i => i.r.phone))).includes('PIX: caixa@exemplo.com'), 'cobrança leva a chave PIX');

  // ---- liga/desliga Metas e Contas fixas ----
  M.go('settings'); await sleep(10);
  click(w, '[data-act="feature"][data-k="goals"]'); await sleep(20);
  ok(!d.querySelector('#side-nav [data-page="goals"]'), 'Metas desligadas: somem do menu');
  M.go('goals'); await sleep(10);
  ok(S.page === 'home' && !/Ver metas/.test(page()), 'Metas desligadas: tela e painel do Início somem');
  ok(M.budgetAlert({ type: 'out', category_id: mercado.category_id, date: today, amount: 1 }) === '', 'Metas desligadas: sem alerta de limite');
  ok(S.goals.length >= 5, 'desligar não apaga as metas');
  M.go('settings'); await sleep(10); click(w, '[data-act="feature"][data-k="goals"]'); await sleep(20);
  ok(d.querySelector('#side-nav [data-page="goals"]'), 'Metas religadas: voltam ao menu');
  click(w, '[data-act="feature"][data-k="bills"]'); await sleep(20);
  ok(!d.querySelector('#side-nav [data-page="bills"]') && (await M.autoRecurring()) === 0, 'Contas fixas desligadas: somem e não lançam sozinhas');
  M.go('home'); await sleep(10);
  ok(!/Contas do mês/.test(page()) && !/Previsto no fim do mês/.test(page()), 'Contas fixas desligadas: Início sem contas e sem previsão');
  M.go('settings'); await sleep(10); click(w, '[data-act="feature"][data-k="bills"]'); await sleep(20);
  ok(d.querySelector('#side-nav [data-page="bills"]'), 'Contas fixas religadas');

  // ---- instalação ----
  ok(d.querySelector('link[rel="manifest"]') && d.querySelector('link[rel="apple-touch-icon"]'), 'página aponta o manifest e o ícone do iPhone');
  M.go('settings'); await sleep(10);
  ok(/Instalar o Meu Caixa/.test(page()), 'Ajustes oferece instalar o app');
  ok(/Meu Caixa \d+\.\d+\.\d+/.test(page()), 'versão aparece em Ajustes');

  // ---- atalho do ícone: ?novo=1 abre Novo lançamento ----
  const w2 = await bootApp({ url: SITE + 'app.html?novo=1', onError: m => ok(false, m) }); await sleep(400);
  const t2 = w2.document.querySelector('#tx-title');
  ok(t2 && t2.textContent === 'Novo lançamento', 'atalho "Novo lançamento" (?novo=1) abre a folha');

  done();
})().catch(e => { console.log('❌ exceção', e); process.exit(1); });
