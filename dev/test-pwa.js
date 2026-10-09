// App instalável: o Chromium lê o manifest, os ícones e o atalho, e não vê impedimento para instalar.
const fs = require('fs'), path = require('path');
const { launch, serveRoot, ROOT, checker, sleep } = require('./lib');
const { ok, done } = checker('app instalável');

(async () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  for (const i of m.icons) ok(fs.existsSync(path.join(ROOT, i.src)), 'ícone do manifest existe: ' + i.src);
  ok(m.icons.some(i => i.purpose === 'maskable'), 'tem ícone "maskable" (Android)');
  ok(m.shortcuts && m.shortcuts[0] && /novo=1/.test(m.shortcuts[0].url), 'atalho "Novo lançamento"');
  const { server, base } = serveRoot(8124);
  const br = await launch();
  const p = await br.newPage();
  await p.setRequestInterception(true);
  p.on('request', r => r.url().startsWith('http://localhost:') ? r.continue() : r.abort()); // nada sai para a internet
  await p.goto(base + 'app.html', { waitUntil: 'load' }); await sleep(1500);
  const cdp = await p.target().createCDPSession();
  const man = await cdp.send('Page.getAppManifest');
  ok(!(man.errors || []).length, 'manifest sem erros: ' + (man.errors || []).map(e => e.message).join('; '));
  const parsed = JSON.parse(man.data || '{}');
  ok(parsed.name === 'Meu Caixa' && parsed.display === 'standalone', 'nome e modo tela cheia');
  try {
    const ie = await cdp.send('Page.getInstallabilityErrors');
    ok(ie.installabilityErrors.length === 0, 'sem impedimentos para instalar: ' + ie.installabilityErrors.map(e => e.errorId).join(', '));
  } catch (e) { console.log('ℹ️ verificação de instalação indisponível neste Chromium:', e.message.slice(0, 80)); }
  await br.close(); server.close();
  done();
})().catch(e => { console.log('❌ exceção', e.message); process.exit(1); });
