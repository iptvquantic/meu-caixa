// "Lançar com IA" no Chromium de verdade (modo demonstração): microfone (gravação real com o dispositivo falso do
// Chromium), câmera (no celular, a câmera do aparelho pelo campo com capture; no computador, a webcam falsa do
// Chromium), foto escolhida (reduzida para JPEG no navegador) e texto — no Início, no Novo lançamento e no Assistente.
// Confere o que vai para o robô (tipo e conteúdo do arquivo), que a câmera desliga e que a foto não fica no app.
// Voz que envia sozinha: o microfone falso toca um áudio de "fala" (1,2 s) seguida de silêncio, e o app tem que
// mandar sem ninguém tocar em Enviar; depois, Desfazer e Corrigir no aviso.
const fs = require('fs'), os = require('os'), path = require('path');
const { launch, routeSite, appHtml, SITE, checker, sleep } = require('./lib');
const { ok, done } = checker('Lançar com IA (voz, câmera, foto e texto no navegador)');
const ICON = path.join(__dirname, '..', 'icon-512.png'), ICON2 = path.join(__dirname, '..', 'icon-192.png');

async function open(br, mobile) {
  const p = await br.newPage();
  await p.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 860 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/net::|ERR_|fetching the script/.test(m.text())) errs.push(m.text()); });
  await routeSite(p, { html: appHtml({ demo: true }) });
  await p.evaluateOnNewDocument(() => {
    window.__MC_TEST__ = true; localStorage.setItem('mc_page', JSON.stringify('home'));
    // qual campo de arquivo foi aberto (câmera ou galeria)
    window.__opened = []; const click = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () { if (this.type === 'file') window.__opened.push(this.id); return click.call(this); };
  });
  await p.goto(SITE + 'app.html', { waitUntil: 'load' }); await sleep(900);
  // o que o app manda ao robô fica guardado; a resposta imita a função (um lançamento criado)
  await p.evaluate(() => {
    const M = window.__mc; window.__calls = [];
    M.Demo.assist = async (b) => {
      window.__calls.push({ text: b.text, noAI: b.noAI, hint: b.hint || null, audio: b.audio ? { mime: b.audio.mime, len: b.audio.data.length, head: b.audio.data.slice(0, 4), hdr: b.audio.data.slice(0, 60) } : null, image: b.image ? { mime: b.image.mime, len: b.image.data.length, head: b.image.data.slice(0, 4) } : null });
      const tx = M.Demo._ins('txs', { type: 'out', amount: 52.9, date: new Date().toISOString().slice(0, 10), description: b.image ? 'Drogasil' : 'Mercado', category_id: null, card_id: null, installments: 1, invest_kind: null });
      return { handled: true, heard: b.audio ? 'mercado 52,90' : undefined, tx, reply: '💸 *Saída* de *R$ 52,90*' };
    };
  });
  return { p, errs, calls: () => p.evaluate(() => window.__calls), opened: () => p.evaluate(() => window.__opened) };
}
// escolhe o arquivo na janela que o app abriu (câmera do celular ou galeria)
async function choose(p, sel, file) {
  const [chooser] = await Promise.all([p.waitForFileChooser({ timeout: 4000 }), p.click(sel)]);
  await chooser.accept([file]); await sleep(1300);
}
const toastText = p => p.$eval('#toast-root', e => e.textContent);
// WAV de teste: 0,4 s de silêncio, 1,2 s de "fala" (tom que sobe e desce, como sílabas) e 4 s de silêncio
function speechWav(file) {
  const rate = 48000, parts = [[0.4, 0], [1.2, 1], [4, 0]], n = parts.reduce((a, [t]) => a + Math.round(t * rate), 0);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  let i = 0;
  for (const [t, on] of parts) for (let k = 0; k < Math.round(t * rate); k++, i++) {
    const x = k / rate, v = on ? 0.45 * Math.sin(2 * Math.PI * 220 * x) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * x)) : 0;
    b.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, b);
}
const inputsEmpty = p => p.evaluate(() => ['photo-cam', 'photo-pick'].every(id => { const i = document.getElementById(id); return i.value === '' && (!i.files || i.files.length === 0); }));

(async () => {
  const br = await launch(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']);

  // ======================= celular =======================
  let { p, errs, calls, opened } = await open(br, true);
  ok(await p.evaluate(() => window.__mc.touchFirst()), 'celular: tela de toque reconhecida');
  ok(await p.$('#page .ai-card.home [data-act="homeCamera"]'), 'Início: "Lançar com IA" com Tirar foto');

  // ---- voz no Novo lançamento: grava de verdade e manda o áudio ----
  await p.click('#mnav .fab'); await sleep(400);
  await p.click('[data-act="asMic"]'); await sleep(1600);
  ok(await p.$('#as-row .rec') && /0:0[1-2]/.test(await p.$eval('#as-row .rec', e => e.textContent)), 'gravando: contador e botões de cancelar e enviar');
  await p.click('[data-act="recSend"]'); await sleep(900);
  let c = (await calls())[0];
  ok(c && c.audio && c.audio.mime === 'audio/wav' && c.audio.head === 'UklG' && c.audio.len > 2000 && c.noAI === false, 'áudio gravado vira WAV (16 kHz, sem silêncio) e vai para o robô: ' + JSON.stringify(c));
  const hdr = Buffer.from(c?.audio?.hdr || '', 'base64');
  ok(hdr.toString('latin1', 8, 16) === 'WAVEfmt ' && hdr.readUInt16LE(22) === 1 && hdr.readUInt32LE(24) === 16000 && hdr.readUInt16LE(34) === 16, 'WAV mono, 16 kHz, 16 bits (o formato do reconhecimento de voz)');
  ok(c && c.hint && c.hint.sure === false, 'vai junto a aba do formulário como dica');
  ok(!(await p.$('#as-row')) && /Saída de R\$\s?52,90/.test(await toastText(p)), 'lançado: folha fecha e avisa com Desfazer');
  // cancelar a gravação não manda nada
  await p.click('#mnav .fab'); await sleep(400);
  await p.click('[data-act="asMic"]'); await sleep(1000);
  await p.click('[data-act="recCancel"]'); await sleep(500);
  ok((await calls()).length === 1 && await p.$('#as-text'), 'cancelar a gravação: nada é enviado e os botões voltam');

  // ---- Escolher foto (galeria): reduzida para JPEG e enviada ----
  await choose(p, '[data-act="asPhoto"]', ICON);
  c = (await calls())[1];
  ok(c && c.image && c.image.mime === 'image/jpeg' && c.image.head === '/9j/' && c.image.len > 500, 'foto escolhida vira JPEG no aparelho e vai para o robô: ' + JSON.stringify(c));
  ok((await opened()).at(-1) === 'photo-pick' && await inputsEmpty(p), 'abriu a galeria e o arquivo saiu do app depois de lido');
  ok(!(await p.$('#as-row')) && /foto descartada/.test(await toastText(p)), 'foto lançada: folha fecha e avisa que a foto foi descartada');

  // ---- Tirar foto (celular): câmera do aparelho ----
  await p.click('#mnav .fab'); await sleep(400);
  await choose(p, '[data-act="asCamera"]', ICON2);
  c = (await calls())[2];
  ok((await opened()).at(-1) === 'photo-cam' && await p.$eval('#photo-cam', e => e.getAttribute('capture') === 'environment'), 'Tirar foto abre a câmera traseira do celular');
  ok(c && c.image && c.image.head === '/9j/' && await inputsEmpty(p), 'foto da câmera lida e lançada; nada fica guardado');

  // ---- direto do Início: Tirar foto já lança; Falar já grava ----
  await choose(p, '[data-act="homeCamera"]', ICON);
  c = (await calls())[3];
  ok(c && c.image && /foto descartada/.test(await toastText(p)), 'Início → Tirar foto: lê e lança sem passar por outra tela');
  await p.click('[data-act="homeMic"]'); await sleep(1500);
  ok(await p.$('.sheet #as-row .rec'), 'Início → Falar: abre gravando');
  await p.click('[data-act="recSend"]'); await sleep(900);
  ok((await calls())[4]?.audio, 'Início → Falar: áudio enviado');

  // ---- página Assistente: voz e foto na conversa (pergunta livre fica para o Conselheiro) ----
  await p.evaluate(() => window.__mc.go('ai')); await sleep(300);
  await p.click('[data-act="aiMic"]'); await sleep(1500);
  ok(await p.$('#ai-row .rec'), 'Assistente: gravando');
  await p.click('[data-act="recSend"]'); await sleep(1000);
  c = (await calls())[5];
  ok(c && c.audio && c.noAI === true, 'Assistente: áudio vai ao robô (perguntas ficam com o Conselheiro)');
  ok(/🎙️ “mercado 52,90”/.test(await p.$eval('#chat', e => e.textContent)), 'mostra o que entendeu do áudio');
  await choose(p, '[data-act="aiCamera"]', ICON2);
  c = (await calls())[6];
  ok(c && c.image && c.image.mime === 'image/jpeg' && /Foto do comprovante/.test(await p.$eval('#chat', e => e.textContent)) && (await opened()).at(-1) === 'photo-cam', 'Assistente: Tirar foto vai para a conversa');
  // texto: o botão vira enviar quando há texto
  ok(await p.$('[data-act="aiMic"]') && !(await p.$('[data-act="aiSend"]')), 'sem texto: microfone');
  await p.type('#ai-in', 'mercado 10');
  ok(await p.$('[data-act="aiSend"]') && !(await p.$('[data-act="aiMic"]')), 'com texto: enviar');
  await p.click('[data-act="aiSend"]'); await sleep(800);
  ok((await calls())[7]?.text === 'mercado 10' && await p.$('[data-act="aiMic"]'), 'texto enviado e o microfone volta');
  ok(errs.length === 0, 'celular: sem erros de JavaScript' + (errs.length ? ': ' + errs.join(' | ').slice(0, 300) : ''));
  await p.close();

  // ======================= computador: webcam =======================
  ({ p, errs, calls, opened } = await open(br, false));
  ok(!(await p.evaluate(() => window.__mc.touchFirst())), 'computador: sem tela de toque');
  await p.click('[data-act="homeCamera"]'); await sleep(300);
  ok(await p.$('#cam-video') && /Tirar foto do comprovante/.test(await p.$eval('#cam-title', e => e.textContent)), 'Tirar foto no computador: abre a câmera dentro do app');
  await p.waitForFunction(() => { const b = document.getElementById('cam-shot'); return b && !b.disabled; }, { timeout: 8000 }).catch(() => { });
  ok(await p.evaluate(() => { const v = document.getElementById('cam-video'); return !!(v && v.srcObject && v.videoWidth > 0); }), 'webcam ligada mostrando a imagem');
  await p.click('#cam-shot'); await sleep(1300);
  c = (await calls())[0];
  ok(c && c.image && c.image.mime === 'image/jpeg' && c.image.head === '/9j/' && c.image.len > 500, 'Fotografar: a imagem da webcam vira JPEG e vai para o robô: ' + JSON.stringify(c && c.image));
  ok(await p.evaluate(() => window.__mc.CAM.stream === null && !document.getElementById('cam-video')), 'depois de fotografar a câmera desliga (nada fica aberto)');
  ok(/foto descartada/.test(await toastText(p)), 'lançado e avisado: foto descartada');
  // fechar sem fotografar também desliga; "Escolher arquivo" abre a galeria
  await p.evaluate(() => window.__mc.openTx()); await sleep(300);
  await p.click('[data-act="asCamera"]'); await sleep(300);
  await p.waitForFunction(() => window.__mc.CAM.stream !== null, { timeout: 8000 }).catch(() => { });
  ok(await p.evaluate(() => document.querySelectorAll('.sheet').length === 2), 'câmera abre por cima do Novo lançamento');
  await p.evaluate(() => { const b = [...document.querySelectorAll('.sheet [data-act="closeSheet"]')].pop(); b && b.click(); }); await sleep(300);
  ok(await p.evaluate(() => window.__mc.CAM.stream === null), 'fechar a câmera desliga a webcam');
  ok(await p.$('.sheet #as-row'), '... e volta para o Novo lançamento');
  await p.click('[data-act="asCamera"]'); await sleep(400);
  await choose(p, '[data-act="camFile"]', ICON);
  c = (await calls())[1];
  ok(c && c.image && (await opened()).at(-1) === 'photo-pick' && await p.evaluate(() => window.__mc.CAM.stream === null), 'sem querer a webcam: "Escolher arquivo" usa a galeria e a câmera desliga');
  ok(errs.length === 0, 'computador: sem erros de JavaScript' + (errs.length ? ': ' + errs.join(' | ').slice(0, 300) : ''));
  await br.close();

  // ======================= voz que envia sozinha =======================
  const wav = path.join(os.tmpdir(), 'mc-fala-teste.wav');
  speechWav(wav);
  const br2 = await launch(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}%noloop`]);
  ({ p, errs, calls } = await open(br2, true));
  await p.click('#mnav .fab'); await sleep(400);
  await p.click('[data-act="asMic"]');
  // durante a "fala" o medidor sobe; ninguém toca em Enviar
  let peak = 0;
  for (let k = 0; k < 14; k++) {
    await sleep(100);
    peak = Math.max(peak, await p.evaluate(() => Math.max(0, ...[...document.querySelectorAll('.lvl i')].map(i => +((/scaleY\(([\d.]+)\)/.exec(i.style.transform) || [])[1] || 0)))));
  }
  ok(peak > 0.45, 'medidor sobe com a voz (escala ' + peak.toFixed(2) + ')');
  ok(/envio quando você parar/.test(await p.$eval('#as-row .rec small', e => e.textContent).catch(() => '')), 'avisa que envia quando a pessoa parar de falar');
  await p.waitForFunction(() => window.__calls.length > 0, { timeout: 7000 }).catch(() => { });
  c = (await calls())[0];
  ok(c && c.audio && c.audio.mime === 'audio/wav', 'parou de falar: o áudio foi enviado sozinho, sem tocar em Enviar');
  await sleep(400);
  const acts = await p.$$eval('#toast-root [data-act="toastAction"]', b => b.map(x => x.textContent));
  ok(acts.join(',') === 'Desfazer,Corrigir' && /🎙️ “mercado 52,90” → Saída/.test(await toastText(p)), 'aviso com o que ouviu, Desfazer e Corrigir: ' + acts.join(','));
  await p.click('#toast-root [data-act="toastAction"][data-i="1"]'); await sleep(500);
  ok(/Editar lançamento/.test(await p.$eval('#tx-title', e => e.textContent).catch(() => '')), 'Corrigir abre o lançamento para ajustar');
  ok(errs.length === 0, 'voz automática: sem erros de JavaScript' + (errs.length ? ': ' + errs.join(' | ').slice(0, 300) : ''));
  await br2.close();
  try { fs.unlinkSync(wav); } catch { }
  done();
})().catch(e => { console.log('❌ exceção', e.stack || e.message); process.exit(1); });
