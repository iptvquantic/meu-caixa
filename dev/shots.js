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
  ['d1280-novo-light', { w: 1280, h: 860, theme: 'light', page: 'home', setup: async p => { await openNew(p); await p.type('#as-text', 'notebook 3.600 12x'); } }],
  // robô do WhatsApp nos Ajustes: código para conectar e conectado
  ['m360-whatsapp-dark', { w: 360, h: 780, theme: 'dark', page: 'settings', setup: waCode }],
  ['m390-whatsapp-light', { w: 390, h: 844, theme: 'light', page: 'settings', setup: waCode }],
  ['m390-whatsapp-cyber', { w: 390, h: 844, theme: 'cyber', page: 'settings', setup: async p => { await waCode(p); await p.click('[data-act="waCheck"]'); await sleep(300); } }],
  ['d1280-whatsapp-dark', { w: 1280, h: 860, theme: 'dark', page: 'settings', setup: waCode }],
  ['d1280-whatsapp-light', { w: 1280, h: 860, theme: 'light', page: 'settings', setup: async p => { await waCode(p); await p.click('[data-act="waCheck"]'); await sleep(300); } }],
  // 2.3: lançamento sem teclado (cursor piscando no R$), menu encolhido, tema automático, relatórios e passos do Início
  ['m390-novo-vazio-dark', { w: 390, h: 844, theme: 'dark', page: 'home', setup: openNew }],
  ['m360-novo-vazio-light', { w: 360, h: 780, theme: 'light', page: 'home', setup: openNew }],
  ['d1280-home-mini-dark', { w: 1280, h: 860, theme: 'dark', page: 'home', side: 'mini' }],
  ['d1280-home-mini-cyber', { w: 1280, h: 860, theme: 'cyber', page: 'reports', side: 'mini', setup: async p => { await p.hover('#side-nav [data-page="goals"]'); await sleep(250); } }],
  ['d1024-home-light', { w: 1024, h: 768, theme: 'light', page: 'home' }],
  ['d1280-auto-claro', { w: 1280, h: 860, theme: 'auto', scheme: 'light', page: 'settings' }],
  ['m390-auto-escuro', { w: 390, h: 844, theme: 'auto', scheme: 'dark', page: 'settings', full: true }],
  ['m360-reports-dark', { w: 360, h: 780, theme: 'dark', page: 'reports', full: true }],
  ['d1280-reports-light', { w: 1280, h: 860, theme: 'light', page: 'reports', full: true }],
  ['m360-settings-light', { w: 360, h: 780, theme: 'light', page: 'settings' }],
  // assistente: falar, escrever ou foto (no Novo lançamento e na página Assistente)
  ['m390-assist-saldo-dark', { w: 390, h: 844, theme: 'dark', page: 'home', setup: async p => { await openNew(p); await p.type('#as-text', 'saldo'); await p.click('[data-act="asSend"]'); await sleep(900); } }],
  ['m360-assist-gravando-light', { w: 360, h: 780, theme: 'light', page: 'home', setup: async p => { await openNew(p); await p.evaluate(() => { const M = window.__mc; Object.assign(M.REC, { mr: { state: 'recording' }, where: 'tx', t0: Date.now() - 4000 }); M.asRow(); }); } }],
  ['m390-assist-cyber', { w: 390, h: 844, theme: 'cyber', page: 'home', setup: async p => { await openNew(p); await p.type('#as-text', 'recebi 300 pix'); } }],
  ['m390-ai-dark', { w: 390, h: 844, theme: 'dark', page: 'ai', full: true, setup: async p => { await p.evaluate(async () => { const M = window.__mc; await M.sendAI('mercado 47,30'); await M.sendAI('Onde posso economizar?'); }); await sleep(300); } }],
  ['d1280-ai-light', { w: 1280, h: 860, theme: 'light', page: 'ai', setup: async p => { await p.evaluate(async () => { const M = window.__mc; await M.sendAI('saldo'); await M.aiRun({ image: { mime: 'image/jpeg', data: 'QUJD' } }, '📷 Foto do comprovante'); }); await sleep(300); } }],
  ['m390-home-passos-dark', { w: 390, h: 844, theme: 'dark', page: 'home', full: true, setup: async p => { await p.evaluate(() => { const M = window.__mc; M.S.recs = []; M.S.goals = []; M.S.cards = []; M.S.wa = null; M.S.waBot = { configured: true, number: '15550100000' }; M.render(); }); } }],
  // 2.3.2: "Lançar com IA" em destaque (Novo lançamento), lendo a foto, gravando e a câmera no computador
  ['m360-ia-novo-dark', { w: 360, h: 780, theme: 'dark', page: 'home', setup: openNew }],
  ['m390-ia-novo-light', { w: 390, h: 844, theme: 'light', page: 'home', setup: openNew }],
  ['m390-ia-novo-cyber', { w: 390, h: 844, theme: 'cyber', page: 'home', setup: openNew }],
  ['d1280-ia-novo-dark', { w: 1280, h: 860, theme: 'dark', page: 'home', setup: openNew }],
  ['d1280-ia-novo-cyber', { w: 1280, h: 860, theme: 'cyber', page: 'home', setup: async p => { await openNew(p); await p.type('#as-text', 'iptv vanessa 30'); } }],
  ['m360-ia-lendo-light', { w: 360, h: 780, theme: 'light', page: 'home', setup: async p => { await openNew(p); await p.evaluate(() => { window.__mc.Demo.assist = () => new Promise(() => { }); window.__mc.asRun({ image: { mime: 'image/jpeg', data: 'QUJD' } }, 'Lendo o comprovante…'); }); } }],
  ['m390-ia-gravando-dark', { w: 390, h: 844, theme: 'dark', page: 'home', setup: async p => { await openNew(p); await p.evaluate(() => { const M = window.__mc; Object.assign(M.REC, { mr: { state: 'recording' }, where: 'tx', t0: Date.now() - 4000 }); M.asRow(); }); } }],
  // 2.4: gravando com o medidor (voz ouvida), aviso com o que ouviu + Desfazer e Corrigir, e "faltou o valor"
  ['m360-voz-medidor-dark', { w: 360, h: 780, theme: 'dark', page: 'home', setup: async p => { await openNew(p); await p.evaluate(() => { const M = window.__mc; Object.assign(M.REC, { mr: { state: 'recording', stop() { } }, where: 'tx', t0: Date.now() - 3000, vad: { level: 0.75, heard: true, lastVoice: Date.now(), voiced: 900, noise: 0.005, an: { getFloatTimeDomainData() { } }, buf: new Float32Array(8) }, hint: '' }); M.asRow(); for (const b of document.querySelectorAll('.lvl i')) b.style.transform = `scaleY(${(0.12 + 0.75 * [0.55, 0.85, 1, 0.85, 0.55][b.dataset.k | 0]).toFixed(2)})`; }); } }],
  ['m390-voz-medidor-light', { w: 390, h: 844, theme: 'light', page: 'home', setup: async p => { await openNew(p); await p.evaluate(() => { const M = window.__mc; Object.assign(M.REC, { mr: { state: 'recording', stop() { } }, where: 'tx', t0: Date.now() - 1000, vad: { level: 0.1, heard: false, lastVoice: 0, voiced: 0, noise: 0.005, an: { getFloatTimeDomainData() { } }, buf: new Float32Array(8) }, hint: '' }); M.asRow(); }); } }],
  ['d1280-voz-medidor-cyber', { w: 1280, h: 860, theme: 'cyber', page: 'home', setup: async p => { await openNew(p); await p.evaluate(() => { const M = window.__mc; Object.assign(M.REC, { mr: { state: 'recording', stop() { } }, where: 'tx', t0: Date.now() - 2000, vad: { level: 0.6, heard: true, lastVoice: Date.now(), voiced: 900, noise: 0.005, an: { getFloatTimeDomainData() { } }, buf: new Float32Array(8) }, hint: '' }); M.asRow(); for (const b of document.querySelectorAll('.lvl i')) b.style.transform = `scaleY(${(0.12 + 0.6 * [0.55, 0.85, 1, 0.85, 0.55][b.dataset.k | 0]).toFixed(2)})`; }); } }],
  ['m360-aviso-corrigir-light', { w: 360, h: 780, theme: 'light', page: 'home', setup: async p => { await p.evaluate(async () => { const M = window.__mc; M.Demo.assist = async () => { const t = M.Demo._ins('txs', { type: 'out', amount: 350, date: M.isoOf(new Date()), description: 'Parcela cartão do pai 3/12', category_id: null, card_id: null, installments: 1, invest_kind: null }); return { handled: true, heard: 'pagamento cartão pai parcela com pix 3/12 350', txs: [t], tx: t, reply: 'ok' }; }; M.openTx(); await new Promise(r => setTimeout(r, 200)); await M.asRun({ audio: { mime: 'audio/wav', data: 'UklGRg==' } }, 'Ouvindo…'); }); await sleep(300); } }],
  ['m390-aviso-corrigir-dark', { w: 390, h: 844, theme: 'dark', page: 'home', setup: async p => { await p.evaluate(async () => { const M = window.__mc; M.Demo.assist = async () => { const t = M.Demo._ins('txs', { type: 'in', amount: 30, date: M.isoOf(new Date()), description: 'Fábio', category_id: null, card_id: null, installments: 1, invest_kind: null }); return { handled: true, heard: 'recebi 30 do fábio', txs: [t], tx: t, reply: 'ok' }; }; M.openTx(); await new Promise(r => setTimeout(r, 200)); await M.asRun({ audio: { mime: 'audio/wav', data: 'UklGRg==' } }, 'Ouvindo…'); }); await sleep(300); } }],
  ['d1280-aviso-corrigir-cyber', { w: 1280, h: 860, theme: 'cyber', page: 'home', setup: async p => { await p.evaluate(async () => { const M = window.__mc; M.Demo.assist = async () => { const mk = (v, n) => M.Demo._ins('txs', { type: 'out', amount: v, date: M.isoOf(new Date()), description: n, category_id: null, card_id: null, installments: 1, invest_kind: null }); const a = mk(20, 'Lanche'), b = mk(15, 'Uber'); return { handled: true, heard: 'gastei 20 de lanche e 15 de uber', txs: [a, b], tx: b, reply: 'ok' }; }; M.openTx(); await new Promise(r => setTimeout(r, 200)); await M.asRun({ audio: { mime: 'audio/wav', data: 'UklGRg==' } }, 'Ouvindo…'); }); await sleep(300); } }],
  ['m390-ia-faltou-dark', { w: 390, h: 844, theme: 'dark', page: 'home', setup: async p => { await openNew(p); await p.type('#as-text', 'parcela do cartão do pai'); await p.click('[data-act="asSend"]'); await sleep(800); } }],
  ['m390-ai-corrigir-light', { w: 390, h: 844, theme: 'light', page: 'ai', setup: async p => { await p.evaluate(async () => { const M = window.__mc; M.Demo.assist = async () => { const t = M.Demo._ins('txs', { type: 'out', amount: 350, date: M.isoOf(new Date()), description: 'Parcela cartão do pai 3/12', category_id: null, card_id: null, installments: 1, invest_kind: null }); return { handled: true, txs: [t], tx: t, reply: '💸 *Saída* de *R$ 350,00* (PIX)\n🏷️ PIX enviado · 📅 hoje · Parcela cartão do pai 3/12' }; }; await M.sendAI('pagamento cartão pai parcela com pix 3/12 350'); }); await sleep(300); } }],
  ['m390-ia-lancado-dark', { w: 390, h: 844, theme: 'dark', page: 'home', setup: async p => { await openNew(p); await p.evaluate(() => window.__mc.asRun({ image: { mime: 'image/jpeg', data: 'QUJD' } }, 'Lendo o comprovante…')); await sleep(700); } }],
  ['d1280-camera-dark', { w: 1280, h: 860, theme: 'dark', page: 'home', setup: async p => { await p.click('[data-act="homeCamera"]'); await sleep(1500); } }],
  ['m390-ai-tools-light', { w: 390, h: 844, theme: 'light', page: 'ai' }]
);

(async () => {
  const filter = process.argv[2];
  const br = await launch(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']);
  let problems = 0;
  for (const [name, o] of SHOTS) {
    if (filter && !name.includes(filter)) continue;
    const p = await br.newPage();
    await p.setViewport({ width: o.w, height: o.h, deviceScaleFactor: 1, isMobile: o.w < 900, hasTouch: o.w < 900 });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await routeSite(p, { html });
    if (o.scheme) await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: o.scheme }]);
    await p.evaluateOnNewDocument((t, pg, side) => { window.__MC_TEST__ = true; localStorage.setItem('mc_theme_v2', JSON.stringify(t)); localStorage.setItem('mc_page', JSON.stringify(pg)); if (side) localStorage.setItem('mc_side', JSON.stringify(side)); }, o.theme, o.page, o.side || null);
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
