// Função "ai" rodando no Deno de verdade, com o Supabase simulado (login e banco) — confere o que não depende da Groq:
// saúde com a chave publicável nova, CORS, login obrigatório, sessão inválida, limite diário e plano vencido.
// Uso: node test-ai-live.mjs   (AI_FN_DIR=out/deploy/ai para conferir a entrada gerada pelo fn-deploy.js)
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV = path.dirname(fileURLToPath(import.meta.url)), TOOLS = path.join(DEV, '.tools');
const FAKE_PORT = 3622, FN_PORT = 3623, FN = `http://127.0.0.1:${FN_PORT}/`;
const PUB = 'sb_publishable_teste123', GOOD = 'jwt-bom', QUOTA = { ok: true, count: 1, limit: 40 };
let pass = 0, fail = 0, quota = QUOTA;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('❌', msg); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seen = [];

function deno() {
  if (process.env.DENO) return process.env.DENO;
  mkdirSync(TOOLS, { recursive: true });
  const bin = path.join(TOOLS, 'node_modules/.bin/deno');
  if (!existsSync(bin)) execFileSync('npm', ['i', '--prefix', TOOLS, '--no-save', '--silent', 'deno@2.9.6'], { stdio: 'inherit' });
  return bin;
}
const fake = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), json = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  for await (const _ of req) { /* corpo ignorado */ }
  seen.push({ path: url.pathname, apikey: req.headers.apikey, auth: req.headers.authorization });
  if (req.headers.apikey !== PUB) return json({ message: 'Invalid API key' }, 401);
  if (url.pathname === '/auth/v1/user') return req.headers.authorization === 'Bearer ' + GOOD ? json({ id: 'u1', email: 'a@b.c', aud: 'authenticated' }) : json({ msg: 'invalid JWT' }, 401);
  if (url.pathname === '/rest/v1/profiles') return json([]);
  if (url.pathname === '/rest/v1/rpc/ai_consume') return json(quota);
  json({ message: 'não simulado' }, 404);
});

const procs = [];
(async () => {
  await new Promise((r) => fake.listen(FAKE_PORT, '127.0.0.1', r));
  const dir = process.env.AI_FN_DIR ? path.resolve(process.env.AI_FN_DIR) : path.join(DEV, 'supabase/functions/ai');
  const env = {
    ...process.env, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FN_PORT}`, DENO_DIR: path.join(TOOLS, 'deno-cache'), DENO_NO_UPDATE_CHECK: '1',
    ...(existsSync('/root/.ccr/ca-bundle.crt') ? { DENO_CERT: '/root/.ccr/ca-bundle.crt' } : {}),
    SUPABASE_URL: `http://127.0.0.1:${FAKE_PORT}`, SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUB }), SUPABASE_ANON_KEY: 'anon-antiga', GROQ_API_KEY: '',
  };
  const p = spawn(deno(), ['run', '--allow-net', '--allow-env', '--allow-read', path.join(dir, 'index.ts')], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  procs.push(p); let errLog = ''; p.stderr.on('data', (d) => { errLog += d; });
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { await sleep(500); up = await fetch(FN, { method: 'OPTIONS' }).then((r) => r.ok).catch(() => false); }
  if (!up) throw new Error('a função não subiu:\n' + errLog.slice(-1500));

  const health = await fetch(FN + '?health=1').then((r) => r.json());
  ok(health.ok === true && health.key === 'publishable', 'saúde: usa a chave publicável nova e o banco aceita: ' + JSON.stringify(health));
  const pre = await fetch(FN, { method: 'OPTIONS', headers: { origin: 'https://iptvquantic.github.io' } });
  ok(pre.headers.get('access-control-allow-origin') === 'https://iptvquantic.github.io' && /authorization/.test(pre.headers.get('access-control-allow-headers')), 'CORS do site');
  const post = (auth, body = { messages: [{ role: 'user', content: 'oi' }] }) => fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ' + auth } : {}) }, body: JSON.stringify(body) });
  let r = await post(null); ok(r.status === 401, 'sem login: 401');
  r = await post('jwt-falso'); ok(r.status === 401 && /Sessão inválida/.test((await r.json()).error), 'login inválido: 401');
  ok(seen.some((s) => s.path === '/auth/v1/user' && s.apikey === PUB && s.auth === 'Bearer jwt-falso'), 'confere o login no Supabase Auth com a chave publicável');
  quota = { ok: false, reason: 'limit', limit: 40 };
  r = await post(GOOD); ok(r.status === 429, 'limite diário: 429');
  ok(seen.some((s) => s.path === '/rest/v1/rpc/ai_consume' && s.auth === 'Bearer ' + GOOD), 'limite decidido no banco com o login do usuário');
  quota = { ok: false, reason: 'plan' };
  r = await post(GOOD); ok(r.status === 402, 'plano vencido: 402');
  quota = QUOTA;
  r = await post(GOOD, { messages: [] }); ok(r.status === 400, 'mensagem vazia: 400');
})().catch((e) => { fail++; console.log('❌ exceção:', e.message); }).finally(async () => {
  for (const p of procs) p.kill('SIGTERM');
  fake.close(); await sleep(200);
  console.log(`${fail ? '❌' : '✅'} função da IA no Deno (Supabase simulado): ${pass} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
});
