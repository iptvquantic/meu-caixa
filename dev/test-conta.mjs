// Função "conta" (cadastro sem depender de e-mail e link de nova senha), com o Supabase simulado.
// Rodar: node --experimental-strip-types --no-warnings test-conta.mjs
import { clientIp, cors, handle, strongPass } from './supabase/functions/conta/handler.ts';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('❌ ' + m); } };

const ORIGIN = 'https://iptvquantic.github.io';
const OWNER = 'a0000000-0000-4000-8000-000000000001', ANA = 'a0000000-0000-4000-8000-000000000002', DUDA = 'a0000000-0000-4000-8000-000000000003';
function deps(o = {}) {
  const st = { users: new Set(['ja@teste.local']), attempts: [], logs: [], links: [], signup: true, allowFail: false, ...o };
  const profiles = { [OWNER]: { plan: 'master', email: 'dono@teste.local' }, [ANA]: { plan: 'trial', email: 'ana@teste.local' }, [DUDA]: { plan: 'admin', email: 'duda@teste.local' } };
  const d = {
    cfg: { allowed: [ORIGIN], appUrl: 'https://iptvquantic.github.io/meu-caixa/app.html' },
    settings: async () => { if (st.settingsDown) throw new Error('fora'); return { signup: st.signup }; },
    adminOk: async () => { if (st.adminDown) throw new Error('401'); return !st.badKey; },
    hash: async (s) => 'h:' + s.length + ':' + s.replace(/[^a-z0-9]/gi, '').slice(-12).padStart(40, '0'),
    allow: async (h) => { if (st.allowFail) throw new Error('rpc fora'); st.attempts.push(h); return st.attempts.filter((x) => x === h).length <= 5; },
    createUser: async (email) => { if (st.users.has(email)) throw new Error('A user with this email address has already been registered'); if (st.createFail) throw new Error('gotrue 500'); st.users.add(email); },
    userOf: async (jwt) => ({ 'tok-dono': OWNER, 'tok-ana': ANA, 'tok-duda': DUDA }[jwt] ?? null),
    profileOf: async (uid) => profiles[uid] ?? null,
    recoveryLink: async (email, to) => { st.links.push({ email, to }); return `https://projeto.supabase.co/auth/v1/verify?token=abc&type=recovery&redirect_to=${encodeURIComponent(to)}`; },
    log: (m, x) => st.logs.push(m + ' ' + (x === undefined ? '' : JSON.stringify(x))),
  };
  return { d, st };
}
const req = (body, h = {}) => new Request('https://projeto.supabase.co/functions/v1/conta', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': '200.1.2.3, 10.0.0.1', ...h }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const call = async (d, body, h) => { const r = await handle(req(body, h), d); return { status: r.status, j: await r.json().catch(() => ({})), r }; };

// ---------- regras ----------
ok(strongPass('senha123') && !strongPass('12345678') && !strongPass('abcdefgh') && !strongPass('a1') && strongPass('ação1234') && !strongPass('a1'.repeat(40)), 'senha: 8+ com letras e números, até 72 (a mesma regra do app)');
ok(clientIp(req({})) === '200.1.2.3' && clientIp(new Request('https://x', { headers: {} })) === 'desconhecido', 'endereço: o primeiro do x-forwarded-for');
ok(cors(ORIGIN, [ORIGIN])['Access-Control-Allow-Origin'] === ORIGIN && cors('https://malicioso.example', [ORIGIN])['Access-Control-Allow-Origin'] === ORIGIN, 'CORS: só o site do Meu Caixa');

// ---------- saúde e métodos ----------
{
  const { d, st } = deps();
  let r = await handle(new Request('https://x/functions/v1/conta?health=1', { headers: { origin: ORIGIN } }), d);
  let j = await r.json();
  ok(r.status === 200 && j.ok === true && j.signup === true && j.admin === true, 'saúde: configuração pública do login (cadastro aberto) e a chave de serviço abre a administração');
  st.badKey = true;
  r = await handle(new Request('https://x/functions/v1/conta?health=1'), d); j = await r.json();
  ok(j.ok === false && j.admin === false && j.signup === true, 'saúde: chave de serviço recusada aparece como ok=false (o monitor avisa)');
  st.badKey = false;
  st.settingsDown = true;
  r = await handle(new Request('https://x/functions/v1/conta?health=1'), d); j = await r.json();
  ok(j.ok === false && j.signup === null, 'saúde: login fora do ar aparece como ok=false');
  r = await handle(new Request('https://x/functions/v1/conta', { method: 'OPTIONS', headers: { origin: ORIGIN } }), d);
  ok(r.status === 200 && r.headers.get('access-control-allow-methods').includes('POST'), 'OPTIONS (pré-voo do navegador)');
  r = await handle(new Request('https://x/functions/v1/conta', { method: 'GET' }), d);
  ok(r.status === 405, 'GET sem saúde: 405');
  const x = await call(d, 'não é json');
  ok(x.status === 400 && /inválido/.test(x.j.error), 'corpo inválido: 400');
  ok((await call(d, { acao: 'apagar' })).status === 400, 'ação desconhecida: 400');
}

// ---------- criar conta ----------
{
  const { d, st } = deps();
  let x = await call(d, { acao: 'criar', email: '  Nova@Teste.Local ', senha: 'senha123' });
  ok(x.status === 200 && x.j.ok && st.users.has('nova@teste.local'), 'conta criada já confirmada (e-mail em minúsculas, sem espaços)');
  ok(st.attempts.length === 1 && !st.attempts[0].includes('200.1.2.3') && st.logs.some((l) => /conta criada/.test(l)) && !st.logs.join(' ').includes('nova@teste') && !st.logs.join(' ').includes('senha123'), 'tentativa anotada só como código; nem e-mail nem senha no registro');
  x = await call(d, { acao: 'criar', email: 'ja@teste.local', senha: 'senha123' });
  ok(x.status === 409 && x.j.reason === 'exists' && /Entrar/.test(x.j.error), 'e-mail que já tem conta: 409, "Use Entrar"');
  x = await call(d, { acao: 'criar', email: 'sem-arroba', senha: 'senha123' });
  ok(x.status === 400 && x.j.reason === 'email', 'e-mail inválido: 400');
  x = await call(d, { acao: 'criar', email: 'b@teste.local', senha: '12345678' });
  ok(x.status === 400 && x.j.reason === 'weak', 'senha fraca: 400');
  const n0 = st.attempts.length;
  ok(n0 === 2, 'e-mail ou senha inválidos não gastam tentativa');
  for (let i = 0; i < 4; i++) await call(d, { acao: 'criar', email: `c${i}@teste.local`, senha: 'senha123' });
  x = await call(d, { acao: 'criar', email: 'c9@teste.local', senha: 'senha123' });
  ok(x.status === 429 && x.j.reason === 'limit' && !st.users.has('c9@teste.local'), 'passou do limite do endereço: 429 e a conta não é criada');
  x = await call(d, { acao: 'criar', email: 'outro@teste.local', senha: 'senha123' }, { 'x-forwarded-for': '177.9.9.9' });
  ok(x.status === 200, 'outro endereço continua podendo');
}
{
  const { d, st } = deps({ signup: false });
  const x = await call(d, { acao: 'criar', email: 'n@teste.local', senha: 'senha123' });
  ok(x.status === 403 && x.j.reason === 'closed' && !st.users.has('n@teste.local') && st.attempts.length === 0, 'cadastro fechado no Supabase: a função também recusa');
}
{
  const { d, st } = deps({ allowFail: true });
  let x = await call(d, { acao: 'criar', email: 'n@teste.local', senha: 'senha123' });
  ok(x.status === 503 && !st.users.has('n@teste.local'), 'limite fora do ar: não cria (falha fechada)');
  st.allowFail = false; st.createFail = true;
  x = await call(d, { acao: 'criar', email: 'n@teste.local', senha: 'senha123' });
  ok(x.status === 502 && /instantes/.test(x.j.error) && !/gotrue/.test(x.j.error), 'erro do login: mensagem simples, detalhe só no registro');
}

// ---------- link de nova senha (só o dono) ----------
{
  const { d, st } = deps();
  let x = await call(d, { acao: 'link', usuario: ANA });
  ok(x.status === 401, 'sem login: 401');
  x = await call(d, { acao: 'link', usuario: ANA }, { authorization: 'Bearer tok-ana' });
  ok(x.status === 403 && st.links.length === 0, 'cliente comum não gera link (nem o dela)');
  x = await call(d, { acao: 'link', usuario: 'nao-e-uuid' }, { authorization: 'Bearer tok-dono' });
  ok(x.status === 400, 'cliente inválido: 400');
  x = await call(d, { acao: 'link', usuario: 'a0000000-0000-4000-8000-0000000000ff' }, { authorization: 'Bearer tok-dono' });
  ok(x.status === 404, 'cliente que não existe: 404');
  x = await call(d, { acao: 'link', usuario: DUDA }, { authorization: 'Bearer tok-dono' });
  ok(x.status === 403 && st.links.length === 0, 'conta de administrador não recebe link pelo painel');
  x = await call(d, { acao: 'link', usuario: ANA }, { authorization: 'Bearer tok-dono' });
  ok(x.status === 200 && /type=recovery/.test(x.j.link) && st.links[0].email === 'ana@teste.local' && st.links[0].to === 'https://iptvquantic.github.io/meu-caixa/app.html', 'dono: link de nova senha da cliente, voltando para o app');
  ok(st.logs.some((l) => l.includes('link de nova senha gerado') && l.includes(OWNER) && l.includes(ANA)) && !st.logs.join(' ').includes('ana@teste'), 'registro: quem gerou e para quem (pelo id, sem e-mail)');
  x = await call(d, { acao: 'link', usuario: ANA }, { authorization: 'Bearer tok-duda' });
  ok(x.status === 200, 'admin também gera');
}

console.log(fail ? `❌ função conta: ${pass} ok, ${fail} falha(s)` : `✅ função conta: ${pass} ok, 0 falha(s)`);
if (fail) process.exit(1);
