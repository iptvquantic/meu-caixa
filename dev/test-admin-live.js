// Painel de clientes pelo caminho real (supabase-js, CSP do site) no Chromium, com o Supabase simulado:
// o app chama as funções admin_users/admin_set_plan com o login do dono, manda os parâmetros certos, mostra a
// resposta do servidor, desfaz pelo aviso e trata "função ainda não publicada". Foco e teclado de verdade.
const { launch, routeSite, appConfig, appHtml, SITE, checker, sleep } = require('./lib');
const { ok, done } = checker('painel de clientes (caminho real)');

const { url: REF } = appConfig();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const user = { id: '22222222-2222-2222-2222-222222222222', aud: 'authenticated', role: 'authenticated', email: 'dono@exemplo.com', email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.sig';
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r1', user };
const profile = { id: user.id, email: user.email, name: 'Dono', plan: 'master', plan_expiry: '2099-12-31T00:00:00Z', active: true, settings: {} };
const day = n => new Date(Date.now() + n * 864e5).toISOString();
const ana = { id: 'aaaa0000-0000-4000-8000-000000000001', email: 'ana@exemplo.com', name: 'Ana Souza', whatsapp: '22999990001', plan: 'trial', plan_expiry: day(9), active: true,
  created_at: day(-6), tx_count: 14, last_tx: day(-1).slice(0, 10), last_seen: day(-0.2), last_action: null, last_action_at: null };
const bia = { ...ana, id: 'bbbb0000-0000-4000-8000-000000000002', email: 'bia@exemplo.com', name: 'Bia Lopes', whatsapp: null, plan: 'active', plan_expiry: day(40), tx_count: 120 };
const self = { ...ana, id: user.id, email: user.email, name: 'Dono', plan: 'master', plan_expiry: '2099-12-31T00:00:00Z' };
const seen = [], rpc = [];
let missing = false; // simula a função ainda não publicada no servidor

(async () => {
  const br = await launch();
  const p = await br.newPage();
  await p.setViewport({ width: 1280, height: 860 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/net::|ERR_|fetching the script|status of 404/.test(m.text())) errs.push(m.text()); });
  await routeSite(p, {
    html: appHtml(),
    supabase: r => {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*' };
      if (r.method() === 'OPTIONS') return r.respond({ status: 200, headers: cors, body: '' });
      const path = r.url().slice(REF.length), m = r.method();
      seen.push(`${m} ${path.split('?')[0]}`);
      const J = (o, s = 200) => r.respond({ status: s, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
      if (path.startsWith('/auth/v1/token')) return J(session);
      if (path.startsWith('/auth/v1/user')) return J(user);
      if (path.startsWith('/rest/v1/profiles')) return J(profile);
      if (/^\/rest\/v1\/(categories|cards|recurring|goals|transactions|wa_links)/.test(path)) return J([]);
      if (path.startsWith('/functions/v1/whatsapp?info=1')) return J({ configured: false, ready: false });
      if (path.startsWith('/functions/v1/whatsapp?setup=1')) return J({ ok: true, message: 'ok' });
      if (path.startsWith('/rest/v1/rpc/admin_')) {
        const name = path.split('?')[0].slice('/rest/v1/rpc/'.length), body = JSON.parse(r.postData() || '{}');
        rpc.push({ name, body, auth: r.headers().authorization || '' });
        if (missing) return J({ code: 'PGRST202', message: 'Could not find the function public.admin_users without parameters in the schema cache', details: null, hint: null }, 404);
        if (name === 'admin_users') return J([self, ana, bia]);
        if (name === 'admin_set_plan') {
          const u = [ana, bia].find(x => x.id === body.p_user);
          if (body.p_action === 'anual') { u.plan = 'active'; u.plan_expiry = day(9 + 365); u.last_action = 'anual'; }
          else if (body.p_action === 'desfazer') { u.plan = 'trial'; u.plan_expiry = day(9); u.last_action = 'desfazer'; }
          return J([{ id: u.id, plan: u.plan, plan_expiry: u.plan_expiry, active: u.active }]);
        }
      }
      return J({ message: 'não simulado: ' + path }, 404);
    }
  });

  await p.goto(SITE + 'app.html', { waitUntil: 'load' }); await sleep(900);
  await p.click('[data-act="authTab"][data-tab="login"]');
  await p.type('#auth-email', user.email); await p.type('#auth-pass', 'segredo123');
  await p.click('#auth-submit'); await sleep(1500);
  ok(await p.$eval('#app', e => !e.hidden), 'dono entra no app');
  ok(!!(await p.$('#side-nav [data-page="admin"]')), 'menu lateral com Clientes');
  ok(!rpc.length, 'a lista só é pedida quando o dono abre Clientes');

  await p.click('#side-nav [data-page="admin"]'); await sleep(700);
  ok(rpc.length === 1 && rpc[0].name === 'admin_users' && rpc[0].auth === 'Bearer ' + jwt, 'lista pedida ao banco (admin_users) com o login do dono');
  ok(await p.$$eval('#page .adm-row', r => r.length) === 2, 'a conta do dono não aparece entre os clientes');

  // busca: o campo continua com o foco e o cursor enquanto filtra
  await p.click('#adm-q'); await p.keyboard.type('bia'); await sleep(450);
  ok(await p.$$eval('#page .adm-row', r => r.length) === 1 && await p.evaluate(() => document.activeElement.id === 'adm-q' && document.activeElement.value === 'bia'), 'busca filtra e o foco fica no campo');
  await p.$eval('#adm-q', e => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(450);

  // liberar o anual: foco no Confirmar, Voltar devolve o foco, Enter confirma
  await p.evaluate(() => [...document.querySelectorAll('#page .adm-row')].find(r => /Ana Souza/.test(r.textContent)).click()); await sleep(300);
  await p.click('.sheet [data-act="admAsk"][data-a="anual"]'); await sleep(150);
  ok(await p.evaluate(() => document.activeElement?.dataset.act === 'admDo'), 'confirmação: foco no Confirmar');
  await p.click('.sheet [data-act="admBack"]'); await sleep(150);
  ok(await p.evaluate(() => document.activeElement?.dataset.a === 'anual'), 'Voltar devolve o foco ao botão do plano');
  await p.keyboard.press('Enter'); await sleep(150);
  ok(await p.evaluate(() => document.activeElement?.dataset.act === 'admDo'), 'teclado: Enter no plano abre a confirmação');
  await p.keyboard.press('Enter'); await sleep(900);
  const set = rpc.find(c => c.name === 'admin_set_plan');
  ok(set && set.body.p_user === ana.id && set.body.p_action === 'anual' && set.auth === 'Bearer ' + jwt, 'admin_set_plan com p_user, p_action e o login: ' + JSON.stringify(set && set.body));
  const until = new Date(ana.plan_expiry).toLocaleDateString('pt-BR');
  ok(await p.$eval('#toast-root', (e, u) => e.textContent.includes('Plano Anual liberado para Ana Souza até ' + u) && /Desfazer/.test(e.textContent), until), 'aviso com a data que o servidor devolveu (' + until + ')');
  ok(rpc.filter(c => c.name === 'admin_users').length === 2 && await p.$eval('#page', e => /Ativo até/.test(e.textContent)), 'lista recarregada do banco depois do ajuste');
  await p.click('#toast-root [data-act="toastAction"]'); await sleep(900);
  ok(rpc.at(-2)?.name === 'admin_set_plan' && rpc.at(-2).body.p_action === 'desfazer' && rpc.at(-2).body.p_user === ana.id, 'Desfazer do aviso chama o banco com "desfazer"');
  ok(await p.$eval('#page', e => /Teste: 9 dias/.test(e.textContent)), 'Ana de volta ao teste');

  // função ainda não publicada no servidor: explica em vez de quebrar
  missing = true;
  const before = rpc.length;
  await p.click('#page [data-act="admReload"]'); await sleep(800);
  ok(await p.$eval('#page', e => /Não consegui atualizar agora: O painel de clientes ainda não está ativo no servidor/.test(e.textContent) && e.querySelectorAll('.adm-row').length === 2),
    'atualizar falhou: avisa e mantém a lista que já tinha');
  await sleep(600);
  ok(rpc.length === before + 1, 'depois de uma falha não fica pedindo de novo sozinho (' + (rpc.length - before) + ' pedido)');
  // sem a lista (primeira abertura): mensagem clara
  await p.reload({ waitUntil: 'load' }); await sleep(1500);
  await p.click('#side-nav [data-page="admin"]').catch(() => { }); await sleep(800);
  ok(await p.$eval('#page', e => /ainda não está ativo no servidor/.test(e.textContent) && !!e.querySelector('[data-act="admReload"]')), 'função não publicada: "ainda não está ativo no servidor" e Tentar de novo');
  missing = false;
  await p.click('#page [data-act="admReload"]'); await sleep(900);
  ok(await p.$$eval('#page .adm-row', r => r.length) === 2, 'Tentar de novo carrega a lista');

  // celular: Clientes no Menu
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await sleep(300);
  await p.evaluate(() => document.querySelector('#mnav [data-page="more"]').click()); await sleep(300);
  ok(!!(await p.$('#page .setrow[data-page="admin"]')), 'celular: Clientes no Menu');
  ok(errs.length === 0, 'sem erros de JavaScript nem de CSP' + (errs.length ? ': ' + errs.join(' | ').slice(0, 300) : ''));
  await br.close();
  done();
})().catch(e => { console.log('❌ exceção', e.message); process.exit(1); });
