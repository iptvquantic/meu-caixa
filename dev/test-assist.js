// Assistente no Chromium de verdade (modo demonstração): microfone (gravação real com o dispositivo falso do
// Chromium), foto escolhida no aparelho (reduzida para JPEG no navegador) e texto — no Novo lançamento e na
// página Assistente. Confere o que vai para o robô (tipo e conteúdo do arquivo) e o que volta na tela.
const path = require('path');
const { launch, routeSite, appHtml, SITE, checker, sleep } = require('./lib');
const { ok, done } = checker('assistente (voz, foto e texto no navegador)');

(async () => {
  const br = await launch(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']);
  const p = await br.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/net::|ERR_|fetching the script/.test(m.text())) errs.push(m.text()); });
  await routeSite(p, { html: appHtml({ demo: true }) });
  await p.evaluateOnNewDocument(() => { window.__MC_TEST__ = true; localStorage.setItem('mc_page', JSON.stringify('home')); });
  await p.goto(SITE + 'app.html', { waitUntil: 'load' }); await sleep(900);
  // o que o app manda ao robô fica guardado; a resposta imita a função (um lançamento criado)
  await p.evaluate(() => {
    const M = window.__mc; window.__calls = [];
    M.Demo.assist = async (b) => {
      window.__calls.push({ text: b.text, noAI: b.noAI, audio: b.audio ? { mime: b.audio.mime, len: b.audio.data.length } : null, image: b.image ? { mime: b.image.mime, len: b.image.data.length, head: b.image.data.slice(0, 4) } : null });
      const tx = M.Demo._ins('txs', { type: 'out', amount: 52.9, date: new Date().toISOString().slice(0, 10), description: b.image ? 'Drogasil' : 'Mercado', category_id: null, card_id: null, installments: 1, invest_kind: null });
      return { handled: true, heard: b.audio ? 'mercado 52,90' : undefined, tx, reply: '💸 *Saída* de *R$ 52,90*' };
    };
  });
  const calls = () => p.evaluate(() => window.__calls);

  // ---- voz no Novo lançamento: grava de verdade e manda o áudio ----
  await p.click('#mnav .fab'); await sleep(400);
  await p.click('[data-act="asMic"]'); await sleep(1600);
  ok(await p.$('#as-row .rec') && /0:0[1-2]/.test(await p.$eval('#as-row .rec', e => e.textContent)), 'gravando: contador e botões de cancelar e enviar');
  await p.click('[data-act="recSend"]'); await sleep(900);
  let c = (await calls())[0];
  ok(c && c.audio && /^audio\/(webm|ogg|mp4)$/.test(c.audio.mime) && c.audio.len > 200 && c.noAI === false, 'áudio gravado vai para o robô (tipo e conteúdo): ' + JSON.stringify(c));
  ok(!(await p.$('#as-row')) && /Saída de R\$\s?52,90/.test(await p.$eval('#toast-root', e => e.textContent)), 'lançado: folha fecha e avisa com Desfazer');
  // cancelar a gravação não manda nada
  await p.click('#mnav .fab'); await sleep(400);
  await p.click('[data-act="asMic"]'); await sleep(1000);
  await p.click('[data-act="recCancel"]'); await sleep(500);
  ok((await calls()).length === 1 && await p.$('#as-text'), 'cancelar a gravação: nada é enviado e a barra volta');

  // ---- foto escolhida no aparelho: reduzida para JPEG e enviada ----
  const input = await p.$('#as-file');
  await input.uploadFile(path.join(__dirname, '..', 'icon-512.png')); await sleep(1200);
  c = (await calls())[1];
  ok(c && c.image && c.image.mime === 'image/jpeg' && c.image.head === '/9j/' && c.image.len > 500, 'foto vira JPEG no aparelho e vai para o robô: ' + JSON.stringify(c));
  ok(!(await p.$('#as-row')), 'foto lançada: folha fecha');

  // ---- página Assistente: voz e foto na conversa (pergunta livre fica para o Conselheiro) ----
  await p.evaluate(() => window.__mc.go('ai')); await sleep(300);
  await p.click('[data-act="aiMic"]'); await sleep(1500);
  ok(await p.$('#ai-row .rec'), 'Assistente: gravando');
  await p.click('[data-act="recSend"]'); await sleep(1000);
  c = (await calls())[2];
  ok(c && c.audio && c.noAI === true, 'Assistente: áudio vai ao robô (perguntas ficam com o Conselheiro)');
  ok(/🎙️ “mercado 52,90”/.test(await p.$eval('#chat', e => e.textContent)), 'mostra o que entendeu do áudio');
  await (await p.$('#ai-file')).uploadFile(path.join(__dirname, '..', 'icon-192.png')); await sleep(1200);
  c = (await calls())[3];
  ok(c && c.image && c.image.mime === 'image/jpeg' && /Foto do comprovante/.test(await p.$eval('#chat', e => e.textContent)), 'Assistente: foto do comprovante na conversa');
  // texto: o botão vira enviar quando há texto
  ok(await p.$('[data-act="aiMic"]') && !(await p.$('[data-act="aiSend"]')), 'sem texto: microfone');
  await p.type('#ai-in', 'mercado 10');
  ok(await p.$('[data-act="aiSend"]') && !(await p.$('[data-act="aiMic"]')), 'com texto: enviar');
  await p.click('[data-act="aiSend"]'); await sleep(800);
  ok((await calls())[4]?.text === 'mercado 10' && await p.$('[data-act="aiMic"]'), 'texto enviado e o microfone volta');
  ok(errs.length === 0, 'sem erros de JavaScript' + (errs.length ? ': ' + errs.join(' | ').slice(0, 300) : ''));
  await br.close();
  done();
})().catch(e => { console.log('❌ exceção', e.message); process.exit(1); });
