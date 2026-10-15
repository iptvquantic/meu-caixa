// Versão 2.3.2 (jsdom, modo demonstração): "Lançar com IA" em destaque no Início e no Novo lançamento, tipo
// automático (entrada, saída, cartão ou investimento) com a aba como dica, câmera e foto descartada.
const { bootApp, click, type, sleep } = require('./jsdom-app');
const { checker } = require('./lib');
const { ok, done } = checker('versão 2.3.2 (Lançar com IA)');

(async () => {
  const onError = m => ok(false, m);
  // ---- Início no celular: cartão em destaque, logo abaixo do saldo ----
  let w = await bootApp({ touch: true, onError }), d = w.document, M = w.__mc, S = M.S;
  await sleep(50);
  const card = d.querySelector('#page .ai-card.home');
  ok(card && card.previousElementSibling && card.previousElementSibling.classList.contains('receipt'), 'Início: "Lançar com IA" logo abaixo do saldo');
  ok(card && ['homeCamera', 'homeMic', 'homeWrite'].every(a => card.querySelector(`[data-act="${a}"]`)) && card.querySelector('[data-act="homeCamera"]').classList.contains('primary'), 'Início: Tirar foto (em destaque), Falar e Escrever');
  ok(/Novo/.test(card.querySelector('h4').textContent) && card.querySelectorAll('.ai-kinds span').length === 4 && /descartada/.test(card.textContent), 'mostra "Novo", os 4 tipos que descobre e que a foto é descartada');
  // Tirar foto no celular: abre a câmera do próprio aparelho (campo com capture)
  let cam = 0; d.querySelector('#photo-cam').click = () => { cam++; };
  let pick = 0; d.querySelector('#photo-pick').click = () => { pick++; };
  click(w, '[data-act="homeCamera"]');
  ok(cam === 1 && M.PHOTO.where === 'tx' && d.querySelector('#photo-cam').getAttribute('capture') === 'environment', 'Tirar foto (celular): abre a câmera traseira do aparelho');
  // Escrever: abre o Novo lançamento com o teclado no campo do assistente
  click(w, '[data-act="homeWrite"]'); await sleep(60);
  ok(d.querySelector('.sheet #as-text[data-autofocus]') && !d.querySelector('#tx-amount[data-autofocus]'), 'Escrever: abre o Novo lançamento já no campo de escrever');
  click(w, '[data-act="asCamera"]'); click(w, '[data-act="asPhoto"]');
  ok(cam === 2 && pick === 1, 'na folha: Tirar foto (câmera) e Escolher foto (galeria)');
  click(w, '[data-act="closeSheet"]'); await sleep(20);
  // desligar em Ajustes esconde (sem apagar nada)
  M.go('settings'); await sleep(20);
  click(w, '[data-act="feature"][data-k="assist"]'); await sleep(20);
  M.go('home'); await sleep(20);
  ok(!d.querySelector('#page .ai-card') && S.profile.settings.features.assist === false, 'Lançar com IA desligado: some do Início');
  M.openTx(); await sleep(40);
  ok(!d.querySelector('.sheet .ai-card') && d.querySelector('#tx-amount'), '... e do Novo lançamento (fica o formulário)');
  click(w, '[data-act="closeSheet"]'); await sleep(20);
  M.go('settings'); await sleep(20);
  click(w, '[data-act="feature"][data-k="assist"]'); await sleep(20);
  M.go('home'); await sleep(20);
  ok(d.querySelector('#page .ai-card.home'), 'religado: volta');
  w.close();

  // ---- tipo automático na demonstração (o mesmo código do robô) e a aba como dica ----
  w = await bootApp({ desktop: true, onError }); d = w.document; M = w.__mc; S = M.S;
  await sleep(50);
  const sent = [], real = M.Demo.assist.bind(M.Demo);
  M.Demo.assist = async b => { sent.push({ text: b.text, hint: b.hint, image: !!b.image }); return real(b); };
  await M.api().addCat({ kind: 'in', name: 'Venda de IPTV', icon: 'i:tv', color: '#22c55e', legacy_key: 'iptv' });
  await M.startApp(); await sleep(30);
  const iptv = S.cats.find(c => c.name === 'Venda de IPTV');
  // o caso real: "iptv vanessa 30" com a aba Saída lembrada (não tocada) → entrada em Venda de IPTV
  M.openTx(); await sleep(40);
  M.tx().type = 'out';
  type(w, '#as-text', 'iptv vanessa 30'); click(w, '[data-act="asSend"]'); await sleep(700);
  let t = S.txs.find(x => x.amount === 30 && /vanessa/i.test(x.description));
  ok(t && t.type === 'in' && t.category_id === iptv.id, '"iptv vanessa 30" → entrada em Venda de IPTV: ' + JSON.stringify(t && { type: t.type, cat: t.category_id }));
  ok(sent[0] && sent[0].hint && sent[0].hint.type === 'out' && sent[0].hint.sure === false, 'manda a aba como dica (lembrada, não tocada)');
  ok(/Entrada de R\$\s?30,00 · Venda de IPTV/.test(d.querySelector('#toast-root').textContent), 'avisa: Entrada de R$ 30,00 · Venda de IPTV');
  // aba tocada vence as pistas; a palavra da frase vence a aba
  M.openTx(); await sleep(40);
  click(w, '[data-act="txType"][data-t="in"]');
  ok(JSON.stringify(M.asHint()) === JSON.stringify({ type: 'in', sure: true, pay: false }), 'aba tocada: dica certa ' + JSON.stringify(M.asHint()));
  type(w, '#as-text', 'xpto 41'); click(w, '[data-act="asSend"]'); await sleep(700);
  ok(S.txs.some(x => x.amount === 41 && x.type === 'in'), 'aba Entrada tocada + frase sem pista → entrada');
  M.openTx(); await sleep(40);
  click(w, '[data-act="txType"][data-t="in"]');
  type(w, '#as-text', 'paguei 42 xpto'); click(w, '[data-act="asSend"]'); await sleep(700);
  ok(S.txs.some(x => x.amount === 42 && x.type === 'out'), '"paguei" vence a aba Entrada');
  // cartão escolhido na tela
  M.openTx(); await sleep(40);
  click(w, `[data-act="txPay"][data-card="${S.cards[0].id}"]`);
  ok(M.asHint().type === 'card' && M.asHint().pay === true && M.asHint().card === S.cards[0].id, 'cartão tocado: vai na dica');
  type(w, '#as-text', 'farmácia 43'); click(w, '[data-act="asSend"]'); await sleep(700);
  ok(S.txs.some(x => x.amount === 43 && x.type === 'card' && x.card_id === S.cards[0].id), 'cartão escolhido → lançado no cartão');
  // foto: o aviso diz que a foto foi descartada; o "Novo" some depois do primeiro uso
  M.openTx(); await sleep(40);
  await M.asRun({ image: { mime: 'image/jpeg', data: 'QUJD' } }, 'Lendo o comprovante…'); await sleep(50);
  ok(/foto descartada/.test(d.querySelector('#toast-root').textContent) && sent.at(-1).image, 'foto lançada: avisa que a foto foi descartada');
  M.go('home'); await sleep(20);
  ok(!/Novo/.test(d.querySelector('#page .ai-card.home h4').textContent), '"Novo" some depois de usar');
  // sem internet: preenche o formulário com o mesmo tipo automático
  M.Demo.assist = async () => { throw new Error('Failed to fetch'); };
  M.openTx(); await sleep(40);
  M.tx().type = 'out';
  type(w, '#as-text', 'iptv joana 31'); click(w, '[data-act="asSend"]'); await sleep(50);
  ok(M.tx() && M.tx().type === 'in' && M.tx().category_id === iptv.id && d.querySelector('#tx-amount').value === '31,00', 'sem internet: o formulário vem como entrada em Venda de IPTV para conferir');
  click(w, '[data-act="closeSheet"]'); await sleep(20);
  // computador sem câmera acessível (jsdom): Tirar foto abre o seletor com câmera
  cam = 0; d.querySelector('#photo-cam').click = () => { cam++; };
  M.go('ai'); await sleep(20);
  click(w, '[data-act="aiCamera"]');
  ok(cam === 1 && M.PHOTO.where === 'ai', 'Assistente: Tirar foto vai para a conversa');
  w.close();
  done();
})().catch(e => { console.log('❌ exceção', e.stack || e.message); process.exit(1); });
