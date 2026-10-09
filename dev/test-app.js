// Interface do app (modo demonstração, jsdom): lançar, lançamento rápido, parcelas, editar, excluir/desfazer,
// XSS, categorias e ícones, temas, cartão no saldo, todas as telas, IA local, PDF e "trazer do app antigo".
const { bootApp, click, type, localToday, sleep } = require('./jsdom-app');
const { checker } = require('./lib');
const { ok, done } = checker('interface');

(async () => {
  const w = await bootApp({ onError: m => ok(false, m) });
  const d = w.document, M = w.__mc;
  ok(M, 'gancho de teste presente');
  ok(!d.querySelector('#app').hidden, 'app visível no modo demonstração');
  ok(/Demonstração com dados de exemplo/.test(d.querySelector('#page').textContent), 'aviso de demonstração no Início');
  ok(d.querySelector('.receipt .r-val'), 'cupom do saldo renderizado');

  // ---- fatura do cartão ----
  const c916 = { closing_day: 9, due_day: 16 }, c255 = { closing_day: 25, due_day: 5 };
  ok(M.invoiceMonth('2026-10-05', c916) === '2026-10', 'compra antes do fechamento → fatura do mês');
  ok(M.invoiceMonth('2026-10-12', c916) === '2026-11', 'compra depois do fechamento → próxima fatura');
  ok(M.invoiceMonth('2026-10-20', c255) === '2026-11', 'vencimento no mês seguinte ao fechamento');
  ok(M.invoiceMonth('2026-10-26', c255) === '2026-12', 'depois do fechamento com vencimento no mês seguinte');
  ok(M.invoiceMonth('2026-12-15', c916) === '2027-01', 'virada de ano');
  ok(JSON.stringify(M.splitInstallments(100, 3)) === '[33.33,33.33,33.34]', 'parcelas com centavos certos (diferença na última)');
  ok(Math.abs(M.splitInstallments(2399.9, 10).reduce((a, b) => a + b, 0) - 2399.9) < 1e-9, 'soma das parcelas = total');

  // ---- novo lançamento: categoria escolhida pela descrição ----
  const n0 = M.S.txs.length;
  click(w, '[data-act="newTx"]'); await sleep(20);
  ok(d.querySelector('.sheet #tx-title').textContent === 'Novo lançamento', 'folha de lançamento abre');
  click(w, '[data-act="txType"][data-t="out"]');
  type(w, '#tx-amount', '52,90');
  type(w, '#tx-desc', 'Drogasil'); await sleep(320);
  const farm = M.S.cats.find(c => c.legacy_key === 'farmacia' && c.kind === 'out');
  ok(d.querySelector(`.cat[data-id="${farm.id}"]`).getAttribute('aria-pressed') === 'true', 'descrição "Drogasil" escolhe Farmácia sozinha');
  click(w, '[data-act="txSave"]'); await sleep(30);
  ok(M.S.txs.length === n0 + 1, 'lançamento salvo');
  const saved = M.S.txs.find(t => t.description === 'Drogasil');
  ok(saved && saved.amount === 52.9 && saved.category_id === farm.id && saved.type === 'out', 'valores corretos (52,90 / Farmácia / saída)');
  ok(saved && saved.date === localToday(w), 'data padrão = hoje no horário local (não UTC)');

  // ---- lançamento rápido ----
  click(w, '[data-act="newTx"]'); await sleep(20);
  type(w, '#tx-quick', 'uber 23 ontem'); click(w, '[data-act="txQuick"]'); await sleep(10);
  ok(d.querySelector('#tx-amount').value === '23,00', 'rápido: valor formatado');
  ok(d.querySelector('#tx-desc').value === 'Uber', 'rápido: descrição');
  const transp = M.S.cats.find(c => c.legacy_key === 'transporte' && c.kind === 'out');
  ok(d.querySelector(`.cat[data-id="${transp.id}"]`).getAttribute('aria-pressed') === 'true', 'rápido: "Uber" → Transporte');
  click(w, '[data-act="txSave"]'); await sleep(30);

  // ---- parcelado no cartão pelo lançamento rápido ----
  click(w, '[data-act="newTx"]'); await sleep(20);
  type(w, '#tx-quick', 'notebook 3.600 12x'); click(w, '[data-act="txQuick"]'); await sleep(10);
  ok(d.querySelector('#tx-inst') && d.querySelector('#tx-inst').value === '12', 'rápido: 12x no cartão');
  ok(/12x de R\$\s?300,00/.test(d.querySelector('#tx-inst-info').textContent), 'prévia das parcelas: 12x de R$ 300,00');
  click(w, '[data-act="txSave"]'); await sleep(30);
  const nb = M.S.txs.find(t => t.description === 'Notebook');
  ok(nb && nb.type === 'card' && nb.installments === 12 && nb.card_id, 'compra parcelada salva no cartão');
  const parts = nb ? M.installmentsOf(nb) : [];
  ok(parts.length === 12 && parts[11].month > parts[0].month, '12 parcelas em meses seguidos');

  // ---- editar ----
  M.go('txs'); await sleep(10);
  click(w, `[data-act="editTx"][data-id="${saved.id}"]`); await sleep(20);
  ok(d.querySelector('#tx-title').textContent === 'Editar lançamento', 'edição abre');
  type(w, '#tx-amount', '60'); click(w, '[data-act="txSave"]'); await sleep(30);
  ok(M.S.txs.find(t => t.id === saved.id).amount === 60, 'edição salva');

  // ---- excluir e desfazer ----
  const before = M.S.txs.length;
  M.openTx(saved.id); await sleep(10); click(w, '[data-act="txDelete"]'); await sleep(30);
  ok(M.S.txs.length === before - 1, 'exclusão');
  ok(d.querySelector('[data-act="toastAction"]'), 'botão Desfazer aparece');
  click(w, '[data-act="toastAction"]'); await sleep(40);
  ok(M.S.txs.length === before && M.S.txs.some(t => t.description === 'Drogasil' && t.amount === 60), 'Desfazer restaura');

  // ---- XSS ----
  M.openTx(); await sleep(10);
  type(w, '#tx-amount', '1'); type(w, '#tx-desc', '<img src=x onerror="window.__xss=1">'); click(w, '[data-act="txSave"]'); await sleep(40);
  M.go('txs'); await sleep(10);
  ok(!d.querySelector('#page img') && !w.__xss, 'descrição com HTML aparece como texto (sem XSS)');

  // ---- categoria nova: ícone automático + seletor + emoji ----
  M.go('cats'); await sleep(10);
  click(w, '[data-act="editCat"][data-kind]'); await sleep(10);
  const tile0 = d.querySelector('#ce-tile').innerHTML;
  type(w, '#ce-name', 'Drogaria do bairro'); await sleep(5);
  ok(d.querySelector('#ce-tile').innerHTML !== tile0, 'ícone muda enquanto digita o nome');
  click(w, '[data-act="ceSave"]'); await sleep(30);
  const nc = M.S.cats.find(c => c.name === 'Drogaria do bairro');
  ok(nc && nc.icon === 'i:pill', 'ícone automático: drogaria → pílula');
  click(w, `[data-act="editCat"][data-id="${nc.id}"]`); await sleep(10);
  click(w, '[data-act="ceIcon"]'); await sleep(10);
  type(w, '#pick-q', 'cachorro'); await sleep(5);
  ok(d.querySelector('[data-act="pickIt"][data-v="i:paw-print"]'), 'busca de ícone em português (cachorro → pata)');
  click(w, '[data-act="pickTab"][data-t="emoji"]'); await sleep(5);
  type(w, '#pick-emoji', '🦷'); click(w, '[data-act="pickCustom"]'); await sleep(5);
  click(w, '[data-act="ceSave"]'); await sleep(30);
  ok(M.S.cats.find(c => c.id === nc.id).icon === '🦷', 'emoji personalizado salvo');

  // ---- temas ----
  M.go('settings'); await sleep(10);
  click(w, '[data-act="theme"][data-t="cyber"]'); await sleep(10);
  ok(d.documentElement.getAttribute('data-mc-theme') === 'cyber', 'tema Cyber aplicado');
  ok(w.localStorage.getItem('mc_theme_v2') === '"cyber"', 'tema lembrado no aparelho');
  click(w, '[data-act="theme"][data-t="light"]'); await sleep(10);
  ok(d.documentElement.getAttribute('data-mc-theme') === 'light', 'tema Claro aplicado');

  // ---- cartão no saldo: pela fatura x pela data da compra ----
  const mk = M.S.month, tInv = M.totals(mk).card;
  click(w, '[data-act="cardMode"][data-m="purchase"]'); await sleep(10);
  ok(M.totals(mk).card !== tInv, 'cartão: pela fatura ≠ pela data da compra');
  click(w, '[data-act="cardMode"][data-m="invoice"]'); await sleep(10);
  ok(M.totals(mk).card === tInv, 'volta para pela fatura');

  // ---- todas as telas ----
  for (const p of ['home', 'txs', 'bills', 'reports', 'goals', 'cards', 'ai', 'cats', 'settings', 'more']) {
    M.go(p); await sleep(5); ok(d.querySelector('#page').innerHTML.length > 100, 'tela ' + p + ' renderiza');
  }
  click(w, '[data-act="prevMonth"]'); await sleep(5); ok(M.S.month !== mk, 'troca de mês');
  click(w, '[data-act="nextMonth"]'); await sleep(5); ok(M.S.month === mk, 'volta o mês');

  // ---- IA (demonstração: respostas calculadas no aparelho) ----
  M.go('ai'); await sleep(5);
  click(w, '[data-act="aiAsk"]'); await sleep(600);
  ok(d.querySelectorAll('#chat .bubble').length >= 2, 'IA responde no modo demonstração');

  // ---- PDF ----
  M.go('reports'); await sleep(10);
  click(w, '[data-act="pdf"]'); await sleep(120);
  const pdf = d.querySelector('#print').innerHTML;
  ok(pdf.includes('Lançamentos do mês') && w.__printed, 'relatório PDF gerado');
  ok(!/Investimento<\/td><td[^>]*>[^<]*<\/td><td[^>]*>[^<]*%/.test(pdf), 'PDF não mistura investimento nos gastos');

  // ---- trazer do app antigo (Firebase): plano + aplicação sem duplicar ----
  const raw = [
    { _id: 'a1', ts: 1720000000001, type: 'in', value: 300, date: '2026-07-02', desc: '3 clientes', source: 'iptv' },
    { _id: 'a2', ts: 1720000000002, type: 'out', value: '45.5', date: '2026-07-03', desc: 'Remédio', cat: 'c_9' },
    { _id: 'a3', ts: 1720000000002, type: 'card', value: 1200, date: '2026-07-04', desc: 'Celular', cat: 'outros', parcelas: 10 },
    { _id: 'a4', ts: 1720000000004, type: 'invest', value: 500, date: '2026-07-05', desc: 'CDB', cat: 'renda_fixa', kind: 'resgate' },
    { _id: 'a5', ts: 1720000000005, type: 'out', value: 0, date: '2026-07-05' },
    { _id: 'a6', ts: 1720000000006, type: 'xx', value: 10, date: '2026-07-05' },
    { _id: 'a7', ts: 1720000000007, type: 'out', value: 19.9, date: '2026-07-06', desc: 'Lanche', cat: 'c_desconhecida' }
  ];
  const ls = { sources: [{ id: 'iptv', emoji: '📺', name: 'Venda de IPTV' }, { id: 'outros', emoji: '➕', name: 'Outros' }], customCats: [{ v: 'c_9', l: '💊 Farmácia', emoji: '💊' }], customInvest: [] };
  const plan = M.buildLegacyPlan(raw, ls);
  ok(plan.txRows.length === 5 && plan.skipped.length === 2, 'plano: 5 válidos, 2 com defeito separados');
  ok(new Set(plan.txRows.map(r => r.legacy_ts)).size === 5, 'plano: horários repetidos resolvidos sem perder lançamento');
  ok(plan.catRows.find(r => r.legacy_key === 'c_9').icon === 'i:pill', 'plano: "💊 Farmácia" antiga ganha ícone de farmácia');
  ok(plan.catRows.find(r => r.legacy_key === 'iptv' && r.kind === 'in'), 'plano: fonte antiga mantida');
  ok(plan.catRows.find(r => r.legacy_key === 'c_desconhecida'), 'plano: categoria sem definição vira "importada" (não some)');
  const r1 = await M.applyLegacyPlan(plan);
  ok(r1.ok && r1.total === 5, 'migração conferida: valores batem');
  const count1 = M.S.txs.length;
  const r2 = await M.applyLegacyPlan(M.buildLegacyPlan(raw, ls));
  ok(r2.ok && M.S.txs.length === count1, 'migração repetida não duplica');
  const cel = M.S.txs.find(t => t.legacy_ts && t.description === 'Celular');
  ok(cel && cel.type === 'card' && cel.installments === 10 && M.S.cards.some(c => c.id === cel.card_id && c.closing_day === 9 && c.due_day === 16), 'cartão antigo vira "Meu cartão" (fecha 9, vence 16)');
  const inv = M.S.txs.find(t => t.legacy_ts === 1720000000004);
  ok(inv && inv.invest_kind === 'resgate', 'resgate preservado');

  // ---- menu do celular ----
  M.go('more'); await sleep(5);
  ok(d.querySelector('#page [data-act="go"][data-page="cards"]'), 'menu do celular lista Cartões');

  done();
})().catch(e => { console.log('❌ exceção', e); process.exit(1); });
