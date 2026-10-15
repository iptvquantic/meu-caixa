// Robô do WhatsApp de ponta a ponta, sem internet: a função roda no Deno de verdade, fala com o banco de verdade
// (as funções wa_* num Postgres local, pelo PostgREST — o mesmo servidor de API do Supabase) e com Meta/Groq simuladas.
// Uso: node test-bot-live.mjs   (npm run test:fn:live). Na primeira vez baixa Deno e PostgREST para dev/.tools.
import { execFileSync, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV = path.dirname(fileURLToPath(import.meta.url)), TOOLS = path.join(DEV, '.tools'), SB = path.join(DEV, 'supabase');
const DB = 'mc_bot_live', PGRST_PORT = 3611, FAKE_PORT = 3612, FN_PORT = 3613, FN = `http://127.0.0.1:${FN_PORT}/`;
const JWT_SECRET = 'segredo-de-teste-do-postgrest-com-32-caracteres', APP_SECRET = 'segredo-do-app-meta', PHONE_ID = '1112223334';
const ANA = 'a0000000-0000-4000-8000-000000000001', DONO = 'd0000000-0000-4000-8000-000000000009', PHONE = '5522991110001';
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('❌', msg); } };
const has = (txt, part, msg) => ok(String(txt).replace(/ /g, ' ').includes(part), `${msg}\n   esperado conter: ${part}\n   veio: ${JSON.stringify(txt)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- ferramentas (Deno e PostgREST) ----------
function tool(name) {
  mkdirSync(TOOLS, { recursive: true });
  if (name === 'deno') {
    if (process.env.DENO) return process.env.DENO;
    const bin = path.join(TOOLS, 'node_modules/.bin/deno');
    if (!existsSync(bin)) execFileSync('npm', ['i', '--prefix', TOOLS, '--no-save', '--silent', 'deno@2.9.6'], { stdio: 'inherit' });
    return bin;
  }
  if (process.env.POSTGREST) return process.env.POSTGREST;
  const bin = path.join(TOOLS, 'postgrest');
  if (!existsSync(bin)) {
    execFileSync('curl', ['-sSL', '-m', '180', '-o', path.join(TOOLS, 'pgrst.tar.xz'), 'https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz']);
    execFileSync('tar', ['-xJf', path.join(TOOLS, 'pgrst.tar.xz'), '-C', TOOLS]);
  }
  return bin;
}
const psql = (sql, db = DB) => execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', sql], { encoding: 'utf8', env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' } }).trim();
const psqlFile = (f) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', DB, '-f', f], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' } });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(payload) { const h = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(payload); return h + '.' + createHmac('sha256', JWT_SECRET).update(h).digest('base64url'); }
const exp = () => Math.floor(Date.now() / 1000) + 3600;
const SERVICE = jwt({ role: 'service_role', iss: 'supabase', exp: exp() });
const DONO_JWT = jwt({ role: 'authenticated', sub: DONO, exp: exp() }), ANA_JWT = jwt({ role: 'authenticated', sub: ANA, exp: exp() });
const rest = (pathAndQuery, init = {}, key = SERVICE) => fetch(`http://127.0.0.1:${FAKE_PORT}/rest/v1/${pathAndQuery}`, { ...init, headers: { apikey: key, Authorization: 'Bearer ' + key, ...(init.headers ?? {}) } });

// ---------- banco ----------
function setupDb() {
  execFileSync('dropdb', ['--if-exists', DB], { stdio: 'ignore' }); execFileSync('createdb', [DB]);
  psqlFile(path.join(SB, 'test/supabase_stub.sql'));
  psqlFile(path.join(SB, 'schema.sql'));
  for (const m of execFileSync('ls', [path.join(SB, 'migrations')], { encoding: 'utf8' }).trim().split('\n').sort()) psqlFile(path.join(SB, 'migrations', m));
  psql(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit password 'mc-teste'; end if; end $$;
        grant anon, authenticated, service_role to authenticator;`);
  const today = `(now() at time zone 'America/Sao_Paulo')::date`;
  psql(`insert into auth.users (id, email) values ('${ANA}', 'ana@teste.local'), ('${DONO}', 'dono@teste.local');
        update public.profiles set plan = 'master' where id = '${DONO}';
        update public.profiles set name = 'Ana Souza' where id = '${ANA}';
        insert into public.cards (user_id, name, closing_day, due_day) values ('${ANA}', 'Nubank', 5, 12);
        insert into public.recurring (user_id, type, name, amount, day, start_month, category_id)
          select '${ANA}', 'out', 'Aluguel', 900, 5, to_char(${today}, 'YYYY-MM'), id from public.categories where user_id = '${ANA}' and kind = 'out' and legacy_key = 'moradia';
        insert into public.transactions (user_id, type, amount, date, description, category_id)
          select '${ANA}', 'in', 3000, ${today}, 'Vendas', id from public.categories where user_id = '${ANA}' and kind = 'in' and legacy_key = 'vendas';`);
}
const linkCode = () => psql(`select set_config('request.jwt.claims', '{"sub":"${ANA}","role":"authenticated"}', false); set role authenticated; select public.wa_link_start() ->> 'code';`).split('\n').pop();

// ---------- Meta e Groq simuladas (+ /rest/v1 → PostgREST e /auth/v1/user, como no Supabase) ----------
const sent = [], groqCalls = [], proof = { checked: 0, wrong: [], missing: [] }, meta = { subs: [], wabaApps: [], verified: false, secret: APP_SECRET };
// números da conta 555: o do robô (conectado) e o de atendimento do dono (fica no celular; nunca usado)
const NUMS = [
  { id: PHONE_ID, display_phone_number: '+1 555-010-0000', verified_name: 'Meu Caixa Teste', status: 'CONNECTED', platform_type: 'CLOUD_API', account_mode: 'LIVE', code_verification_status: 'VERIFIED' },
  { id: '7037', display_phone_number: '+55 22 99105-3813', verified_name: 'Quantic Play', status: 'DISCONNECTED', platform_type: 'NOT_APPLICABLE', account_mode: 'LIVE', code_verification_status: 'VERIFIED' },
];
const fake = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks), url = new URL(req.url, 'http://x');
  const json = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (url.pathname.startsWith('/rest/v1/')) {
    const p = http.request({ host: '127.0.0.1', port: PGRST_PORT, path: url.pathname.slice('/rest/v1'.length) + url.search, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${PGRST_PORT}` } }, (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); });
    p.on('error', (e) => json({ message: e.message }, 502)); p.end(body); return;
  }
  if (url.pathname === '/auth/v1/user') { // o que o Supabase Auth responde para o login do app
    const t = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    return t === DONO_JWT ? json({ id: DONO, email: 'dono@teste.local' }) : t === ANA_JWT ? json({ id: ANA, email: 'ana@teste.local' }) : json({ msg: 'invalid JWT' }, 401);
  }
  if (url.pathname.startsWith('/functions/v1/whatsapp')) { // o endereço público da função (a Meta confirma o webhook nele)
    const p = http.request({ host: '127.0.0.1', port: FN_PORT, path: '/' + url.search, method: req.method, headers: req.headers }, (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); });
    p.on('error', (e) => json({ message: e.message }, 502)); p.end(body); return;
  }
  if (url.pathname.startsWith('/graph/')) { // como a Meta: token do app (id|chave) ou prova da chave em cada chamada com o token do robô
    const tok = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''), appTok = /^(\d+)\|(.+)$/.exec(tok), given = url.searchParams.get('appsecret_proof');
    if (appTok) { if (appTok[2] !== meta.secret) return json({ error: { message: 'Error validating client secret.', type: 'OAuthException', code: 1 } }, 400); }
    else if (given === null) proof.missing.push(url.pathname);
    else {
      proof.checked++;
      if (given !== createHmac('sha256', meta.secret).update(tok).digest('hex')) { proof.wrong.push(url.pathname); return json({ error: { message: 'Invalid appsecret_proof provided in the API argument', type: 'GraphMethodException', code: 100 } }, 400); }
    }
  }
  const G = '/graph/v24.0/';
  if (url.pathname === G + 'app') return json({ id: '777', name: 'Meu Caixa' });
  if (url.pathname === G + '777' && req.method === 'GET') return json({ id: '777' });
  if (url.pathname === G + 'debug_token') return json({ data: { app_id: '777', is_valid: true, expires_at: 0, granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['555'] }] } });
  if (url.pathname === G + '777/subscriptions' && req.method === 'GET') return json({ data: meta.subs });
  if (url.pathname === G + '777/subscriptions' && req.method === 'POST') {
    const cb = url.searchParams.get('callback_url'), ch = 'desafio-' + Date.now();
    const got = await fetch(`${cb}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(url.searchParams.get('verify_token'))}&hub.challenge=${ch}`).then((r) => r.text()).catch(() => '');
    if (got !== ch) return json({ error: { message: 'The URL couldn\'t be validated. Callback verification failed', code: 2200 } }, 400);
    meta.verified = true; meta.subs = [{ object: url.searchParams.get('object'), callback_url: cb, active: true, fields: [{ name: url.searchParams.get('fields'), version: 'v24.0' }] }];
    return json({ success: true });
  }
  if (url.pathname === G + '555' && url.searchParams.get('fields') === 'name') return json({ id: '555', name: 'Conta Teste' });
  if (url.pathname === G + '555' && url.searchParams.get('fields') === 'owner_business_info') return json({ owner_business_info: { id: '3688', name: 'Empresa Teste' } });
  if (url.pathname === G + '555/phone_numbers') return json({ data: url.searchParams.get('fields') === 'id' ? NUMS.map((n) => ({ id: n.id })) : NUMS });
  if (url.pathname === G + '555/subscribed_apps') {
    if (req.method === 'POST') { meta.wabaApps = [{ whatsapp_business_api_data: { id: '777', name: 'Meu Caixa' } }]; return json({ success: true }); }
    return json({ data: meta.wabaApps });
  }
  if (url.pathname === `/graph/v24.0/${PHONE_ID}/messages`) { const j = JSON.parse(body); if (j.type === 'text') sent.push(j); return json({ messages: [{ id: 'wamid.out' }] }); }
  if (url.pathname === `/graph/v24.0/${PHONE_ID}`) return json({ display_phone_number: '+1 555-010-0000', verified_name: 'Meu Caixa Teste' });
  if (url.pathname === '/graph/v24.0/media-1') return json({ url: `http://127.0.0.1:${FAKE_PORT}/media/1`, mime_type: 'audio/ogg; codecs=opus', file_size: 9 });
  if (url.pathname === '/media/1') { res.writeHead(200, { 'content-type': 'audio/ogg' }); return res.end(Buffer.from('OggS-fake')); }
  if (url.pathname === '/graph/v24.0/media-2') return json({ url: `http://127.0.0.1:${FAKE_PORT}/media/2`, mime_type: 'image/jpeg', file_size: 4 });
  if (url.pathname === '/media/2') { // como a Meta: o arquivo só sai com o token do robô
    if (req.headers.authorization !== 'Bearer token-de-teste') return json({ error: 'sem token' }, 401);
    res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(Buffer.from('JPEG'));
  }
  if (url.pathname === '/graph/v24.0/media-3') return json({ url: `http://127.0.0.1:${FAKE_PORT}/media/3`, mime_type: 'image/jpeg', file_size: 9 * 1024 * 1024 });
  if (url.pathname === '/groq/audio/transcriptions') { groqCalls.push({ audio: true, form: body.toString('latin1') }); return json({ text: 'Gastei 40 reais de Uber ontem.' }); }
  if (url.pathname === '/groq/chat/completions') {
    const j = JSON.parse(body); groqCalls.push(j);
    if (Array.isArray(j.messages?.[1]?.content)) { // modelo de visão: PIX recebido da Vanessa (legenda "pix da vanessa") ou farmácia no PIX
      if (/pix da vanessa/.test(j.messages[1].content[0].text)) return json({ choices: [{ message: { content: '{"comprovante": true, "tipo": "entrada", "valor": 30, "data": null, "descricao": "Pix Vanessa", "categoria": "Vendas", "pagamento": "pix", "parcelas": 1}' } }] });
      return json({ choices: [{ message: { content: '{"comprovante": true, "tipo": "saida", "valor": 52.9, "data": null, "descricao": "Drogasil", "categoria": "Farmácia", "pagamento": "pix", "parcelas": 1}' } }] });
    }
    return json({ choices: [{ message: { content: j.response_format ? '{"lancamento": false}' : 'Resposta da IA (teste).' } }] });
  }
  json({ error: 'não simulado: ' + url.pathname }, 404);
});

let mid = 0;
async function send(text, { from = PHONE, audio = false, image = null, id, secret = APP_SECRET, to = PHONE_ID } = {}) {
  id = id ?? 'wamid.live.' + (++mid);
  const msg = audio ? { from, id, timestamp: '1', type: 'audio', audio: { id: 'media-1', mime_type: 'audio/ogg; codecs=opus', voice: true } }
    : image ? { from, id, timestamp: '1', type: 'image', image: { id: image, mime_type: 'image/jpeg', caption: text ?? undefined } }
    : { from, id, timestamp: '1', type: 'text', text: { body: text } };
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: '555', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '15550100000', phone_number_id: to }, contacts: [{ profile: { name: 'Ana' }, wa_id: from }], messages: [msg] } }] }] });
  const before = sent.length;
  const r = await fetch(FN, { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', secret).update(body).digest('hex') } });
  return { status: r.status, reply: sent.slice(before).map((s) => s.text.body).join('\n---\n'), to: sent.slice(before).map((s) => s.to) };
}

const procs = [];
async function main() {
  const deno = tool('deno'), postgrest = tool('postgrest');
  setupDb();
  procs.push(spawn(postgrest, [], { env: { ...process.env, PGRST_DB_URI: `postgres://authenticator:mc-teste@127.0.0.1:5432/${DB}`, PGRST_DB_SCHEMAS: 'public', PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: JWT_SECRET, PGRST_SERVER_PORT: String(PGRST_PORT), PGRST_DB_CHANNEL_ENABLED: 'false', PGRST_LOG_LEVEL: 'crit' }, stdio: ['ignore', 'ignore', 'ignore'] }));
  await new Promise((r) => fake.listen(FAKE_PORT, '127.0.0.1', r));
  const env = {
    ...process.env, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FN_PORT}`, DENO_DIR: path.join(TOOLS, 'deno-cache'), DENO_NO_UPDATE_CHECK: '1',
    ...(existsSync('/root/.ccr/ca-bundle.crt') ? { DENO_CERT: '/root/.ccr/ca-bundle.crt' } : {}),
    SUPABASE_URL: `http://127.0.0.1:${FAKE_PORT}`, SUPABASE_SERVICE_ROLE_KEY: SERVICE, SUPABASE_SECRET_KEYS: '',
    WHATSAPP_TOKEN: 'token-de-teste', WHATSAPP_APP_SECRET: APP_SECRET, WHATSAPP_PHONE_ID: PHONE_ID, WHATSAPP_VERIFY_TOKEN: 'mc-verifica',
    WHATSAPP_GRAPH_URL: `http://127.0.0.1:${FAKE_PORT}/graph`, GROQ_API_KEY: 'gsk-teste', GROQ_BASE_URL: `http://127.0.0.1:${FAKE_PORT}/groq`,
  };
  const entry = path.join(process.env.WA_FN_DIR ? path.resolve(process.env.WA_FN_DIR) : path.join(SB, 'functions/whatsapp'), 'index.ts');
  // tipos conferidos como no Supabase (erro de tipo não pode passar)
  try { execFileSync(deno, ['check', entry], { env, stdio: ['ignore', 'pipe', 'pipe'] }); ok(true, 'tipos'); }
  catch (e) { ok(false, 'tipos do TypeScript: ' + String(e.stderr || e.message).replace(/\x1b\[[0-9;]*m/g, '').slice(0, 600)); }
  procs.push(spawn(deno, ['run', '--allow-net', '--allow-env', '--allow-read', entry], { env, stdio: ['ignore', 'ignore', 'pipe'] }));
  let up = false, errLog = '';
  procs[1].stderr.on('data', (d) => { errLog += d; });
  for (let i = 0; i < 120 && !up; i++) { await sleep(500); up = await fetch(FN).then((r) => r.ok).catch(() => false); }
  if (!up) throw new Error('a função não subiu no Deno:\n' + errLog.slice(-1500));

  // cadastro do webhook e informação para o app
  ok(await fetch(FN + '?hub.mode=subscribe&hub.verify_token=mc-verifica&hub.challenge=desafio42').then((r) => r.text()) === 'desafio42', 'Meta: cadastro do webhook confirmado');
  const info = await fetch(FN + '?info=1').then((r) => r.json());
  ok(info.configured === true && info.number === '15550100000' && info.ready === false, 'app descobre o número do robô; antes de ligar na Meta, os clientes não veem o robô: ' + JSON.stringify(info));

  const health = await fetch(FN + '?health=1').then((r) => r.json());
  ok(health.db === true && health.configured === true, 'saúde: a função alcança o banco com a chave de serviço');
  // ativar na Meta pelo app do dono (webhook + conta do WhatsApp), sem mexer no painel da Meta
  const setup = (token) => fetch(FN + '?setup=1', { method: 'POST', headers: { authorization: 'Bearer ' + token, origin: 'https://iptvquantic.github.io' } });
  let s = await setup(ANA_JWT);
  ok(s.status === 403 && !meta.subs.length, 'cliente comum não ativa o robô');
  s = await setup('login-falso');
  ok(s.status === 403 && !meta.subs.length, 'login falso não ativa o robô');
  const act = await (await setup(DONO_JWT)).json();
  ok(act.ok && act.webhook === 'ativado' && act.waba === 'ativado' && act.name === 'Meu Caixa Teste', 'dono ativa o robô na Meta: ' + JSON.stringify(act));
  ok(meta.verified && meta.subs[0]?.callback_url === `http://127.0.0.1:${FAKE_PORT}/functions/v1/whatsapp`, 'a Meta confirmou o webhook chamando a própria função (desafio respondido)');
  const recheck = await (await setup(DONO_JWT)).json();
  ok(recheck.ok && recheck.webhook === 'ok' && recheck.waba === 'ok' && recheck.ready, 'conferir de novo: tudo certo, nada muda');
  ok(recheck.numbers?.length === 2 && recheck.numbers.find((n) => n.id === '7037')?.state === 'seu atendimento (fica no celular)', 'o dono vê os números da conta e o de atendimento à parte');
  const after = await fetch(FN + '?info=1').then((r) => r.json());
  ok(after.ready === true && after.number === '15550100000', 'depois de ligado: os clientes veem o robô');

  // conectar
  let r = await send('oi');
  has(r.reply, 'Ajustes → WhatsApp → Conectar', 'número desconhecido recebe o caminho para conectar');
  r = await send('MC ' + linkCode());
  has(r.reply, 'Pronto, Ana!', 'código gerado no app conecta o WhatsApp');
  ok(psql(`select phone from public.wa_links where user_id = '${ANA}'`) === PHONE, 'número gravado no banco');
  r = await send(linkCode());
  has(r.reply, 'Pronto, Ana!', 'já conectado: código novo (só os 8 dígitos) reconecta a mesma conta');
  ok(psql(`select count(*) from public.transactions where user_id = '${ANA}'`) === '1', '... e não vira lançamento');

  // lançar, conta fixa, desfazer
  r = await send('mercado 52,90');
  has(r.reply, '💸 *Saída* de *R$ 52,90*', 'lançamento confirmado'); ok(r.to[0] === PHONE, 'resposta para o mesmo número');
  ok(psql(`select c.legacy_key from public.transactions t join public.categories c on c.id = t.category_id where t.user_id = '${ANA}' and t.amount = 52.90`) === 'mercado', 'gravado no banco na categoria Mercado');
  r = await send('paguei aluguel');
  has(r.reply, 'Conta fixa *Aluguel* marcada como paga', 'conta fixa paga pelo WhatsApp');
  ok(psql(`select count(*) from public.transactions t join public.recurring r on r.id = t.recurring_id where t.user_id = '${ANA}' and r.name = 'Aluguel'`) === '1', 'pagamento ligado à conta fixa no banco');
  r = await send('paguei aluguel');
  has(r.reply, 'já estava marcada como paga', 'não paga 2x');
  r = await send('desfazer');
  has(r.reply, '↩️ Apaguei', 'desfazer'); ok(psql(`select count(*) from public.transactions where user_id = '${ANA}' and recurring_id is not null`) === '0', 'pagamento desfeito no banco');
  ok(psql(`select count(*) from public.transactions where user_id = '${ANA}' and amount = 52.90`) === '1', 'desfazer apaga só o último (o mercado continua)');
  r = await send('desfazer');
  has(r.reply, 'Não há lançamento recente', 'desfazer de novo: nada mais a apagar');
  r = await send('saldo');
  has(r.reply, '*Saldo: R$ 2.947,10*', 'saldo calculado com os dados do banco (3000 − 52,90)');
  r = await send('notebook 3.600 12x');
  has(r.reply, 'em 12x de R$ 300,00', 'parcelado no cartão');
  ok(psql(`select installments || ' ' || type from public.transactions where user_id = '${ANA}' and amount = 3600`) === '12 card', 'compra parcelada gravada no cartão');

  // áudio e IA
  r = await send(null, { audio: true });
  has(r.reply, '🎙️ _"Gastei 40 reais de Uber ontem."_', 'áudio transcrito'); has(r.reply, '📅 ontem', 'data do áudio');
  ok(groqCalls.some((c) => c.audio && /whisper-large-v3-turbo/.test(c.form) && /name="language"\r\n\r\npt/.test(c.form)), 'áudio enviado ao Whisper em português');
  r = await send('quanto posso gastar até o fim do mês?');
  ok(r.reply === 'Resposta da IA (teste).', 'pergunta respondida pela IA');
  const chat = groqCalls.filter((c) => c.messages).pop();
  has(chat.messages[0].content, 'DADOS REAIS de Ana Souza', 'IA recebe os números reais do banco'); has(chat.messages[0].content, 'pagar Aluguel', 'IA vê as contas fixas');
  ok(psql(`select count from public.ai_usage where user_id = '${ANA}'`) === '2', 'áudio + pergunta = 2 usos de IA no banco');

  // comprovante por foto: baixa da Meta com o token, a IA lê, grava no banco na categoria certa
  r = await send('remédio', { image: 'media-2' });
  has(r.reply, '🧾 Li o comprovante (PIX):', 'foto do comprovante lida'); has(r.reply, '💸 *Saída* de *R$ 52,90*', '... e lançada como saída');
  const vision = groqCalls.filter((c) => Array.isArray(c.messages?.[1]?.content)).pop();
  ok(vision?.model === 'qwen/qwen3.8-27b' && vision.messages[1].content[1].image_url.url === 'data:image/jpeg;base64,' + Buffer.from('JPEG').toString('base64') && /remédio/.test(vision.messages[1].content[0].text), 'imagem baixada da Meta e enviada ao modelo de visão com a legenda');
  ok(psql(`select c.legacy_key || ' ' || t.description || ' ' || t.type from public.transactions t join public.categories c on c.id = t.category_id where t.user_id = '${ANA}' and t.description = 'Drogasil'`) === 'farmacia Drogasil out', 'gravado no banco como saída em Farmácia');
  ok(psql(`select count from public.ai_usage where user_id = '${ANA}'`) === '3', 'a foto gasta 1 uso de IA');
  r = await send(null, { image: 'media-3' });
  has(r.reply, 'grande demais', 'imagem enorme: avisa sem baixar');
  // mensagem para o número de atendimento do dono (mesma conta): o robô nunca responde
  r = await send('oi, meu sinal caiu', { to: '7037', from: '5521988887777' });
  ok(r.status === 200 && !r.reply, 'mensagem para o WhatsApp de atendimento: o robô fica quieto');

  // limpeza que a função faz de vez em quando: só ids de mensagens com mais de 30 dias
  psql(`insert into public.wa_inbox (id, phone, received_at) values ('wamid.velha', '${PHONE}', now() - interval '31 days')`);
  const recent = Number(psql(`select count(*) from public.wa_inbox where received_at > now() - interval '1 day'`));
  const app = jwt({ role: 'authenticated', sub: ANA, exp: exp() });
  const tryApp = await rest('wa_inbox?id=eq.wamid.velha', { method: 'DELETE' }, app);
  ok(!tryApp.ok && psql(`select count(*) from public.wa_inbox where id = 'wamid.velha'`) === '1', 'usuário do app não mexe na lista de mensagens recebidas');
  const clean = await rest(`wa_inbox?received_at=lt.${encodeURIComponent(new Date(Date.now() - 30 * 864e5).toISOString())}`, { method: 'DELETE' });
  ok(clean.ok && psql(`select count(*) from public.wa_inbox where id = 'wamid.velha'`) === '0' && Number(psql(`select count(*) from public.wa_inbox`)) === recent && recent > 5,
    'limpeza (chave de serviço) apaga só os ids antigos');

  // pelo app: o mesmo robô, com o login do usuário (texto, áudio e foto), gravando no banco
  const appCall = (token, body) => fetch(FN + '?app=1', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', origin: 'https://iptvquantic.github.io' }, body: JSON.stringify(body) });
  let a = await appCall('login-falso', { text: 'mercado 10' });
  ok(a.status === 401, 'app: login falso recusado');
  a = await (await appCall(ANA_JWT, { text: 'farmácia 23,50' })).json();
  ok(a.handled && Number(a.tx?.amount) === 23.5 && a.tx?.type === 'out' && !a.tx.user_id && /💸 \*Saída\* de \*R\$ 23,50\*/.test(a.reply), 'app: texto vira lançamento e volta para a tela: ' + JSON.stringify(a));
  ok(psql(`select c.legacy_key from public.transactions t join public.categories c on c.id = t.category_id where t.id = '${a.tx?.id}' and t.user_id = '${ANA}'`) === 'farmacia', 'app: gravado no banco na categoria Farmácia');
  a = await (await appCall(ANA_JWT, { text: 'quanto posso gastar até o fim do mês?', noAI: true })).json();
  ok(a.handled === false && a.reply === null && !a.tx, 'app: pergunta livre fica para o Conselheiro (com histórico)');
  a = await (await appCall(ANA_JWT, { audio: { mime: 'audio/webm;codecs=opus', data: Buffer.from('webm-fake').toString('base64') } })).json();
  ok(a.heard === 'Gastei 40 reais de Uber ontem.' && Number(a.tx?.amount) === 40, 'app: áudio transcrito e lançado: ' + JSON.stringify(a));
  ok(groqCalls.filter((c) => c.audio).pop()?.form.includes('filename="audio.webm"'), 'app: áudio vai ao Whisper como webm');
  a = await (await appCall(ANA_JWT, { image: { mime: 'image/jpeg', data: Buffer.from('JPEG').toString('base64') }, text: 'remédio' })).json();
  ok(a.tx?.description === 'Drogasil' && /🧾 Li o comprovante/.test(a.reply), 'app: foto do comprovante lida e lançada');
  const usage = psql(`select count from public.ai_usage where user_id = '${ANA}'`); ok(usage === '6', 'app: áudio e foto contam no limite diário de IA, como no WhatsApp (' + usage + ')');
  // tipo automático: a foto de um PIX recebido vira entrada; a aba tocada no app decide quando a frase não diz
  a = await (await appCall(ANA_JWT, { image: { mime: 'image/jpeg', data: Buffer.from('JPEG').toString('base64') }, text: 'pix da vanessa' })).json();
  ok(a.tx?.type === 'in' && Number(a.tx?.amount) === 30 && /💰 \*Entrada\* de \*R\$ 30,00\*/.test(a.reply), 'app: foto de PIX recebido vira entrada: ' + JSON.stringify(a.tx));
  ok(psql(`select c.legacy_key || ' ' || c.kind from public.transactions t join public.categories c on c.id = t.category_id where t.id = '${a.tx?.id}'`) === 'vendas in', 'app: entrada gravada na categoria de entrada (Vendas)');
  const intro = groqCalls.filter((c) => Array.isArray(c.messages?.[1]?.content)).pop()?.messages[1].content[0].text || '';
  ok(/Categorias de gasto do usuário: .*Farmácia/.test(intro) && /Categorias de entrada do usuário: .*Vendas/.test(intro) && /se chama Ana Souza/.test(intro), 'a IA recebe as categorias de gasto e de entrada e o nome do usuário');
  a = await (await appCall(ANA_JWT, { text: 'xpto 12', hint: { type: 'in', sure: true } })).json();
  ok(a.tx?.type === 'in' && Number(a.tx?.amount) === 12, 'app: aba Entrada tocada + frase sem pista → entrada: ' + JSON.stringify(a.tx));
  a = await (await appCall(ANA_JWT, { text: 'qwerty 13', hint: { type: 'hack', sure: 'sim', card: "'; drop table x" } })).json();
  ok(a.tx?.type === 'out' && Number(a.tx?.amount) === 13, 'app: dica fora do formato é ignorada (vale o padrão): ' + JSON.stringify(a.tx));
  a = await (await appCall(ANA_JWT, { text: 'xpto 14' })).json();
  ok(a.tx?.type === 'in', 'app: "xpto" já foi lançado como entrada → entrada de novo (histórico do banco)');

  // segurança
  const dup = await send('mercado 10', { id: 'wamid.repetida' }), again = await send('mercado 10', { id: 'wamid.repetida' });
  ok(dup.reply && !again.reply && psql(`select count(*) from public.transactions where user_id = '${ANA}' and amount = 10`) === '1', 'mensagem repetida pela Meta lança só 1 vez');
  r = await send('mercado 99', { secret: 'outro-segredo' });
  ok(r.status === 401 && !r.reply && psql(`select count(*) from public.transactions where amount = 99`) === '0', 'aviso com assinatura falsa é recusado');
  ok(proof.checked > 10 && !proof.wrong.length && !proof.missing.length, `toda chamada à Meta leva o appsecret_proof certo (${proof.checked} conferidas${proof.wrong.length ? '; erradas: ' + proof.wrong.join(', ') : ''}${proof.missing.length ? '; sem prova: ' + proof.missing.join(', ') : ''})`);

  // chave secreta que não é a do app (o caso do dono em 09/10): a ativação diz o que trocar e onde
  meta.secret = 'outra-chave-do-app';
  const bad = await (await setup(DONO_JWT)).json();
  ok(!bad.ok && bad.message.includes('não é a do app "Meu Caixa"') && bad.fix?.meta === 'https://developers.facebook.com/apps/777/settings/basic/' && /\/functions\/secrets$/.test(bad.fix?.secrets || ''),
    'chave secreta errada: explica e dá os links diretos: ' + JSON.stringify(bad));
  ok(!bad.message.includes(APP_SECRET), 'a chave nunca aparece na resposta');
  meta.secret = APP_SECRET;
  psql(`update public.profiles set plan_expiry = now() - interval '1 day' where id = '${ANA}'`);
  r = await send('mercado 77');
  has(r.reply, 'Seu plano venceu', 'plano vencido não lança'); ok(psql(`select count(*) from public.transactions where amount = 77`) === '0', 'nada gravado com plano vencido');
}

main().catch((e) => { fail++; console.log('❌ exceção:', e.message); }).finally(async () => {
  for (const p of procs) p.kill('SIGTERM');
  fake.close();
  await sleep(300);
  try { execFileSync('dropdb', ['--if-exists', DB], { stdio: 'ignore' }); } catch { }
  console.log(`${fail ? '❌' : '✅'} robô de ponta a ponta (Deno + PostgREST + Postgres): ${pass} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
});
