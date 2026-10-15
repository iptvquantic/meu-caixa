// Página inicial (index.html): quem já tem conta vai direto para o app, links certos, nada vazando no celular,
// e prints em 360/390/1280 px (dev/shots/landing-*.png).
const fs = require('fs'), path = require('path');
const { launch, routeSite, SITE, checker, sleep } = require('./lib');
const { ok, done } = checker('página inicial');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const KEY = 'sb-jgqhtshcuyzytljkmmxd-auth-token';
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

(async () => {
  const br = await launch();
  const open = async (url, { w = 390, h = 844, session = false } = {}) => {
    const ctx = await (br.createBrowserContext ? br.createBrowserContext() : br.createIncognitoBrowserContext()); // cada abertura com o armazenamento limpo
    const p = await ctx.newPage();
    await p.setViewport({ width: w, height: h, isMobile: w < 900, hasTouch: w < 900 });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && /Refused|Content Security Policy/i.test(m.text())) errs.push(m.text()); }); // CSP bloqueando algo da página
    await routeSite(p, { html: '<!doctype html><title>app</title><p id="app-ok">app</p>' });
    if (session) await p.evaluateOnNewDocument((k) => localStorage.setItem(k, JSON.stringify({ access_token: 'a', refresh_token: 'r', user: { id: 'u' } })), KEY);
    await p.goto(url, { waitUntil: 'load' }); await sleep(400);
    return { p, errs };
  };

  // quem não tem conta vê a página; quem tem vai para o app
  let { p, errs } = await open(SITE);
  ok(p.url() === SITE && await p.$eval('h1', e => /Quanto entrou/.test(e.textContent)), 'sem conta: mostra a página inicial');
  ok(errs.length === 0, 'sem erros de JavaScript nem bloqueio da CSP' + (errs.length ? ': ' + errs.join(' | ') : ''));
  ok(await p.$eval('meta[http-equiv="Content-Security-Policy"]', m => /script-src 'sha256-/.test(m.content) && /connect-src 'none'/.test(m.content)), 'página inicial com CSP (só o script dela roda; não manda dados a lugar nenhum)');
  await p.close();
  ({ p } = await open(SITE, { session: true }));
  ok(p.url().startsWith(SITE + 'app.html'), 'com sessão salva no aparelho: vai direto para o app');
  await p.close();
  ({ p } = await open(SITE + '?site=1', { session: true }));
  ok(p.url() === SITE + '?site=1', '?site=1 mostra a página mesmo com sessão');
  await p.close();
  ({ p } = await open(SITE + '#access_token=x&refresh_token=y&type=recovery'));
  ok(p.url() === SITE + 'app.html#access_token=x&refresh_token=y&type=recovery', 'link de e-mail (nova senha) segue para o app com o token');
  await p.close();
  ({ p } = await open(SITE + '?ref=zap'));
  ok(p.url() === SITE + '?ref=zap', 'parâmetros comuns não redirecionam');
  await p.close();

  // links e conteúdo
  ({ p } = await open(SITE, { w: 1280, h: 860 }));
  const links = await p.$$eval('a', as => as.map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim(), target: a.target, rel: a.rel })));
  ok(links.some(l => l.href === 'app.html?criar=1' && /Começar grátis/.test(l.text)), '"Começar grátis" abre o cadastro no app');
  ok(links.some(l => l.href === 'app.html' && /Entrar|Já tenho conta/.test(l.text)), '"Entrar" abre o app');
  for (const u of ['https://pag.ae/81RjjwLHN', 'https://pag.ae/81RjjRMhR', 'https://pag.ae/81Rjk7oKs']) ok(links.some(l => l.href === u && l.target === '_blank' && /noopener/.test(l.rel)), 'plano com link do PagBank: ' + u);
  ok(links.filter(l => /wa\.me\/5522991053813/.test(l.href)).length >= 2, 'suporte no WhatsApp (22) 99105-3813');
  ok(await p.$$eval('h1', hs => hs.length) === 1 && await p.$eval('html', e => e.lang) === 'pt-BR', 'um título principal e idioma pt-BR');
  ok(!/IPTV|Apostas|Chave PIX|pix-key/.test(html), 'nada da página antiga (exemplos de IPTV/apostas, chave PIX pessoal)');
  ok(!/sb_secret_|gsk_|service_role/.test(html), 'nenhuma chave secreta');
  ok(await p.$eval('#r-month', e => e.textContent.length > 2), 'cupom com o mês atual');
  await p.close();

  // prints e vazamento horizontal
  for (const [name, w, h] of [['landing-m360', 360, 780], ['landing-m390', 390, 844], ['landing-d1280', 1280, 860]]) {
    ({ p, errs } = await open(SITE, { w, h }));
    await p.addStyleTag({ content: '*{animation:none!important}' });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(overflow <= 1, `${name}: nada vaza na horizontal (${overflow}px)`);
    await p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
    await p.close();
  }
  await br.close();
  done();
})().catch(e => { console.log('❌ exceção', e.message); process.exit(1); });
