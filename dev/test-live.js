// Caminho real (com Supabase) no Chromium, com o Supabase simulado:
// login, cadastro, carregar dados, salvar lançamento, contas fixas vindas do banco, IA pela função do servidor.
const { launch, routeSite, appConfig, appHtml, SITE, checker, sleep } = require('./lib');
const { ok, done } = checker('caminho real (Supabase simulado)');

const { url: REF } = appConfig();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const user = { id: '11111111-1111-1111-1111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'teste@exemplo.com', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.sig';
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r1', user };
const cats = [
  { id: 'aaaaaaaa-0000-0000-0000-000000000001', kind: 'out', legacy_key: 'mercado', name: 'Mercado', icon: 'i:shopping-cart', color: '#22c55e', archived: false, sort: 2 },
  { id: 'aaaaaaaa-0000-0000-0000-000000000002', kind: 'in', legacy_key: 'vendas', name: 'Vendas', icon: 'i:shopping-bag', color: '#22c55e', archived: false, sort: 1 }
];
const profile = { id: user.id, email: user.email, plan: 'trial', plan_expiry: new Date(Date.now() + 15 * 864e5).toISOString(), active: true, settings: {} };
const seen = [];

(async () => {
  const br = await launch();
  const p = await br.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/net::|ERR_|fetching the script/.test(m.text())) errs.push(m.text()); });
  await routeSite(p, {
    html: appHtml(),
    supabase: r => {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
      if (r.method() === 'OPTIONS') return r.respond({ status: 200, headers: cors, body: '' });
      const path = r.url().slice(REF.length), m = r.method();
      seen.push(`${m} ${path.startsWith('/auth/v1/signup') ? decodeURIComponent(path) : path.split('?')[0]} ${m !== 'GET' ? (r.postData() || '').slice(0, 200) : ''}`);
      const J = (o, s = 200) => r.respond({ status: s, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
      if (path.startsWith('/auth/v1/signup')) return J({ ...user, email_confirmed_at: null, identities: [{}] });
      if (path.startsWith('/auth/v1/token')) return J(session);
      if (path.startsWith('/auth/v1/user')) return J(user);
      if (path.startsWith('/rest/v1/profiles')) return J(m === 'PATCH' ? [profile] : profile);
      if (path.startsWith('/rest/v1/categories')) return J(cats);
      if (path.startsWith('/rest/v1/cards')) return J([]);
      if (path.startsWith('/rest/v1/recurring')) return J([{ id: 'rec-1', user_id: user.id, type: 'in', name: 'Cliente Teste', amount: 45, day: 1, category_id: null, card_id: null, start_month: '2026-01', end_month: null, phone: '22999990000', auto: false, active: true }]);
      if (path.startsWith('/rest/v1/goals')) return J([]);
      if (path.startsWith('/rest/v1/transactions')) {
        if (m === 'POST') { const row = JSON.parse(r.postData()); return J({ id: 'tx-1', user_id: user.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), legacy_id: null, legacy_ts: null, recurring_id: null, recurring_month: null, ...row }, 201); }
        return J([]);
      }
      if (path.startsWith('/functions/v1/ai')) return J({ reply: 'Resposta da IA com seus números.', usage: { count: 1, limit: 40 } });
      return J({ message: 'não simulado: ' + path }, 404);
    }
  });

  await p.goto(SITE + 'app.html', { waitUntil: 'load' }); await sleep(900);
  ok(await p.$eval('#auth', e => !e.hidden), 'sem sessão: abre na tela de login');
  // criar conta
  await p.click('[data-act="authTab"][data-tab="signup"]');
  await p.type('#auth-email', user.email); await p.type('#auth-pass', 'segredo123'); await p.type('#auth-pass2', 'segredo123');
  await p.click('#auth-submit'); await sleep(700);
  ok(/Conta criada/.test(await p.$eval('#auth-msg', e => e.textContent)), 'criar conta pede confirmação por e-mail');
  ok(seen.some(s => s.startsWith('POST /auth/v1/signup') && s.includes('redirect_to=' + SITE + 'app.html')), 'link de confirmação volta para o app.html');
  // entrar
  await p.click('[data-act="authTab"][data-tab="login"]');
  await p.$eval('#auth-pass', e => { e.value = ''; }); await p.type('#auth-pass', 'segredo123');
  await p.click('#auth-submit'); await sleep(1500);
  ok(await p.$eval('#app', e => !e.hidden), 'login abre o app');
  for (const t of ['transactions', 'profiles', 'categories', 'cards', 'recurring', 'goals']) ok(seen.some(s => s.startsWith('GET /rest/v1/' + t)), 'carrega ' + t + ' do Supabase');
  // lançar
  await p.click('#mnav .fab'); await sleep(300);
  await p.type('#tx-amount', '52,90'); await p.click('[data-act="txSave"]'); await sleep(800);
  const post = seen.find(s => s.startsWith('POST /rest/v1/transactions'));
  ok(post && /"amount":52\.9/.test(post) && !/user_id/.test(post), 'salva no Supabase sem mandar user_id (o banco preenche)');
  // contas fixas do banco
  await p.evaluate(() => document.querySelector('#mnav [data-page="more"]').click()); await sleep(200);
  await p.evaluate(() => document.querySelector('#page [data-act="go"][data-page="bills"]').click()); await sleep(300);
  ok(await p.$eval('#page', e => /Cliente Teste/.test(e.textContent) && /Atrasado/.test(e.textContent)), 'Contas fixas mostra a conta do banco como atrasada');
  // IA pela função do servidor, com o login
  await p.evaluate(() => document.querySelector('#mnav [data-page="more"]').click()); await sleep(200);
  await p.evaluate(() => document.querySelector('#page [data-act="go"][data-page="ai"]').click()); await sleep(300);
  await p.evaluate(() => document.querySelector('[data-act="aiAsk"]').click()); await sleep(800);
  const ai = seen.find(s => s.startsWith('POST /functions/v1/ai'));
  ok(ai && /"messages"/.test(ai), 'IA chamada pela função do Supabase');
  ok(await p.$eval('#chat', e => /Resposta da IA/.test(e.textContent)), 'resposta da IA aparece no chat');
  ok(errs.length === 0, 'sem erros de JavaScript' + (errs.length ? ': ' + errs.join(' | ').slice(0, 300) : ''));
  await br.close();
  done();
})().catch(e => { console.log('❌ exceção', e.message); process.exit(1); });
