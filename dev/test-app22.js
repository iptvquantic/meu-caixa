// Versão 2.2 (jsdom, modo demonstração): Ajustes → robô do WhatsApp (conectar com código, conectado,
// desconectar), liga/desliga do recurso, robô fora do ar, formato do número e código vencido.
const { bootApp, click, sleep } = require('./jsdom-app');
const { checker } = require('./lib');
const { ok, done } = checker('versão 2.2 (WhatsApp no app)');

(async () => {
  const w = await bootApp({ onError: m => ok(false, m) });
  const d = w.document, M = w.__mc, S = M.S;
  const page = () => d.querySelector('#page').textContent;
  const toast = () => d.querySelector('#toast-root').textContent;
  await sleep(50);
  ok(S.waBot && S.waBot.configured === true, 'demonstração: robô aparece como disponível');

  // ---- conectar com código (demonstração) ----
  M.go('settings'); await sleep(20);
  ok(/Lançar pelo WhatsApp/.test(page()) && d.querySelector('[data-act="waStart"]'), 'Ajustes mostra "Conectar meu WhatsApp"');
  ok(d.querySelector('[data-act="feature"][data-k="whatsapp"]').checked, 'recurso "Robô do WhatsApp" vem ligado');
  click(w, '[data-act="waStart"]'); await sleep(30);
  const code = S.waCode && S.waCode.code;
  ok(/^\d{8}$/.test(code || ''), 'gera código de 8 dígitos');
  ok(page().includes(`MC ${code.slice(0, 4)} ${code.slice(4)}`), 'código aparece separado em 2 blocos');
  ok(d.querySelector('.wa-code').getAttribute('aria-label') === 'Código MC ' + code.split('').join(' '), 'leitor de tela soletra o código');
  click(w, '[data-act="waOpen"]'); await sleep(10);
  ok(/Na versão de verdade/.test(toast()), 'demonstração: "Abrir WhatsApp" explica o que faria');
  click(w, '[data-act="waCopy"]'); await sleep(10);
  ok(toast().includes('MC ' + code), 'copiar: sem área de transferência, mostra o código para copiar à mão');
  click(w, '[data-act="waCheck"]'); await sleep(30);
  ok(/Conectado ao número \+55 \(22\) 99999-0000/.test(page()) && /WhatsApp conectado/.test(toast()), 'Já enviei: conectado (número formatado)');
  ok(S.waCode === null && S.waTimer === null, 'para de conferir depois de conectar');
  ok(/saldo/.test(page()) && /desfazer/.test(page()), 'conectado: mostra o que dá para mandar');
  click(w, '[data-act="waUnlink"]'); await sleep(30);
  ok(S.wa === null && d.querySelector('[data-act="waStart"]') && /desconectado/.test(toast()), 'desconectar volta ao início');

  // ---- liga/desliga ----
  click(w, '[data-act="feature"][data-k="whatsapp"]'); await sleep(20);
  ok(!/Lançar pelo WhatsApp/.test(page()) && S.profile.settings.features.whatsapp === false, 'desligado: painel some e a preferência é salva');
  ok(/Robô do WhatsApp desligado/.test(toast()), 'avisa que desligou');
  click(w, '[data-act="feature"][data-k="whatsapp"]'); await sleep(20);
  ok(/Lançar pelo WhatsApp/.test(page()) && /Robô do WhatsApp ligado/.test(toast()), 'religado: painel volta');
  click(w, '[data-act="feature"][data-k="goals"]'); await sleep(20);
  ok(/Metas desligadas/.test(toast()), 'outros recursos continuam com o aviso certo');
  click(w, '[data-act="feature"][data-k="goals"]'); await sleep(20);

  // ---- robô fora do ar ----
  S.waBot = { configured: false, number: null }; M.render(); await sleep(10);
  ok(!/Lançar pelo WhatsApp/.test(page()), 'robô fora do ar: cliente não vê o painel');
  S.mode = 'live'; S.profile.plan = 'master'; M.render(); await sleep(10);
  ok(/só você, dono, vê este aviso/i.test(page()) && /ainda não está pronto/.test(page()), 'robô fora do ar: o dono vê o aviso');
  await sleep(30); M.render(); await sleep(10);
  ok(/Robô ativo na Meta/.test(page()) && !!w.document.querySelector('#page .wa-owner.ok'), 'dono: o app confere o robô na Meta e mostra o resultado');
  S.profile.plan = 'trial'; M.render(); await sleep(10);
  ok(!/Lançar pelo WhatsApp/.test(page()), '... e o cliente comum não');
  S.mode = 'demo';

  // ---- com o número do robô: links prontos ----
  S.waBot = { configured: true, number: '15550100000' };
  S.waCode = { code: '87654321', expires_at: new Date(Date.now() + 60000).toISOString() }; M.render(); await sleep(10);
  const a = d.querySelector('#page a[href^="https://wa.me/"]');
  ok(a && a.href === 'https://wa.me/15550100000?text=MC%2087654321' && a.target === '_blank' && a.rel.includes('noopener'), 'Abrir WhatsApp leva o código escrito para o número do robô');
  for (const [phone, shown] of [['5522991053813', '+55 (22) 99105-3813'], ['552291053813', '+55 (22) 9105-3813'], ['15550100000', '+15550100000']]) {
    S.wa = { phone }; S.waCode = null; M.render(); await sleep(5);
    ok(page().includes('Conectado ao número ' + shown), `número ${phone} aparece como ${shown}`);
  }
  ok(d.querySelector('#page a[href="https://wa.me/15550100000"]'), 'conectado: atalho para abrir a conversa com o robô');
  S.wa = { phone: '<img src=x onerror=alert(1)>' }; M.render(); await sleep(5);
  ok(!d.querySelector('#page img[src="x"]'), 'número estranho não vira HTML');

  // ---- código vence sozinho ----
  S.wa = null; S.waBot = { configured: true, number: null }; M.render(); await sleep(5);
  click(w, '[data-act="waStart"]'); await sleep(20);
  S.waCode.expires_at = new Date(Date.now() - 1000).toISOString();
  await sleep(4300);
  ok(S.waCode === null && d.querySelector('[data-act="waStart"]') && /O código venceu/.test(toast()), 'código vencido: volta ao botão e avisa');
  done();
})().catch(e => { console.log('❌ exceção', e.message); process.exit(1); });
