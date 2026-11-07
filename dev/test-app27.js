// Versão 2.7 (jsdom, modo demonstração): link de nova senha no painel de clientes (o e-mail padrão do Supabase não
// chega a clientes, então o dono manda o link pelo WhatsApp) e a configuração do cadastro pela função "conta".
const { bootApp, click, sleep } = require('./jsdom-app');
const { checker } = require('./lib');
const { ok, done } = checker('versão 2.7 (cadastro sem e-mail e link de nova senha)');

(async () => {
  const w = await bootApp({ onError: m => ok(false, m) }), d = w.document, M = w.__mc;
  await sleep(50);
  ok(w.MC_CONFIG.accountFunction === 'conta', 'cadastro pela função "conta" (a conta nasce confirmada)');
  ok(!!d.querySelector('#auth-wa') && d.querySelector('#auth-wa').hidden, 'tela de entrada: botão do WhatsApp escondido até precisar');

  M.go('admin'); await sleep(250);
  const open = async name => { const row = [...d.querySelectorAll('#page .adm-row')].find(r => r.textContent.includes(name)); click(w, row); await sleep(120); };
  await open('Ana Souza');
  const btn = d.querySelector('.sheet [data-act="admLink"]');
  ok(btn && /Link de nova senha/.test(btn.textContent), 'ficha do cliente: botão "Link de nova senha"');
  click(w, btn); await sleep(40);
  ok(d.querySelector('.sheet [data-act="admLink"]')?.disabled && /Gerando/.test(d.querySelector('.sheet [data-act="admLink"]').textContent), 'enquanto gera: botão desligado ("Gerando o link…")');
  await sleep(300);
  const box = d.querySelector('.sheet .adm-link');
  const wa = box && box.querySelector('a[href^="https://wa.me/"]');
  ok(box && /Link de nova senha/.test(box.textContent) && /Ana Souza/.test(box.textContent), 'o link aparece na ficha, com o nome da cliente');
  const text = wa ? decodeURIComponent(wa.href.split('?text=')[1]) : '';
  ok(wa && wa.href.startsWith('https://wa.me/5522999990001?text=') && /^Olá, Ana! /.test(text) && text.includes('https://exemplo.invalid/nova-senha#demonstracao') && /vence em pouco tempo/.test(text), 'Enviar no WhatsApp: mensagem pronta para a cliente, com o link: ' + text);
  ok(box.querySelector('#adm-link-url').value === 'https://exemplo.invalid/nova-senha#demonstracao' && box.querySelector('#adm-link-url').readOnly, 'o link também fica num campo só de leitura');
  ok(!d.querySelector('.sheet [data-act="admLink"]'), 'com o link na tela, o botão de gerar some');
  click(w, '.sheet [data-act="admCopyLink"]'); await sleep(60);
  ok(/link/i.test(d.querySelector('#toast-root').textContent), 'Copiar: avisa (ou seleciona o link quando o navegador não deixa copiar)');
  M.ACT.closeSheet(); await sleep(60);

  // cliente sem WhatsApp: só Copiar (como principal)
  await open('Carla Dias');
  click(w, '.sheet [data-act="admLink"]'); await sleep(400);
  const box2 = d.querySelector('.sheet .adm-link');
  ok(box2 && !box2.querySelector('a[href^="https://wa.me/"]') && box2.querySelector('[data-act="admCopyLink"]').classList.contains('primary'), 'sem WhatsApp do cliente: Copiar vira o botão principal');
  M.ACT.closeSheet(); await sleep(60);
  // reabrir a ficha começa sem link
  await open('Carla Dias');
  ok(!d.querySelector('.sheet .adm-link') && !!d.querySelector('.sheet [data-act="admLink"]'), 'reabrir a ficha: o link antigo não fica');
  M.ACT.closeSheet(); await sleep(60);

  // falha ao gerar: avisa e volta o botão
  const A = M.api(), keep = A.recoveryLink;
  A.recoveryLink = async () => { const e = new Error('Só o dono gera o link de nova senha.'); e.status = 403; throw e; };
  await open('Bruno Lima');
  click(w, '.sheet [data-act="admLink"]'); await sleep(120);
  ok(/só sai para conta de cliente/.test(d.querySelector('#toast-root').textContent) && !!d.querySelector('.sheet [data-act="admLink"]:not([disabled])'), 'erro: avisa e o botão volta');
  A.recoveryLink = keep;
  M.ACT.closeSheet(); await sleep(60);
  done();
})().catch(e => { ok(false, 'erro: ' + (e.stack || e)); done(); });
