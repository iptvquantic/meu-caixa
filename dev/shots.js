// Prints do app (modo demonstração) em 360/390 px (celular) e 1280 px (PC), nos 3 temas.
// Salva em dev/shots/ e avisa se alguma tela vaza na horizontal ou tem erro de JavaScript.
// Uso: node shots.js [filtro]   ex.: node shots.js bills
const fs = require('fs'), path = require('path');
const { launch, routeSite, appHtml, SITE, sleep } = require('./lib');

const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const html = appHtml({ demo: true });
const openNew = async p => { const mobile = await p.evaluate(() => innerWidth < 900); await p.click(mobile ? '#mnav .fab' : '.top .btn.primary'); await sleep(300); };
// mostra o painel do WhatsApp (com o número do robô, como na versão de verdade) e gera o código
const waCode = async p => { await p.evaluate(() => { const M = window.__mc; M.Demo.db.wa = null; M.S.wa = null; M.S.waBot = { configured: true, number: '15550100000' }; M.render(); }); await sleep(100); await p.click('[data-act="waStart"]'); await sleep(250); await p.evaluate(() => document.querySelector('.wa-code').scrollIntoView({ block: 'center' })); await sleep(100); };
const SHOTS = [];
for (const theme of ['dark', 'light', 'cyber']) {
  SHOTS.push([`m360-home-${theme}`, { w: 360, h: 780, theme, page: 'home' }]);
  SHOTS.push([`m390-home-${theme}`, { w: 390, h: 844, theme, page: 'home', full: true }]);
  SHOTS.push([`d1280-home-${theme}`, { w: 1280, h: 860, theme, page: 'home' }]);
}
SHOTS.push(
  ['m390-txs-dark', { w: 390, h: 844, theme: 'dark', page: 'txs' }],
  ['m390-bills-dark', { w: 390, h: 844, theme: 'dark', page: 'bills', full: true }],
  ['m390-goals-cyber', { w: 390, h: 844, theme: 'cyber', page: 'goals', full: true }],
  ['m390-reports-light', { w: 390, h: 844, theme: 'light', page: 'reports', full: true }],
  ['m390-cards-dark', { w: 390, h: 844, theme: 'dark', page: 'cards', full: true }],
  ['m390-settings-dark', { w: 390, h: 844, theme: 'dark', page: 'settings', full: true }],
  ['m360-novo-dark', { w: 360, h: 780, theme: 'dark', page: 'home', setup: async p => { await openNew(p); await p.type('#tx-amount', '52,90'); await p.type('#tx-desc', 'Drogasil'); await sleep(400); } }],
  ['m360-icone-cyber', { w: 360, h: 780, theme: 'cyber', page: 'cats', setup: async p => { await p.click('[data-act="editCat"][data-id]'); await sleep(250); await p.click('[data-act="ceIcon"]'); await sleep(250); await p.type('#pick-q', 'farm'); } }],
  ['d1280-bills-light', { w: 1280, h: 860, theme: 'light', page: 'bills' }],
  ['d1280-reports-dark', { w: 1280, h: 860, theme: 'dark', page: 'reports' }],
  ['d1280-novo-light', { w: 1280, h: 860, theme: 'light', page: 'home', setup: async p => { await openNew(p); await p.type('#tx-quick', 'notebook 3.600 12x'); await p.click('[data-act="txQuick"]'); } }],
  // robô do WhatsApp nos Ajustes: código para conectar e conectado
  ['m360-whatsapp-dark', { w: 360, h: 780, theme: 'dark', page: 'settings', setup: waCode }],
  ['m390-whatsapp-light', { w: 390, h: 844, theme: 'light', page: 'settings', setup: waCode }],
  ['m390-whatsapp-cyber', { w: 390, h: 844, theme: 'cyber', page: 'settings', setup: async p => { await waCode(p); await p.click('[data-act="waCheck"]'); await sleep(300); } }],
  ['d1280-whatsapp-dark', { w: 1280, h: 860, theme: 'dark', page: 'settings', setup: waCode }],
  ['d1280-whatsapp-light', { w: 1280, h: 860, theme: 'light', page: 'settings', setup: async p => { await waCode(p); await p.click('[data-act="waCheck"]'); await sleep(300); } }]
);

(async () => {
  const filter = process.argv[2];
  const br = await launch();
  let problems = 0;
  for (const [name, o] of SHOTS) {
    if (filter && !name.includes(filter)) continue;
    const p = await br.newPage();
    await p.setViewport({ width: o.w, height: o.h, deviceScaleFactor: 1, isMobile: o.w < 900, hasTouch: o.w < 900 });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await routeSite(p, { html });
    await p.evaluateOnNewDocument((t, pg) => { window.__MC_TEST__ = true; localStorage.setItem('mc_theme_v2', JSON.stringify(t)); localStorage.setItem('mc_page', JSON.stringify(pg)); }, o.theme, o.page);
    await p.goto(SITE + 'app.html', { waitUntil: 'load' }); await sleep(500);
    await p.evaluate(t => { window.__mc.setTheme(t); window.__mc.render(); }, o.theme);
    if (o.setup) await o.setup(p);
    await sleep(400);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: !!o.full });
    const bad = overflow > 1 || errs.length;
    if (bad) problems++;
    console.log(`${bad ? '❌' : '✅'} ${name.padEnd(22)} ${overflow > 1 ? `vaza ${overflow}px na horizontal` : 'sem vazamento'}${errs.length ? ' | erros: ' + errs.join(' ; ').slice(0, 200) : ''}`);
    await p.close();
  }
  await br.close();
  console.log(problems ? `❌ prints: ${problems} problema(s)` : `✅ prints em ${OUT}`);
  process.exit(problems ? 1 : 0);
})().catch(e => { console.log('❌ exceção', e.message); process.exit(1); });
