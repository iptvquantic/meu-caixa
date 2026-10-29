// Versão 2.4 (jsdom, modo demonstração): voz que envia sozinha quando a pessoa para de falar (medidor de volume e
// fim da fala com um microfone simulado: silêncio, barulho de feira, barulho alto o tempo todo) e o aviso depois de
// lançar com Desfazer e Corrigir (um lançamento) ou Ver (vários), também na conversa do Assistente.
const { bootApp, click, sleep } = require('./jsdom-app');
const { checker } = require('./lib');
const { ok, done } = checker('versão 2.4 (voz que envia sozinha, Corrigir)');

// microfone simulado: cada passo devolve o volume da vez (rms) e o relógio anda 60 ms
function fakeMic(M, seq) {
  let i = 0;
  const an = { getFloatTimeDomainData(buf) { const a = seq[Math.min(i, seq.length - 1)]; i++; for (let k = 0; k < buf.length; k++) buf[k] = k % 2 ? a : -a; } };
  return { ac: null, an, buf: new Float32Array(1024), noise: -1, voiced: 0, lastVoice: 0, level: 0, heard: false };
}
// roda o fim da fala sobre uma sequência de volumes; devolve em que passo terminou (ou -1) e o estado
function runVad(M, seq) {
  const v = fakeMic(M, seq);
  for (let k = 0; k < seq.length; k++) if (M.vadStep(v, (k + 1) * M.VAD.frame)) return { at: k, v };
  return { at: -1, v };
}
const rep = (n, a) => Array(n).fill(a);

(async () => {
  const onError = m => ok(false, m);
  let w = await bootApp({ touch: true, onError }), d = w.document, M = w.__mc, S = M.S;
  await sleep(50);

  // ---- fim da fala ----
  // 0,5 s de silêncio, 1,2 s de voz, depois silêncio: envia ~1,6 s depois da última voz
  let r = runVad(M, [...rep(8, 0.002), ...rep(20, 0.15), ...rep(60, 0.002)]);
  const lastVoiceStep = 8 + 20 - 1;
  ok(r.at > lastVoiceStep && (r.at - lastVoiceStep) * M.VAD.frame >= M.VAD.quiet && (r.at - lastVoiceStep) * M.VAD.frame <= M.VAD.quiet + 2 * M.VAD.frame, 'silêncio depois da fala: envia sozinho ~1,6 s depois (passo ' + r.at + ')');
  // fala com pausas curtas entre as palavras ("mercado... cinquenta... e dois") não corta no meio
  const words = [];
  for (let k = 0; k < 4; k++) words.push(...rep(8, 0.12), ...rep(12, 0.002)); // pausas de 0,7 s
  r = runVad(M, [...words, ...rep(40, 0.002)]);
  ok(r.at >= words.length, 'pausas curtas entre as palavras não cortam a frase');
  // só um estalo (menos de 0,4 s de som) não conta como fala: não envia sozinho
  r = runVad(M, [...rep(5, 0.002), ...rep(3, 0.2), ...rep(60, 0.002)]);
  ok(r.at === -1 && !r.v.heard, 'um estalo não é fala: não envia sozinho');
  // barulho de feira constante (0,05) e a voz por cima (0,2): entende o fim da fala do mesmo jeito
  r = runVad(M, [...rep(30, 0.05), ...rep(18, 0.2), ...rep(50, 0.05)]);
  ok(r.at > 48 && r.v.heard, 'barulho de fundo constante: acha a voz por cima e o fim da fala');
  // barulho alto o tempo todo: nunca envia sozinho (a pessoa toca em Enviar)
  r = runVad(M, rep(120, 0.25));
  ok(r.at === -1, 'barulho alto o tempo todo: não envia sozinho');
  // o medidor mexe com a voz e fica parado no silêncio
  r = runVad(M, [...rep(10, 0.002)]);
  const quiet = r.v.level;
  r = runVad(M, [...rep(10, 0.002), ...rep(6, 0.15)]);
  ok(quiet < 0.1 && r.v.level > 0.6, 'medidor: parado no silêncio, sobe com a voz (' + quiet.toFixed(2) + ' → ' + r.v.level.toFixed(2) + ')');

  // ---- avisos enquanto grava ----
  Object.assign(M.REC, { mr: { state: 'recording', stop() { } }, where: 'tx', t0: Date.now(), vad: fakeMic(M, rep(400, 0.002)), hint: '' });
  M.openTx(); await sleep(30);
  ok(d.querySelector('.sheet #as-row .lvl') && d.querySelectorAll('.sheet #as-row .lvl i').length === 5 && /Pode falar/.test(d.querySelector('.sheet #as-row .rec small').textContent), 'gravando: medidor com 5 barras e "Pode falar"');
  M.REC.t0 = Date.now() - 5000; M.recTick();
  ok(/fale mais perto/.test(d.querySelector('.sheet #as-row .rec small').textContent), 'sem voz depois de 4,5 s: pede para falar mais perto');
  M.REC.vad.heard = true; M.REC.vad.lastVoice = Date.now(); M.recTick();
  ok(/envio quando você parar/.test(d.querySelector('.sheet #as-row .rec small').textContent), 'com voz: avisa que envia quando a pessoa parar');
  const send = d.querySelector('[data-act="recSend"]');
  M.recTick(); M.recTick();
  ok(send.isConnected && d.querySelector('[data-act="recSend"]') === send, 'os botões não são trocados enquanto grava (o toque em Enviar não se perde)');
  Object.assign(M.REC, { mr: null, vad: null, where: '' });
  click(w, '[data-act="closeSheet"]'); await sleep(20);

  // ---- aviso com duas ações ----
  let a1 = 0, a2 = 0;
  M.toast('Teste', [{ label: 'Um', fn: () => a1++ }, { label: 'Dois', fn: () => a2++ }]);
  const bts = [...d.querySelectorAll('#toast-root [data-act="toastAction"]')];
  ok(bts.length === 2 && bts[0].textContent === 'Um' && bts[1].textContent === 'Dois', 'aviso com duas ações');
  click(w, '#toast-root [data-act="toastAction"][data-i="1"]');
  ok(a2 === 1 && a1 === 0 && !d.querySelector('#toast-root .toast'), 'cada botão faz a sua ação e o aviso some');
  M.toast('Uma ação', { label: 'Só', fn: () => a1++ });
  click(w, '#toast-root [data-act="toastAction"]');
  ok(a1 === 1, 'aviso com uma ação continua igual');

  // ---- depois de lançar pela IA: Desfazer e Corrigir ----
  M.Demo.assist = async () => { const t = M.Demo._ins('txs', { type: 'out', amount: 350, date: M.isoOf(new Date()), description: 'Parcela cartão do pai 3/12', category_id: null, card_id: null, installments: 1, invest_kind: null }); return { handled: true, heard: 'pagamento cartão pai parcela com pix 3/12 350', txs: [t], tx: t, reply: 'ok' }; };
  M.openTx(); await sleep(30);
  await M.asRun({ audio: { mime: 'audio/wav', data: 'UklGRg==' } }, 'Ouvindo…'); await sleep(50);
  const tt = d.querySelector('#toast-root').textContent, t350 = S.txs.find(x => x.amount === 350);
  ok(/🎙️ “pagamento cartão pai parcela com pix 3\/12 350” → Saída de R\$\s?350,00/.test(tt), 'o aviso mostra o que foi ouvido e o que foi lançado: ' + tt);
  const labels = [...d.querySelectorAll('#toast-root [data-act="toastAction"]')].map(b => b.textContent);
  ok(labels.join(',') === 'Desfazer,Corrigir', 'ações: Desfazer e Corrigir');
  click(w, '#toast-root [data-act="toastAction"][data-i="1"]'); await sleep(40);
  ok(/Editar lançamento/.test((d.querySelector('#tx-title') || {}).textContent || '') && /^350(,00)?$/.test(d.querySelector('#tx-amount').value), 'Corrigir abre o lançamento já preenchido para trocar o que precisar');
  click(w, '[data-act="closeSheet"]'); await sleep(20);
  // vários lançamentos: Desfazer e Ver (no extrato)
  M.Demo.assist = async () => { const mk = (v, n) => M.Demo._ins('txs', { type: 'out', amount: v, date: M.isoOf(new Date()), description: n, category_id: null, card_id: null, installments: 1, invest_kind: null }); const a = mk(20, 'Lanche'), b = mk(15, 'Uber'); return { handled: true, txs: [a, b], tx: b, reply: 'ok' }; };
  M.openTx(); await sleep(30);
  await M.asRun({ text: 'gastei 20 de lanche e 15 de uber' }, 'Lançando…'); await sleep(50);
  ok([...d.querySelectorAll('#toast-root [data-act="toastAction"]')].map(b => b.textContent).join(',') === 'Desfazer,Ver', 'vários lançamentos: Desfazer e Ver');
  click(w, '#toast-root [data-act="toastAction"][data-i="1"]'); await sleep(40);
  ok(S.page === 'txs', 'Ver leva ao extrato');

  // ---- na conversa do Assistente: Corrigir ao lado de Desfazer ----
  M.Demo.assist = async () => { const t = M.Demo._ins('txs', { type: 'in', amount: 30, date: M.isoOf(new Date()), description: 'Fábio', category_id: null, card_id: null, installments: 1, invest_kind: null }); return { handled: true, txs: [t], tx: t, reply: '💰 *Entrada* de *R$ 30,00*' }; };
  M.go('ai'); await sleep(30);
  await M.sendAI('fabio 30'); await sleep(30);
  const last = [...d.querySelectorAll('#chat .bubble')].pop();
  ok(last.querySelector('[data-act="asUndo"]') && last.querySelector('[data-act="editTx"]') && /Corrigir/.test(last.textContent), 'Assistente: Desfazer e Corrigir no lançamento');
  click(w, last.querySelector('[data-act="editTx"]')); await sleep(40);
  ok(/Editar lançamento/.test((d.querySelector('#tx-title') || {}).textContent || ''), 'Corrigir na conversa abre o lançamento');
  click(w, '[data-act="closeSheet"]'); await sleep(20);
  click(w, [...d.querySelectorAll('#chat .bubble')].pop().querySelector('[data-act="asUndo"]')); await sleep(60);
  const after = [...d.querySelectorAll('#chat .bubble')].pop();
  ok(/Desfeito/.test(after.textContent) && !after.querySelector('[data-act="editTx"]'), 'desfeito: some o Corrigir');

  // ---- microfone: dois toques abrem um microfone só; permissão negada e medidor travado (iPhone) não deixam nada ligado ----
  const env = { gum: 0, acs: [], stops: 0, deny: false, acState: 'running' };
  class FakeAC { constructor() { this.state = env.acState; env.acs.push(this); } createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData(b) { b.fill(0); } }; } createMediaStreamSource() { return { connect() { } }; } resume() { return Promise.resolve(); } close() { this.state = 'closed'; } }
  class FakeMR { constructor(s) { this.stream = s; this.state = 'inactive'; this.mimeType = 'audio/webm'; } static isTypeSupported() { return true; } start() { this.state = 'recording'; } stop() { this.state = 'inactive'; if (this.onstop) this.onstop(); } }
  w.AudioContext = FakeAC; w.MediaRecorder = FakeMR;
  Object.defineProperty(w.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => { env.gum++; return new Promise((res, rej) => setTimeout(() => env.deny ? rej(new Error('NotAllowedError')) : res({ getTracks: () => [{ stop: () => env.stops++ }] }), 30)); } } });
  M.go('home'); await sleep(20);
  M.openTx(); await sleep(30);
  const p1 = M.recStart('tx', () => { }), p2 = M.recStart('tx', () => { });
  await p1; await p2;
  ok(env.gum === 1 && env.acs.length === 1 && M.REC.mr && M.REC.vad && M.REC.vad.ac === env.acs[0], 'dois toques seguidos: um microfone só, medidor criado no toque');
  M.recStop(true); await sleep(10);
  ok(env.stops === 1 && env.acs[0].state === 'closed' && !M.REC.mr && !M.REC.vad, 'cancelar desliga o microfone e o medidor');
  env.deny = true;
  await M.recStart('tx', () => { });
  ok(env.acs.length === 2 && env.acs[1].state === 'closed' && !M.REC.mr && !M.REC.opening && /Libere o microfone/.test(d.querySelector('#toast-root').textContent), 'permissão negada: avisa e não deixa nada ligado');
  env.deny = false; env.acState = 'suspended';
  await M.recStart('tx', () => { });
  ok(M.REC.vad && /Pode falar/.test(d.querySelector('.sheet #as-row .rec small').textContent), 'gravando com o medidor ainda parado');
  M.REC.t0 = Date.now() - M.VAD.wake - 100; M.recTick();
  ok(!M.REC.vad && env.acs[2].state === 'closed' && d.querySelector('.sheet #as-row .lvl.idle') && /toque em enviar/.test(d.querySelector('.sheet #as-row .rec small').textContent), 'aparelho que não libera o medidor: fica o botão Enviar, sem "não estou ouvindo" por engano');
  M.recStop(true); await sleep(10);
  ok(!M.REC.mr && env.stops === 2, 'parou e desligou o microfone');
  click(w, '[data-act="closeSheet"]'); await sleep(20);
  w.close();
  done();
})().catch(e => { console.log('❌ exceção', e.stack || e.message); process.exit(1); });
