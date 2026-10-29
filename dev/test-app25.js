// Versão 2.5 (jsdom, modo demonstração): painel de clientes do dono — só aparece para master/admin, resumo e filtros,
// busca sem acento, liberar plano com confirmação e Desfazer, +7 dias, bloquear/desbloquear, cobrança no WhatsApp,
// texto do cliente escapado e erro com "Tentar de novo". A conta das datas é a mesma do servidor (UTC).
const { bootApp, click, type, sleep } = require('./jsdom-app');
const { checker } = require('./lib');
const { ok, done } = checker('versão 2.5 (painel de clientes)');

(async () => {
  const onError = m => ok(false, m);
  const w = await bootApp({ onError }), d = w.document, M = w.__mc, S = M.S, ADM = M.ADM;
  await sleep(50);
  const tile = f => d.querySelector(`.adm-stat[data-f="${f}"]`);
  const num = f => +(tile(f)?.querySelector('b')?.textContent ?? -1);
  const rows = () => [...d.querySelectorAll('#page .adm-row')];
  const rowOf = name => rows().find(r => r.querySelector('.tx-main b').textContent === name);
  const sheet = () => d.querySelector('.sheet');

  // ---- datas: a mesma conta do Postgres (mês a mais mantém o dia, ou o último dia do mês) ----
  ok(M.plusMonthsUTC(Date.UTC(2026, 0, 31, 12), 1).toISOString().startsWith('2026-02-28'), '31/01 + 1 mês = 28/02');
  ok(M.plusMonthsUTC(Date.UTC(2028, 1, 29, 12), 12).toISOString().startsWith('2029-02-28'), '29/02/2028 + 1 ano = 28/02/2029');
  const now = Date.now();
  const venc = { plan: 'trial', active: true, plan_expiry: new Date(now - 10 * 864e5).toISOString() };
  const a1 = M.admApply(venc, 'mensal', now);
  ok(a1.plan === 'active' && a1.active && Math.abs(Date.parse(a1.plan_expiry) - M.plusMonthsUTC(now, 1)) < 1000, 'vencido: o mês conta a partir de hoje');
  const ok7 = M.admApply({ plan: 'trial', active: true, plan_expiry: new Date(now + 3 * 864e5).toISOString() }, 'mais7', now);
  ok(ok7.plan === 'trial' && Math.round((Date.parse(ok7.plan_expiry) - now) / 864e5) === 10, '+7 dias soma na validade e mantém o plano');

  // ---- só o dono vê ----
  ok(!!d.querySelector('#side-nav [data-page="admin"]'), 'menu lateral: Clientes para o dono');
  M.go('more'); await sleep(20);
  ok(!!d.querySelector('#page .setrow[data-page="admin"]'), 'Menu do celular: Clientes para o dono');

  // ---- lista, resumo e filtros ----
  M.go('admin'); await sleep(60);
  ok(rows().length === 8, 'lista com os 8 clientes de exemplo (' + rows().length + ')');
  ok(num('all') === 8 && num('trial') === 3 && num('paid') === 2 && num('soon') === 2 && num('expired') === 2 && num('blocked') === 1,
    'resumo: 8 clientes, 3 em teste, 2 pagantes, 2 vencem em 7 dias, 2 vencidos, 1 bloqueado');
  ok(/Teste: 12 dias/.test(rowOf('Ana Souza').textContent) && /Vencido/.test(rowOf('Diego Rocha').textContent) && /Bloqueado/.test(rowOf('Gabi Torres').textContent)
    && /^Ativo até \d\d\/\d\d$/.test(rowOf('Elisa Prado').querySelector('.st').textContent), 'cada linha com a situação certa');
  ok(!!rowOf('hugo.mendes'), 'sem nome: mostra o começo do e-mail');
  ok(/18 lançamentos, último \d\d\/\d\d/.test(rowOf('Ana Souza').textContent) && /0 lançamentos/.test(rowOf('Fábio Nunes').textContent), 'quantos lançamentos e o último (nunca os valores)');
  click(w, tile('soon')); await sleep(20);
  ok(rows().map(r => r.querySelector('b').textContent).join(',') === 'Carla Dias,Bruno Lima' && tile('soon').getAttribute('aria-pressed') === 'true',
    'filtro "vencem em 7 dias": quem vence primeiro no topo');
  click(w, tile('all')); await sleep(20);
  type(w, '#adm-q', 'fabio'); await sleep(320);
  ok(rows().length === 1 && rows()[0].textContent.includes('Fábio Nunes') && d.querySelector('#adm-q').value === 'fabio', 'busca sem acento ("fabio" acha Fábio); o texto continua no campo');
  type(w, '#adm-q', ''); await sleep(320);

  // ---- liberar o plano anual para a Ana, com confirmação ----
  const anaBefore = ADM.list.find(u => u.name === 'Ana Souza').plan_expiry;
  click(w, rowOf('Ana Souza')); await sleep(30);
  ok(sheet() && /Ana Souza/.test(sheet().textContent) && /Teste grátis/.test(sheet().textContent) && /faltam 12 dias/.test(sheet().textContent), 'folha do cliente com plano e validade');
  const anualBtn = sheet().querySelector('[data-act="admAsk"][data-a="anual"]');
  const anualUntil = M.admApply(ADM.list.find(u => u.name === 'Ana Souza'), 'anual');
  const until = new Date(anualUntil.plan_expiry).toLocaleDateString('pt-BR');
  ok(anualBtn && anualBtn.textContent.includes('R$ 149,90') && anualBtn.textContent.includes(until), 'botão Anual mostra o preço e até quando fica (' + until + ')');
  ok(/Cobrar no WhatsApp/.test(sheet().textContent) && sheet().querySelector('a[href^="https://wa.me/5522999990001?text="]'), 'cobrar no WhatsApp com o número dela');
  const wa = decodeURIComponent(sheet().querySelector('a[href^="https://wa.me/"]').getAttribute('href'));
  ok(/Olá, Ana!/.test(wa) && /Mensal R\$ 14,90: https:\/\/pag\.ae\//.test(wa) && /Anual R\$ 149,90/.test(wa), 'mensagem de cobrança com os links de pagamento');
  click(w, anualBtn); await sleep(20);
  ok(/Liberar o plano Anual para Ana Souza\? O acesso fica liberado até/.test(sheet().textContent) && sheet().textContent.includes(until), 'confirma antes: plano, pessoa e data');
  ok(sheet().querySelector('[data-act="admDo"]').hasAttribute('data-autofocus'), 'Confirmar marcado para receber o foco (o foco de verdade é conferido no Chromium)');
  click(w, sheet().querySelector('[data-act="admBack"]')); await sleep(20);
  ok(!sheet().querySelector('.adm-confirm') && sheet().querySelector('[data-a="anual"]') && ADM.list.find(u => u.name === 'Ana Souza').plan === 'trial', 'Voltar não muda nada');
  click(w, sheet().querySelector('[data-a="anual"]')); await sleep(20);
  click(w, sheet().querySelector('[data-act="admDo"]')); await sleep(80);
  const t1 = d.querySelector('#toast-root').textContent;
  ok(!sheet() && /Plano Anual liberado para Ana Souza até/.test(t1) && t1.includes(until), 'liberado: aviso com a data (' + t1 + ')');
  ok(/Ativo até/.test(rowOf('Ana Souza').textContent) && num('paid') === 3 && num('trial') === 2, 'lista atualizada: Ana pagante');
  click(w, '#toast-root [data-act="toastAction"]'); await sleep(80);
  ok(ADM.list.find(u => u.name === 'Ana Souza').plan === 'trial' && ADM.list.find(u => u.name === 'Ana Souza').plan_expiry === anaBefore && /Teste: 12 dias/.test(rowOf('Ana Souza').textContent),
    'Desfazer no aviso volta exatamente ao que era');
  ok(/Ajuste desfeito/.test(d.querySelector('#toast-root').textContent), 'aviso do desfazer');

  // ---- bloquear e desbloquear ----
  click(w, rowOf('Bruno Lima')); await sleep(30);
  click(w, sheet().querySelector('[data-a="bloquear"]')); await sleep(20);
  ok(/A conta fica só leitura/.test(sheet().textContent) && sheet().querySelector('[data-act="admDo"]').classList.contains('danger'), 'bloquear explica o efeito e o botão é de perigo');
  click(w, sheet().querySelector('[data-act="admDo"]')); await sleep(80);
  ok(/Bloqueado/.test(rowOf('Bruno Lima').textContent) && num('blocked') === 2, 'Bruno bloqueado');
  click(w, rowOf('Gabi Torres')); await sleep(30);
  ok(!sheet().querySelector('[data-a="bloquear"]') && sheet().querySelector('[data-a="desbloquear"]'), 'conta bloqueada mostra Desbloquear');
  click(w, sheet().querySelector('[data-a="desbloquear"]')); await sleep(20);
  click(w, sheet().querySelector('[data-act="admDo"]')); await sleep(80);
  ok(!/Bloqueado/.test(rowOf('Gabi Torres').textContent), 'Gabi desbloqueada');
  // +7 dias para quem venceu (Fábio): conta a partir de hoje
  click(w, rowOf('Fábio Nunes')); await sleep(30);
  ok(!sheet().querySelector('a[href^="https://wa.me/"]'), 'sem WhatsApp cadastrado: sem botão de cobrança');
  click(w, sheet().querySelector('[data-a="mais7"]')); await sleep(20);
  click(w, sheet().querySelector('[data-act="admDo"]')); await sleep(80);
  ok(/Teste: 7 dias/.test(rowOf('Fábio Nunes').textContent), '+7 dias para quem venceu: 7 dias a partir de hoje');

  // ---- texto do cliente sempre escapado ----
  M.Demo.db.clients.push({ ...M.Demo.db.clients[0], id: 'x-1', name: '<img src=x onerror="window.__xss=1">', email: '"><b>e</b>@x.com' });
  click(w, '[data-act="admReload"]'); await sleep(80);
  ok(!d.querySelector('#page img') && !d.querySelector('#page .tx-main b b') && !w.__xss && rows().some(r => r.textContent.includes('<img src=x')), 'nome e e-mail com HTML aparecem como texto');
  click(w, rows().find(r => r.textContent.includes('<img src=x'))); await sleep(30);
  ok(!sheet().querySelector('img') && !w.__xss, 'folha do cliente também escapa');
  click(w, '[data-act="closeSheet"]'); await sleep(20);

  // ---- erro ao carregar: aviso e "Tentar de novo" ----
  const real = M.Demo.adminUsers;
  M.Demo.adminUsers = async () => { throw new Error('Failed to fetch'); };
  ADM.list = null; ADM.err = ''; M.go('admin'); await sleep(60);
  ok(/Não consegui carregar os clientes/.test(d.querySelector('#page').textContent) && /Sem conexão/.test(d.querySelector('#page').textContent) && d.querySelector('[data-act="admReload"]'), 'erro: explica e oferece "Tentar de novo"');
  M.Demo.adminUsers = real;
  click(w, '[data-act="admReload"]'); await sleep(80);
  ok(rows().length === 9, 'Tentar de novo carrega a lista');

  // ---- quem não é dono não vê ----
  S.profile.plan = 'trial'; M.go('home'); await sleep(20);
  ok(!d.querySelector('#side-nav [data-page="admin"]'), 'cliente comum: sem Clientes no menu');
  M.go('admin'); await sleep(20);
  ok(S.page === 'home', 'cliente comum que tenta abrir Clientes volta ao Início');
  M.go('more'); await sleep(20);
  ok(!d.querySelector('#page .setrow[data-page="admin"]'), 'Menu do celular sem Clientes');
  S.profile.plan = 'master';
  w.close();
  done();
})().catch(e => { console.log('❌ exceção', e.stack || e.message); process.exit(1); });
