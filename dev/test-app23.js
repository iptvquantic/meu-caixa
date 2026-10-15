// Versão 2.3 (jsdom, modo demonstração): lançamento sem abrir o teclado no celular, menu lateral encolhível,
// tema Automático, resumo do mês novo, "Deixe o caixa no automático", relatórios e avisos do dono com links.
const { bootApp, click, sleep } = require('./jsdom-app');
const { checker } = require('./lib');
const { ok, done } = checker('versão 2.3');

(async () => {
  const onError = m => ok(false, m);
  // ---- celular: o valor não ganha foco sozinho; cursor piscando no R$ ----
  let w = await bootApp({ touch: true, onError }), d = w.document, M = w.__mc, S = M.S;
  await sleep(50);
  M.openTx(); await sleep(60);
  const amt = d.querySelector('#tx-amount');
  ok(amt && !amt.hasAttribute('data-autofocus'), 'celular: o campo do valor não abre o teclado sozinho');
  ok(!!d.querySelector('#tx-amount-wrap .caret[aria-hidden="true"]'), 'celular: cursor piscando no R$ (decorativo)');
  ok(amt.closest('label.amount') !== null, 'tocar em qualquer lugar do R$ foca o valor (é um rótulo do campo)');
  w.close();

  // ---- PC: foco direto no valor; menu lateral encolhível e salvo ----
  w = await bootApp({ desktop: true, onError }); d = w.document; M = w.__mc; S = M.S;
  await sleep(50);
  M.openTx(); await sleep(60);
  ok(d.querySelector('#tx-amount').hasAttribute('data-autofocus'), 'PC: o valor já vem com o foco (dá para digitar direto)');
  click(w, '[data-act="closeSheet"]'); await sleep(20);
  const app = d.querySelector('#app'), tg = d.querySelector('#side-toggle');
  ok(!app.classList.contains('mini') && tg.getAttribute('aria-expanded') === 'true' && /Recolher/.test(tg.getAttribute('aria-label')), 'menu começa aberto no PC largo');
  click(w, '#side-toggle'); await sleep(10);
  ok(app.classList.contains('mini') && JSON.parse(w.localStorage.getItem('mc_side')) === 'mini' && tg.getAttribute('aria-expanded') === 'false', 'encolher: vira coluna de ícones e fica salvo');
  ok([...d.querySelectorAll('#side-nav button')].every(b => b.dataset.tip && b.querySelector('span').textContent === b.dataset.tip), 'cada ícone tem o nome (dica e leitor de tela)');
  click(w, '#side-toggle'); await sleep(10);
  ok(!app.classList.contains('mini') && JSON.parse(w.localStorage.getItem('mc_side')) === 'full', 'expandir: tudo volta ao normal');
  w.close();
  w = await bootApp({ desktop: true, wide: false, onError }); await sleep(50);
  ok(w.document.querySelector('#app').classList.contains('mini'), 'PC estreito (< 1100 px) sem escolha salva: começa encolhido');
  w.close();
  w = await bootApp({ desktop: true, wide: false, storage: { mc_side: 'full' }, onError }); await sleep(50);
  ok(!w.document.querySelector('#app').classList.contains('mini'), '... mas respeita a escolha salva');
  w.close();

  // ---- tema Automático ----
  w = await bootApp({ desktop: true, dark: false, onError }); d = w.document; M = w.__mc; S = M.S;
  await sleep(50);
  M.go('settings'); await sleep(20);
  ok(d.querySelectorAll('.themes .theme-opt').length === 4 && d.querySelector('[data-act="theme"][data-t="auto"]'), 'Aparência: Automático, Escuro, Claro e Cyber');
  click(w, '[data-act="theme"][data-t="auto"]'); await sleep(20);
  ok(d.documentElement.getAttribute('data-mc-theme') === 'light' && S.profile.settings.theme === 'auto', 'Automático com aparelho no claro: fica claro (e salva "automático")');
  ok(/igual ao celular ou computador/.test(d.querySelector('#page').textContent), 'explica o Automático');
  w.close();
  w = await bootApp({ desktop: true, dark: true, storage: { mc_theme_v2: 'auto' }, onError }); await sleep(50);
  ok(w.document.documentElement.getAttribute('data-mc-theme') === 'dark', 'Automático com aparelho no escuro: fica escuro');
  w.close();

  // ---- resumo do mês ----
  w = await bootApp({ desktop: true, onError }); d = w.document; M = w.__mc; S = M.S;
  await sleep(50);
  const R = M.insightItems(S.month);
  ok(R.head && /^(Sobraram|Saiu|R\$)/.test(R.head.text) && R.items.length >= 3, 'resumo: resultado do mês + pontos: ' + R.head?.text);
  ok(R.items.every(i => i.icon && i.tone && i.html && i.text && !/<script/i.test(i.html)), 'cada ponto com ícone, cor e texto');
  ok(!M.insights(S.month).some(t => /\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b(?!\w)/.test(t)), 'meses por extenso (sem "set", "out")');
  const home = d.querySelector('#page');
  ok(home.querySelector('.sum-head') && home.querySelectorAll('.ins-row').length <= 4, 'Início: resumo com até 4 pontos');
  // comparação justa: até o mesmo dia do mês anterior
  const W = M.compareWindow(S.month);
  ok(W.isCur && W.day === new w.Date().getDate(), 'mês atual: compara até hoje');
  // nomes do usuário escapados
  S.cats[0].name = '<img src=x onerror=alert(1)>'; M.render(); await sleep(10);
  ok(!home.querySelector('img'), 'nome de categoria com HTML não vira HTML no resumo');
  w.close();

  // ---- Deixe o caixa no automático ----
  w = await bootApp({ desktop: true, onError }); d = w.document; M = w.__mc; S = M.S;
  await sleep(50);
  S.recs = []; S.goals = []; S.cards = []; S.wa = null; S.waBot = { configured: true, number: '15550100000' }; M.render(); await sleep(10);
  let steps = M.autoSteps();
  ok(steps.length >= 4 && steps.every(x => !x.done), 'sem nada configurado: passos pendentes (WhatsApp, contas, cartão, meta)');
  const panel = [...d.querySelectorAll('.panel')].find(p => /Deixe o caixa no automático/.test(p.textContent));
  ok(panel && /0 de \d+ prontos/.test(panel.textContent) && panel.querySelectorAll('.todo').length === 3, 'mostra o progresso e os 3 próximos passos');
  ok(panel.querySelector('[data-act="go"][data-page="settings"]') && panel.querySelector('[data-act="recEdit"]'), 'cada passo tem o botão que leva ao lugar certo');
  S.wa = { phone: '5522999990000' }; M.render(); await sleep(10);
  ok(/1 de \d+ prontos/.test(d.querySelector('#page').textContent) && d.querySelector('.todo-done'), 'passo feito aparece como pronto');
  click(w, '[data-act="autoHide"]'); await sleep(20);
  ok(!/Deixe o caixa no automático/.test(d.querySelector('#page').textContent) && S.profile.settings.features.steps === false, 'Ocultar some com o cartão (e salva)');
  M.go('settings'); await sleep(10);
  ok(!d.querySelector('[data-act="feature"][data-k="steps"]').checked, 'dá para ligar de novo em Ajustes → Recursos');
  w.close();

  // ---- relatórios ----
  w = await bootApp({ desktop: true, onError }); d = w.document; M = w.__mc; S = M.S;
  await sleep(50);
  M.go('reports'); await sleep(30);
  const rep = d.querySelector('#page');
  ok(rep.querySelector('.stats.five .stat.total'), 'números do mês: saldo como linha de total');
  ok(rep.querySelectorAll('.stat .delta').length >= 2, 'setas de comparação com o mês anterior');
  ok(/mesmo período de/.test(rep.textContent), 'explica que compara o mesmo período');
  const rows = rep.querySelectorAll('.mtable tbody tr');
  ok(rows.length >= 2 && rep.querySelector('.mtable tr.cur'), 'tabela dos meses com o mês atual destacado');
  const prevBtn = rep.querySelector('.mtable tbody tr:first-child [data-act="goMonth"]'), target = prevBtn.dataset.mk;
  click(w, prevBtn); await sleep(30);
  ok(S.month === target && S.page === 'reports', 'tocar no mês da tabela abre aquele mês');
  ok(/Análise do mês/.test(rep.textContent) && rep.querySelector('.ins-row'), 'análise do mês com os pontos');
  w.close();

  // ---- contas fixas, metas e cartão no saldo ----
  w = await bootApp({ desktop: true, onError }); d = w.document; M = w.__mc; S = M.S;
  await sleep(50);
  M.go('bills'); await sleep(20);
  ok(d.querySelector('#page .split .progress'), 'contas fixas: quanto já foi pago/recebido do mês');
  M.go('goals'); await sleep(20);
  ok(/por dia\)/.test(d.querySelector('#page').textContent), 'metas do mês: quanto dá por dia até o fim do mês');
  M.go('settings'); await sleep(20);
  ok(/Exemplo: TV de R\$ 1\.200 em 3x/.test(d.querySelector('#page').textContent), 'cartão no saldo: explicação com exemplo');

  // ---- aviso do dono: links só da Meta e do Supabase ----
  S.mode = 'live'; S.profile.plan = 'master'; S.fromCache = false; S.offline = false;
  S.waBot = { configured: false }; S.waSetup = { ok: false, message: 'A chave secreta salva não é a do app.', fix: { meta: 'https://developers.facebook.com/apps/1/settings/basic/', secrets: 'https://supabase.com/dashboard/project/abc/functions/secrets' } };
  M.render(); await sleep(10);
  const fixes = [...d.querySelectorAll('.wa-fix a')].map(a => a.getAttribute('href'));
  ok(fixes.length === 2 && fixes[0].startsWith('https://developers.facebook.com/') && fixes[1].startsWith('https://supabase.com/dashboard/'), 'aviso do dono: links diretos para corrigir');
  S.waSetup = { ok: false, message: 'x', fix: { meta: 'javascript:alert(1)', secrets: 'https://evil.example/' } }; M.render(); await sleep(10);
  ok(!d.querySelector('.wa-fix'), 'link que não é da Meta/Supabase não aparece');
  // número do atendimento: link do Gestor do WhatsApp, lista dos números e ativação com PIN
  S.waBot = { configured: true, ready: false, number: '5522988887777' };
  S.waSetup = { ok: true, attention: true, message: 'Falta ativar o número.', register: { id: '8801', number: '5522988887777' },
    numbers: [{ id: '7037', number: '5522991053813', name: 'Quantic Play', state: 'seu atendimento (fica no celular)', robot: false }, { id: '8801', number: '5522988887777', name: 'Meu Caixa', state: 'aguardando ativação', robot: true }],
    fix: { meta: 'https://business.facebook.com/latest/whatsapp_manager/phone_numbers?business_id=3688&asset_id=7385', metaLabel: 'Abrir o Gestor do WhatsApp' } };
  M.render(); await sleep(10);
  const fixA = d.querySelector('.wa-fix a');
  ok(fixA && fixA.getAttribute('href').startsWith('https://business.facebook.com/latest/whatsapp_manager/') && fixA.textContent === 'Abrir o Gestor do WhatsApp', 'link do Gestor do WhatsApp com o nome certo');
  const lis = [...d.querySelectorAll('.wa-nums li')].map(li => li.textContent);
  ok(lis.length === 2 && /\+55 \(22\) 99105-3813/.test(lis[0]) && /seu atendimento/.test(lis[0]) && /robô/.test(lis[1]), 'lista os números da conta com o estado');
  ok(d.querySelector('#wa-pin') && d.querySelector('[data-act="waRegister"][data-id="8801"]'), 'pede o PIN para ativar o número');
  ok(/os clientes não veem este painel/.test(d.querySelector('.wa-owner').textContent), 'avisa que os clientes ainda não veem o robô');
  let sentSetup = null;
  M.Demo.waSetup = async (b) => { sentSetup = b; return { ok: true, ready: true, number: '5522988887777', message: 'Número ativado. Robô pronto.' }; };
  d.querySelector('#wa-pin').value = '12'; click(w, '[data-act="waRegister"]'); await sleep(10);
  ok(!sentSetup, 'PIN incompleto não vai para a função');
  d.querySelector('#wa-pin').value = '123456'; click(w, '[data-act="waRegister"]'); await sleep(30);
  ok(sentSetup && sentSetup.action === 'register' && sentSetup.phone === '8801' && sentSetup.pin === '123456', 'PIN vai para a função com o número');
  ok(S.waBot.ready === true && /Robô pronto/.test(d.querySelector('.wa-owner').textContent), 'depois de ativar: robô pronto');
  // cliente comum: robô fora do ar = nenhum painel do WhatsApp (nada de código que não chega)
  S.profile.plan = 'trial'; S.waBot = { configured: true, ready: false, number: '5522988887777' }; S.wa = null; M.render(); await sleep(10);
  ok(!/Lançar pelo WhatsApp/.test(d.querySelector('#page').textContent) && !M.waUsable(), 'cliente: robô não pronto, painel some');
  S.waBot = { configured: true, ready: true, number: '5522988887777' }; M.render(); await sleep(10);
  ok(/Lançar pelo WhatsApp/.test(d.querySelector('#page').textContent) && d.querySelector('[data-act="waStart"]'), 'cliente: robô pronto, aparece o Conectar');
  S.waBot = { configured: true, number: '5522988887777' }; ok(M.waUsable(), 'função antiga (sem "ready"): continua como antes');
  S.mode = 'demo';
  w.close();

  // ---- Assistente: lança como o robô, desfaz, e pergunta livre vai ao Conselheiro ----
  w = await bootApp({ desktop: true, onError }); d = w.document; M = w.__mc; S = M.S;
  await sleep(50);
  M.go('ai'); await sleep(20);
  ok(d.querySelector('#ai-in') && d.querySelector('[data-act="aiMic"]') && d.querySelector('[data-act="aiPhoto"]') && d.querySelector('#ai-file[accept="image/*"]'), 'Assistente: escrever, falar e mandar foto');
  ok(/Assistente/.test(d.querySelector('#page h2').textContent), 'Conselheiro virou Assistente');
  const n0 = S.txs.length;
  await M.sendAI('mercado 47,30'); await sleep(20);
  const merc = S.txs.find(t => t.amount === 47.3);
  ok(S.txs.length === n0 + 1 && merc && merc.type === 'out', 'Assistente: "mercado 47,30" lançado');
  const last = [...d.querySelectorAll('#chat .bubble')].pop();
  ok(/Saída/.test(last.textContent) && last.querySelector('b') && last.querySelector('[data-act="asUndo"]'), 'resposta no formato do robô com Desfazer');
  click(w, last.querySelector('[data-act="asUndo"]')); await sleep(30);
  ok(!S.txs.some(t => t.id === merc.id) && /Desfeito/.test([...d.querySelectorAll('#chat .bubble')].pop().textContent), 'Desfazer apaga e marca a mensagem');
  await M.sendAI('mercado 12'); await sleep(20);
  const m12 = S.txs.find(t => t.amount === 12 && t.type === 'out');
  await M.sendAI('desfazer'); await sleep(30);
  ok(m12 && !S.txs.some(t => t.id === m12.id), '"desfazer" escrito apaga o último lançamento do assistente');
  const before = S.txs.length;
  await M.sendAI('Onde posso economizar?'); await sleep(20);
  ok(S.txs.length === before && /maiores gastos|Ainda não há saídas/.test([...d.querySelectorAll('#chat .bubble')].pop().textContent), 'pergunta livre: o Conselheiro responde, sem lançar');
  await M.aiRun({ image: { mime: 'image/jpeg', data: 'QUJD' } }, '📷 Foto do comprovante'); await sleep(20);
  ok(S.txs.some(t => t.description === 'Drogasil') && /Li o comprovante/.test([...d.querySelectorAll('#chat .bubble')].pop().textContent), 'foto do comprovante na conversa');
  await M.aiRun({ audio: { mime: 'audio/webm', data: 'QUJD' } }, '🎙️ Áudio'); await sleep(20);
  const bubbles = [...d.querySelectorAll('#chat .bubble.me')];
  ok(/🎙️ “mercado 52,90”/.test(bubbles.pop().textContent), 'áudio: mostra o que entendeu');
  ok(M.waLite('<img src=x onerror=alert(1)> *ok* _ui_') === '&lt;img src=x onerror=alert(1)&gt; <b>ok</b> <i>ui</i>', 'texto do robô é escapado (sem HTML de fora)');
  w.close();
  done();
})().catch(e => { console.log('❌ exceção', e.stack || e.message); process.exit(1); });
