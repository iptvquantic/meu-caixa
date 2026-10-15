// Abre o app em modo demonstração dentro do jsdom (sem navegador) para testar a interface.
const { JSDOM } = require('jsdom');
const { appHtml, SITE, sleep } = require('./lib');

const HTML = appHtml({ demo: true });

async function bootApp({ desktop = false, touch = false, dark = true, wide = true, url = SITE + 'app.html', onError, storage = {} } = {}) {
  const dom = new JSDOM(HTML, {
    url, runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.__MC_TEST__ = true;
      // tela: PC (min-width:900), toque (pointer: coarse), tema do aparelho (prefers-color-scheme: dark), largura < 1100 (max-width:1099)
      w.matchMedia = q => ({ matches: /min-width:\s*900/.test(q) ? desktop : /pointer:\s*coarse/.test(q) ? touch : /prefers-color-scheme:\s*dark/.test(q) ? dark : /max-width:\s*1099/.test(q) ? !wide : false, addEventListener() { }, removeEventListener() { } });
      for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, JSON.stringify(v));
      w.scrollTo = () => { };
      w.print = () => { w.__printed = true; };
      w.HTMLElement.prototype.focus = function () { };
      w.onerror = m => { (onError || console.log)('erro JS: ' + m); };
    }
  });
  const w = dom.window;
  await sleep(200);
  return w;
}
const click = (w, sel) => {
  const el = typeof sel === 'string' ? w.document.querySelector(sel) : sel;
  if (!el) throw new Error('não achei ' + sel);
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
};
const type = (w, sel, v) => {
  const el = w.document.querySelector(sel);
  if (!el) throw new Error('não achei ' + sel);
  el.value = v;
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
};
const localToday = w => { const x = new w.Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

module.exports = { bootApp, click, type, localToday, sleep };
