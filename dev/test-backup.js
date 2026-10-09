// Backup pela tela (Ajustes → Baixar backup / Importar backup), modo demonstração:
// 1) restaurar na MESMA conta não pode duplicar nada;
// 2) restaurar numa conta VAZIA recria tudo igual (categorias, cartões, contas fixas, metas, lançamentos e totais);
// 3) restaurar de novo nessa conta não duplica.
const { bootApp, click, sleep } = require('./jsdom-app');
const { checker } = require('./lib');
const { ok, done } = checker('backup');

(async () => {
  const w = await bootApp({ onError: m => ok(false, m) });
  const d = w.document, M = w.__mc, S = M.S;
  // download/upload no jsdom
  let lastBlob = null;
  w.URL.createObjectURL = b => { lastBlob = b; return 'blob:teste'; };
  w.URL.revokeObjectURL = () => { };
  w.HTMLAnchorElement.prototype.click = function () { };
  const readBlob = b => new Promise((res, rej) => { const r = new w.FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(b); });
  if (!w.Blob.prototype.text) w.Blob.prototype.text = function () { return readBlob(this); }; // o jsdom não tem; navegadores têm
  const exportBackup = async () => { M.go('settings'); await sleep(10); click(w, '[data-act="exportJSON"]'); await sleep(20); return readBlob(lastBlob); };
  const importBackup = async text => {
    const input = d.querySelector('#file-import');
    Object.defineProperty(input, 'files', { configurable: true, value: [new w.File([text], 'backup.json', { type: 'application/json' })] });
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    for (let i = 0; i < 100 && !/restaurado|Importado|backup|lançamento/i.test(d.querySelector('#toast-root').textContent); i++) await sleep(20);
    await sleep(30);
    return d.querySelector('#toast-root').textContent;
  };
  const counts = () => ({ txs: S.txs.length, cats: S.cats.length, cards: S.cards.length, recs: S.recs.length, goals: S.goals.length });
  const months = (() => { const out = [], [y, m] = S.month.split('-').map(Number); for (let i = -3; i <= 2; i++) { const x = new Date(y, m - 1 + i, 1); out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`); } return out; })();
  const snapshotTotals = () => months.map(mk => { const T = M.totals(mk); return [mk, T.in, T.out, T.card, T.invest, T.saldo].join('|'); }).join('\n');
  const paidMarks = () => S.txs.filter(t => t.recurring_id).map(t => `${S.recMap[t.recurring_id]?.name}|${t.recurring_month}`).sort().join(',');
  const cardOfDesc = desc => { const t = S.txs.find(x => x.description === desc); return t && S.cardMap[t.card_id]?.name; };

  // um lançamento criado no app (sem vínculo com o app antigo) e uma categoria nova
  await M.api().addCat({ kind: 'out', name: 'Pet shop do Thor', icon: 'i:paw-print', color: '#22c55e' });
  const c0 = await M.api().addTx({ type: 'out', amount: 33.3, date: S.month + '-02', description: 'Ração', category_id: null, card_id: null, installments: 1, invest_kind: null });
  await M.startApp();
  ok(S.txs.some(t => t.id === c0.id), 'preparação: lançamento novo criado');

  const text = await exportBackup();
  const data = JSON.parse(text);
  ok(data.app === 'meu-caixa' && data.transactions.length === S.txs.length && data.recurring.length === S.recs.length && data.goals.length === S.goals.length && data.cards.length === S.cards.length, 'backup leva lançamentos, categorias, cartões, contas fixas e metas');
  const before = counts(), totalsBefore = snapshotTotals(), marksBefore = paidMarks(), geladeiraCard = cardOfDesc('Geladeira nova');

  // 1) mesma conta
  const msg1 = await importBackup(text);
  ok(JSON.stringify(counts()) === JSON.stringify(before), `restaurar na mesma conta não duplica nada (${JSON.stringify(counts())} × ${JSON.stringify(before)})`);
  ok(snapshotTotals() === totalsBefore, 'totais dos meses continuam iguais');
  ok(/já estavam/i.test(msg1), 'aviso diz que tudo já estava na conta: ' + msg1);

  // 2) conta vazia (como uma conta nova)
  M.Demo.db = { profile: M.Demo.db.profile, cats: [], cards: [], txs: [], recs: [], goals: [] };
  M.Demo.save(); await M.startApp();
  ok(S.txs.length === 0 && S.cats.length === 0, 'conta vazia preparada');
  const msg2 = await importBackup(text);
  ok(JSON.stringify(counts()) === JSON.stringify(before), `conta vazia recebe tudo (${JSON.stringify(counts())} × ${JSON.stringify(before)})`);
  ok(snapshotTotals() === totalsBefore, 'totais de 6 meses iguais ao original (cartão nas mesmas faturas)');
  ok(cardOfDesc('Geladeira nova') === geladeiraCard, `compra no cartão volta no mesmo cartão (${cardOfDesc('Geladeira nova')})`);
  ok(paidMarks() === marksBefore, 'contas fixas pagas continuam marcadas como pagas');
  ok(S.cats.some(c => c.name === 'Pet shop do Thor' && c.icon === 'i:paw-print'), 'categoria criada no app volta com o mesmo ícone');
  ok(/restaurado/i.test(msg2), 'aviso de backup restaurado: ' + msg2);

  // 3) restaurar de novo na nova conta
  const after = counts();
  await importBackup(text);
  ok(JSON.stringify(counts()) === JSON.stringify(after), 'restaurar de novo não duplica');

  // 4) arquivo estranho não estraga nada
  const msg4 = await importBackup('{"foo": 1}');
  ok(/não reconhecido/i.test(msg4) && JSON.stringify(counts()) === JSON.stringify(after), 'arquivo que não é backup é recusado sem mexer nos dados');

  done();
})().catch(e => { console.log('❌ exceção', e); process.exit(1); });
