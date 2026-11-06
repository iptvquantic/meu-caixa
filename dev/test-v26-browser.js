// 2.6 no Chromium de verdade (modo demonstração): o cursor já no R$ ao abrir o lançamento no PC (e sem teclado no
// celular), a página Fugas de gastos (teclado: pessoas, passos do plano e renda) e o tutorial (posição da caixa
// dentro da tela, destaque em volta do item, setas, Esc e foco preso na caixa) em 360, 390 e 1280 px.
const { launch, routeSite, appHtml, SITE, checker, sleep } = require('./lib');
const { ok, done } = checker('2.6 no navegador (cursor no R$, fugas e tutorial)');

async function open(br, w, h, mobile) {
  const p = await br.newPage();
  await p.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await routeSite(p, { html: appHtml({ demo: true }) });
  await p.evaluateOnNewDocument(() => { window.__MC_TEST__ = true; localStorage.setItem('mc_page', JSON.stringify('home')); });
  await p.goto(SITE + 'app.html', { waitUntil: 'load' }); await sleep(800);
  await p.evaluate(() => { const M = window.__mc, st = { ...(M.S.profile.settings || {}) }; delete st.leaks; delete st.tour; M.S.profile.settings = st; M.render(); });
  return { p, errs };
}
const active = p => p.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.dataset.act || document.activeElement.tagName));

(async () => {
  const br = await launch();
  // ---- cursor no R$ ----
  {
    const { p, errs } = await open(br, 1280, 860, false);
    await p.click('.top .btn.primary'); await sleep(400);
    ok(await active(p) === 'tx-amount', 'PC: Novo lançamento abre com o cursor no R$');
    await p.keyboard.type('52,90'); await sleep(100);
    ok(await p.$eval('#tx-amount', el => el.value) === '52,90', 'PC: já dá para digitar o valor');
    await p.keyboard.press('Escape'); await sleep(300);
    await p.keyboard.press('n'); await sleep(400);
    ok(await active(p) === 'tx-amount', 'PC: atalho N também abre com o cursor no R$');
    await p.keyboard.press('Escape'); await sleep(300);
    await p.click('[data-act="homeWrite"]'); await sleep(400);
    ok(await active(p) === 'as-text', 'PC: "Escrever" do Início vai para o campo do Lançar com IA');
    ok(!errs.length, 'PC: sem erro de JavaScript ' + errs.join(' ; '));
    await p.close();
  }
  {
    const { p, errs } = await open(br, 390, 844, true);
    await p.tap('#mnav .fab'); await sleep(400);
    const st = await p.evaluate(() => ({ act: document.activeElement?.tagName, caret: !!document.querySelector('#tx-amount-wrap .caret') && getComputedStyle(document.querySelector('#tx-amount-wrap .caret')).display !== 'none' }));
    ok(st.act !== 'INPUT' && st.caret, 'celular: sem teclado pulando na cara, com o cursor piscando no R$');
    ok(!errs.length, 'celular: sem erro de JavaScript ' + errs.join(' ; '));
    await p.close();
  }
  // ---- fugas de gastos pelo teclado ----
  {
    const { p, errs } = await open(br, 1280, 860, false);
    await p.click('#side-nav [data-page="leaks"]'); await sleep(300);
    ok(await p.$$eval('#page .lk-card', l => l.length) >= 3, 'PC: página com as fugas');
    await p.focus('[data-act="leakPeople"][data-d="1"]'); await p.keyboard.press('Enter'); await sleep(200);
    ok(await p.$eval('#lk-people', el => el.textContent) === '2' && await p.evaluate(() => document.activeElement.dataset.act) === 'leakPeople', 'Enter no + soma uma pessoa e o foco continua no botão');
    await p.focus('[data-act="leakStep"]'); await p.keyboard.press('Space'); await sleep(200);
    const step = await p.evaluate(() => ({ act: document.activeElement.dataset.act, checked: document.activeElement.checked, day: document.querySelector('.lk-day')?.textContent || '' }));
    ok(step.act === 'leakStep' && step.checked && /Dia 1 de 30/.test(step.day), 'espaço marca o passo do plano (dia 1 de 30), foco no mesmo passo');
    await p.click('#lk-income', { clickCount: 3 }); await p.keyboard.type('4.200,00'); await p.keyboard.press('Tab'); await sleep(250);
    ok(await p.evaluate(() => window.__mc.leakSettings().income) === 4200, 'renda digitada vale ao sair do campo');
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(over <= 1 && !errs.length, 'PC: sem vazamento nem erro ' + errs.join(' ; '));
    await p.close();
  }
  // ---- tutorial: a caixa sempre dentro da tela, o destaque em volta do item ----
  for (const [w, h, mobile] of [[360, 780, true], [390, 844, true], [1280, 860, false]]) {
    const { p, errs } = await open(br, w, h, mobile);
    await p.evaluate(() => window.__mc.tourStart()); await sleep(300);
    const n = await p.evaluate(() => window.__mc.TOUR.steps.length);
    let bad = [];
    for (let i = 0; i < n; i++) {
      await sleep(450);
      const g = await p.evaluate(() => {
        const M = window.__mc, st = M.TOUR.steps[M.TOUR.i], tip = document.querySelector('#tour-root .tour-tip').getBoundingClientRect(), hole = document.querySelector('.tour-hole');
        const el = st.sel ? [...document.querySelectorAll(st.sel)].find(e => e.getClientRects().length) : null, r = el && el.getBoundingClientRect(), hr = hole.hidden ? null : hole.getBoundingClientRect();
        const inView = tip.left >= 0 && tip.top >= 0 && tip.right <= innerWidth && tip.bottom <= innerHeight;
        const around = !el || (hr && hr.left <= r.left + 1 && hr.top <= r.top + 1 && hr.right >= r.right - 1 && hr.bottom >= r.bottom - 1);
        const covers = el && !(tip.right <= r.left || tip.left >= r.right || tip.bottom <= r.top || tip.top >= r.bottom) && r.height < innerHeight * 0.5;
        return { t: st.title, inView, around, covers, focusIn: document.querySelector('#tour-root .tour-tip').contains(document.activeElement) };
      });
      if (!g.inView || !g.around || g.covers || !g.focusIn) bad.push(g);
      if (i < n - 1) await p.keyboard.press('ArrowRight');
    }
    ok(!bad.length, `${w}px: ${n} passos com a caixa dentro da tela, sem cobrir o item, destaque em volta e foco na caixa ${JSON.stringify(bad)}`);
    await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
    ok(await p.evaluate(() => document.querySelector('#tour-root .tour-tip').contains(document.activeElement)), `${w}px: Tab não sai da caixa`);
    await p.keyboard.press('Escape'); await sleep(200);
    ok(await p.evaluate(() => !document.querySelector('#tour-root') && window.__mc.tourState().done === true), `${w}px: Esc fecha e anota que viu`);
    ok(!errs.length, `${w}px: sem erro de JavaScript ${errs.join(' ; ')}`);
    await p.close();
  }
  await br.close();
  done();
})().catch(e => { ok(false, 'exceção ' + (e.stack || e)); done(); });
