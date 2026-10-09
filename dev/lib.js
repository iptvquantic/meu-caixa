// Utilidades compartilhadas pelos testes e ferramentas do Meu Caixa.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://iptvquantic.github.io/meu-caixa/';
const SUPA_JS_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js';

// O app.html (fonte da verdade). demo:true = sem nuvem, dados de exemplo no aparelho.
function appHtml({ demo = false } = {}) {
  let html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  if (demo) {
    html = html.replace(/supabaseUrl: '[^']*'/, "supabaseUrl: ''").replace(/supabaseKey: '[^']*'/, "supabaseKey: ''");
  }
  return html;
}
const appConfig = () => {
  const html = appHtml();
  const get = k => (html.match(new RegExp(`${k}: '([^']*)'`)) || [])[1] || '';
  return { url: get('supabaseUrl'), key: get('supabaseKey'), version: get('version') };
};
const swVersion = () => (fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/VERSION = '([^']+)'/) || [])[1];

// Scripts embutidos no app.html: [0] = configuração, [1] = ícones + funções + app
const inlineScripts = html => [...html.matchAll(/<script>\n([\s\S]*?)<\/script>/g)].map(m => m[1]);

// ---------- navegador (Chromium) ----------
async function launch() {
  const pp = require('puppeteer-core');
  let exe = process.env.CHROME_PATH;
  if (!exe && fs.existsSync('/opt/pw-browsers/chromium')) exe = '/opt/pw-browsers/chromium';
  let args = ['--no-sandbox', '--disable-dev-shm-usage'];
  if (!exe) {
    let C;
    try { C = require('@sparticuz/chromium').default; } catch {
      throw new Error('Chromium não encontrado. Defina CHROME_PATH ou rode: npm i --no-save @sparticuz/chromium');
    }
    exe = await C.executablePath(); args = [...C.args, ...args];
  }
  return pp.launch({ executablePath: exe, args, headless: true });
}

// Fontes e bibliotecas servidas do node_modules (os testes não dependem da internet)
let FONT_CSS;
function fontCss() {
  if (FONT_CSS) return FONT_CSS;
  const face = (fam, pkg, w) => {
    const file = require.resolve(`@fontsource/${pkg}/files/${pkg}-latin-${w}-normal.woff2`);
    return `@font-face{font-family:'${fam}';font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}) format('woff2')}`;
  };
  FONT_CSS = [400, 500, 600, 700, 800].map(w => face('Manrope', 'manrope', w)).concat([500, 600, 700].map(w => face('Chakra Petch', 'chakra-petch', w))).join('\n');
  return FONT_CSS;
}
const libFile = rel => fs.readFileSync(path.join(__dirname, 'node_modules', rel));
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };

// Intercepta as requisições da página: site do GitHub Pages servido do repositório local,
// CDNs servidas do node_modules, Supabase respondido pelo "supabase" (opcional). Resto: bloqueado.
async function routeSite(page, { html, supabase } = {}) {
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (u.startsWith(SITE)) {
      const file = decodeURIComponent(u.slice(SITE.length).split(/[?#]/)[0]) || 'index.html';
      if (file === 'app.html' && html) return r.respond({ status: 200, contentType: 'text/html', body: html });
      const p = path.join(ROOT, file);
      if (p.startsWith(ROOT) && fs.existsSync(p) && fs.statSync(p).isFile()) return r.respond({ status: 200, contentType: TYPES[path.extname(p)] || 'application/octet-stream', body: fs.readFileSync(p) });
      return r.respond({ status: 404, contentType: 'text/plain', body: 'not found' });
    }
    if (u.startsWith('https://fonts.googleapis.com/')) return r.respond({ status: 200, contentType: 'text/css', body: fontCss() });
    if (u.includes('/Chart.js/4.4.1/chart.umd')) return r.respond({ status: 200, contentType: 'application/javascript', body: libFile('chart.js/dist/chart.umd.js') });
    if (u === SUPA_JS_URL) return r.respond({ status: 200, contentType: 'application/javascript', body: libFile('@supabase/supabase-js/dist/umd/supabase.js') });
    if (supabase && u.startsWith(appConfig().url)) return supabase(r);
    return r.abort();
  });
}

// Servidor local do repositório (localhost conta como site seguro: service worker e instalação funcionam)
function serveRoot(port) {
  const http = require('http');
  const server = http.createServer((q, s) => {
    const rel = decodeURIComponent(q.url.split('?')[0]).replace(/^\/meu-caixa\//, '');
    const f = path.join(ROOT, rel || 'index.html');
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' });
    fs.createReadStream(f).pipe(s);
  }).listen(port);
  return { server, base: `http://localhost:${port}/meu-caixa/` };
}

// Contador simples de verificações
function checker(title) {
  let pass = 0, fail = 0;
  const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('❌', msg); } };
  const done = () => { console.log(`${fail ? '❌' : '✅'} ${title}: ${pass} ok, ${fail} falha(s)`); process.exit(fail ? 1 : 0); };
  return { ok, done, get fail() { return fail; } };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { ROOT, SITE, SUPA_JS_URL, appHtml, appConfig, swVersion, inlineScripts, launch, routeSite, serveRoot, fontCss, checker, sleep };
