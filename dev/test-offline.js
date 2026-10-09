// App instalado: service worker ativo, app guardado no aparelho e abertura SEM internet com os últimos dados.
// Usa um servidor local de verdade (service worker não funciona com requisições simuladas).
const fs = require('fs'), path = require('path');
const { launch, serveRoot, appConfig, swVersion, SUPA_JS_URL, checker, sleep } = require('./lib');
const { ok, done } = checker('sem internet');

const { server, base: BASE } = serveRoot(8123);

const { url: REF } = appConfig(), CACHE = swVersion();
const sbjs = fs.readFileSync(path.join(__dirname, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), 'utf8');
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const user = { id: '11111111-1111-1111-1111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'teste@exemplo.com', email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} };
const jwt = b64({ alg: 'HS256' }) + '.' + b64({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 }) + '.x';
const session = { access_token: jwt, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'r', user };
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const br = await launch();
  const p = await br.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true });
  await p.setRequestInterception(true);
  const handler = r => {
    const u = r.url(), cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
    if (u.startsWith('http://localhost:')) return r.continue();
    if (u === SUPA_JS_URL) return r.respond({ status: 200, contentType: 'application/javascript', body: sbjs });
    if (u.startsWith(REF)) {
      if (r.method() === 'OPTIONS') return r.respond({ status: 200, headers: cors, body: '' });
      const J = o => r.respond({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
      const pth = u.slice(REF.length);
      if (pth.startsWith('/auth/v1/token')) return J(session);
      if (pth.startsWith('/auth/v1/user')) return J(user);
      if (pth.startsWith('/rest/v1/profiles')) return J({ id: user.id, plan: 'master', plan_expiry: '2099-12-31T00:00:00Z', active: true, settings: {} });
      if (pth.startsWith('/rest/v1/transactions')) return J([{ id: 't1', type: 'in', amount: 45, date: today, description: 'Rogerio mensalidade', category_id: null, card_id: null, installments: 1, invest_kind: null, created_at: new Date().toISOString() }]);
      return J([]);
    }
    return r.respond({ status: 200, contentType: 'text/css', body: '' }); // fontes etc.
  };
  p.on('request', handler);

  await p.goto(BASE + 'app.html', { waitUntil: 'load' }); await sleep(900);
  await p.type('#auth-email', user.email); await p.type('#auth-pass', 'segredo123'); await p.click('#auth-submit'); await sleep(1500);
  ok(await p.$eval('#page', e => /Rogerio mensalidade/.test(e.textContent)), 'com internet: mostra os lançamentos');
  ok(await p.evaluate(() => !!localStorage.getItem('mc_snap')), 'cópia dos dados guardada no aparelho');
  await sleep(2500);
  const sw = await p.evaluate(async () => { const r = await Promise.race([navigator.serviceWorker.ready, new Promise(x => setTimeout(() => x(null), 6000))]); return r && r.active ? r.active.state : 'nenhum'; });
  ok(sw === 'activated', 'service worker ativo: ' + sw);
  const cached = await p.evaluate(async v => (await (await caches.open(v)).keys()).map(k => new URL(k.url).pathname), CACHE);
  ok(cached.includes('/meu-caixa/app.html') && cached.includes('/meu-caixa/manifest.webmanifest'), `app guardado no cache ${CACHE}`);
  ok(await p.evaluate(() => !document.querySelector('script[src*="chart.umd"]')), 'gráficos não travam a abertura (só carregam em Relatórios)');
  // a biblioteca do Supabase também vai para o cache (aqui ela vem simulada, então guardamos à mão)
  await p.evaluate(async (v, u, body) => { const c = await caches.open(v); await c.put(new Request(u), new Response(body, { headers: { 'Content-Type': 'application/javascript' } })); }, CACHE, SUPA_JS_URL, sbjs);

  // ---- sem internet ----
  p.off('request', handler); await p.setRequestInterception(false);
  server.closeAllConnections(); server.close();
  await p.setOfflineMode(true); await sleep(300);
  await p.reload({ waitUntil: 'load' }).catch(() => { });
  const t0 = Date.now();
  await p.waitForFunction(() => !document.querySelector('#app').hidden || !document.querySelector('#auth').hidden, { timeout: 30000, polling: 100 }).catch(() => { });
  const secs = (Date.now() - t0) / 1000;
  ok(secs <= 2, `sem internet abre na hora (${secs.toFixed(1)}s)`);
  await sleep(9000);
  const st = await p.evaluate(() => ({ app: !document.querySelector('#app').hidden, txt: document.querySelector('#page').textContent, toast: document.querySelector('#toast-root').textContent }));
  ok(st.app && /Rogerio mensalidade/.test(st.txt), 'sem internet: mostra os últimos dados');
  ok(/Sem internet/.test(st.toast || ''), 'avisa que está sem internet: ' + (st.toast || '').slice(0, 80));
  await br.close();
  done();
})().catch(e => { console.log('❌ exceção', e.message); try { server.close(); } catch { } process.exit(1); });
