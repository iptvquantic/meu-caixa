// Meu Caixa — porta de entrada do robô do WhatsApp: confere que a mensagem veio mesmo da Meta (assinatura),
// ignora repetidas, chama o robô e manda a resposta. Também responde ao teste de cadastro do webhook da Meta,
// diz ao app se o robô está configurado (e qual é o número dele) e, a pedido do dono pelo app, ativa e confere
// o robô na Meta (webhook do app e inscrição da conta do WhatsApp) — sem ninguém mexer no painel da Meta.
import type { Incoming } from './bot.ts';

export type Cfg = {
  verifyToken: string; appSecret: string; phoneId: string; token: string; apiVersion: string; allowed: string[];
  selfUrl?: string; // endereço público desta função (o webhook cadastrado na Meta)
  wabaId?: string;  // conta do WhatsApp (opcional: sem ele, descobre pelo token)
};
export type HandlerDeps = {
  cfg: Cfg;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<any>;
  bot: (m: Incoming) => Promise<string | null>;
  graph: (path: string, init?: RequestInit, token?: string) => Promise<Response>; // API da Meta (token do robô ou outro)
  isAdmin?: (jwt: string) => Promise<boolean>;                  // login do app é do dono/admin?
  waitUntil?: (p: Promise<unknown>) => void;                    // termina o trabalho depois de responder 200 à Meta
  housekeeping?: () => Promise<unknown>;                        // limpeza leve, de vez em quando (1 a cada 50 avisos)
  random?: () => number;                                        // só para o teste forçar a limpeza
  log?: (...a: unknown[]) => void;
};
export type WaMsg = { id: string; from: string; type: string; text?: string; audioId?: string };

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

// X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(corpo exato, chave secreta do app)
export async function signatureOk(secret: string, raw: ArrayBuffer, header: string | null) {
  if (!secret || !header || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = 'sha256=' + hex(await crypto.subtle.sign('HMAC', key, raw));
  if (want.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

// Mensagens recebidas no aviso da Meta (ignora status de entrega e outros números)
export function messagesOf(payload: any, phoneId: string): WaMsg[] {
  const out: WaMsg[] = [];
  for (const e of payload?.entry ?? []) for (const ch of e?.changes ?? []) {
    if (ch?.field !== 'messages') continue;
    const v = ch.value ?? {};
    if (phoneId && v.metadata?.phone_number_id && String(v.metadata.phone_number_id) !== phoneId) continue;
    for (const m of v.messages ?? []) {
      const from = String(m?.from ?? '');
      if (!m?.id || !/^\d{6,20}$/.test(from)) continue;
      const text = m.type === 'text' ? m.text?.body
        : m.type === 'button' ? m.button?.text
        : m.type === 'interactive' ? (m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title) : undefined;
      out.push({ id: String(m.id), from, type: String(m.type), text: typeof text === 'string' ? text.slice(0, 2000) : undefined, audioId: m.type === 'audio' ? m.audio?.id : undefined });
    }
  }
  return out;
}
const kindOf = (t: string): Incoming['kind'] =>
  t === 'audio' ? 'audio' : t === 'text' || t === 'button' || t === 'interactive' ? 'text' : t === 'image' || t === 'document' || t === 'video' ? 'image' : 'other';

export async function sendText(d: HandlerDeps, to: string, body: string) {
  const r = await d.graph(`${d.cfg.phoneId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: body.slice(0, 4096), preview_url: false } }),
  });
  if (!r.ok) d.log?.('envio falhou', r.status, (await r.text()).slice(0, 300));
  return r.ok;
}
// "visto" + "digitando…" enquanto o robô pensa (se a Meta recusar o "digitando", fica só o visto)
async function markRead(d: HandlerDeps, id: string) {
  try {
    const base = { messaging_product: 'whatsapp', status: 'read', message_id: id };
    const r = await d.graph(`${d.cfg.phoneId}/messages`, { method: 'POST', body: JSON.stringify({ ...base, typing_indicator: { type: 'text' } }) });
    if (!r.ok) await d.graph(`${d.cfg.phoneId}/messages`, { method: 'POST', body: JSON.stringify(base) });
  } catch { /* não impede a resposta */ }
}

async function processOne(d: HandlerDeps, m: WaMsg) {
  const seen = await d.rpc('wa_seen', { p_id: m.id, p_phone: m.from });
  if (!seen?.new) return; // a Meta reenviou: já foi tratada
  await markRead(d, m.id);
  let reply: string | null;
  try {
    reply = await d.bot({ phone: m.from, kind: kindOf(m.type), text: m.text, audioId: m.audioId, lastHour: Number(seen.last_hour) || 1 });
  } catch (e) {
    d.log?.('robô falhou', e instanceof Error ? e.message : e);
    reply = 'Tive um problema agora e não consegui terminar. Tente de novo em instantes.';
  }
  if (reply) await sendText(d, m.from, reply);
}

let botNumberCache = '';
async function botNumber(d: HandlerDeps) {
  if (botNumberCache) return botNumberCache;
  try {
    const r = await d.graph(`${d.cfg.phoneId}?fields=display_phone_number`);
    if (!r.ok) return '';
    botNumberCache = String((await r.json())?.display_phone_number ?? '').replace(/\D/g, '');
  } catch { return ''; }
  return botNumberCache;
}

function cors(req: Request, cfg: Cfg) {
  const origin = req.headers.get('origin') ?? '';
  const ok = cfg.allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : cfg.allowed[0] ?? '', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', Vary: 'Origin',
  };
}

// ---------- ativar e conferir o robô na Meta (só dono/admin, pelo app) ----------
export type SetupReport = {
  ok: boolean; message: string; number?: string | null; name?: string | null;
  webhook?: 'ok' | 'ativado'; waba?: 'ok' | 'ativado' | 'desconhecido'; tokenExpires?: string | null;
};
class GraphError extends Error { code?: number; constructor(msg: string, code?: number) { super(msg); this.code = code; } }
async function gj(d: HandlerDeps, path: string, init?: RequestInit, token?: string) {
  const r = await d.graph(path, init, token);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new GraphError(String(j?.error?.message ?? 'HTTP ' + r.status), Number(j?.error?.code) || undefined);
  return j;
}
function explain(e: unknown, step: string) {
  if (!(e instanceof GraphError)) return `Não consegui falar com a Meta (${step}). Tente de novo em instantes.`;
  const m = e.message.toLowerCase();
  if (m.includes('appsecret_proof') || m.includes('app secret')) return 'A chave secreta do app (WHATSAPP_APP_SECRET) não confere com o app da Meta.';
  if (e.code === 190) return 'O token do WhatsApp (WHATSAPP_TOKEN) não vale mais: gere outro no usuário do sistema da Meta e troque no Supabase.';
  if (e.code === 10 || (e.code ?? 0) >= 200 && (e.code ?? 0) < 300) return `O token não tem permissão para ${step} (precisa de whatsapp_business_management e whatsapp_business_messaging).`;
  if (step === 'ler o número') return 'O WHATSAPP_PHONE_ID não é um número desta conta do WhatsApp: confira o "Identificação do número de telefone" na Meta.';
  return `A Meta recusou ${step}: ${e.message}`;
}
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export async function setupMeta(d: HandlerDeps): Promise<SetupReport> {
  const c = d.cfg;
  const missing = ([['WHATSAPP_TOKEN', c.token], ['WHATSAPP_PHONE_ID', c.phoneId], ['WHATSAPP_APP_SECRET', c.appSecret], ['WHATSAPP_VERIFY_TOKEN', c.verifyToken]] as const)
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return { ok: false, message: `Faltam segredos no Supabase (Edge Functions → Secrets): ${missing.join(', ')}.` };
  if (!c.selfUrl) return { ok: false, message: 'A função não sabe o próprio endereço (SUPABASE_URL).' };
  const rep: SetupReport = { ok: false, message: '' };
  let step = 'ler o número';
  try {
    const ph = await gj(d, `${c.phoneId}?fields=display_phone_number,verified_name,quality_rating`);
    rep.number = String(ph.display_phone_number ?? '').replace(/\D/g, '') || null;
    rep.name = ph.verified_name ? String(ph.verified_name) : null;
    step = 'identificar o app';
    const appId = String((await gj(d, 'app')).id ?? '');
    if (!/^\d+$/.test(appId)) throw new GraphError('app sem id');
    const appToken = `${appId}|${c.appSecret}`;
    step = 'conferir o token';
    const dbg = (await gj(d, `debug_token?input_token=${encodeURIComponent(c.token)}`, undefined, appToken)).data ?? {};
    if (dbg.is_valid === false) throw new GraphError('token inválido', 190);
    const exp = Number(dbg.expires_at) || 0;
    rep.tokenExpires = exp > 0 ? new Date(exp * 1000).toISOString() : null;
    // webhook do app: este endereço, campo "messages"
    step = 'ler o webhook';
    const subs: any[] = (await gj(d, `${appId}/subscriptions`, undefined, appToken)).data ?? [];
    const sub = subs.find((s) => s?.object === 'whatsapp_business_account');
    if (sub && sub.active !== false && sub.callback_url === c.selfUrl && (sub.fields ?? []).some((f: any) => (f?.name ?? f) === 'messages')) rep.webhook = 'ok';
    else {
      step = 'ativar o webhook';
      const q = new URLSearchParams({ object: 'whatsapp_business_account', callback_url: c.selfUrl, verify_token: c.verifyToken, fields: 'messages', include_values: 'true' });
      if ((await gj(d, `${appId}/subscriptions?${q}`, { method: 'POST' }, appToken)).success !== true) throw new GraphError('webhook não confirmado');
      rep.webhook = 'ativado';
    }
    // conta do WhatsApp inscrita no app (sem isso as mensagens não chegam)
    step = 'ligar a conta do WhatsApp ao app';
    const ids = [...new Set<string>((dbg.granular_scopes ?? []).filter((g: any) => /^whatsapp_business_(management|messaging)$/.test(String(g?.scope)))
      .flatMap((g: any) => g?.target_ids ?? []).map(String))];
    let waba = c.wabaId || (ids.length === 1 ? ids[0] : '');
    for (const w of waba ? [] : ids) {
      const nums: any[] = (await gj(d, `${w}/phone_numbers?fields=id`)).data ?? [];
      if (nums.some((n) => String(n?.id) === c.phoneId)) { waba = w; break; }
    }
    if (!waba) rep.waba = 'desconhecido';
    else {
      const apps: any[] = (await gj(d, `${waba}/subscribed_apps`)).data ?? [];
      if (apps.some((a) => String(a?.whatsapp_business_api_data?.id ?? a?.id ?? '') === appId)) rep.waba = 'ok';
      else {
        if ((await gj(d, `${waba}/subscribed_apps`, { method: 'POST' })).success !== true) throw new GraphError('inscrição não confirmada');
        rep.waba = 'ativado';
      }
    }
    rep.ok = true;
    rep.message = rep.webhook === 'ativado' || rep.waba === 'ativado' ? 'Robô ativado na Meta agora.' : 'Robô ativo na Meta.';
    if (rep.waba === 'desconhecido') rep.message += ' Não consegui conferir a conta do WhatsApp (defina WHATSAPP_WABA_ID se as mensagens não chegarem).';
    if (rep.tokenExpires) rep.message += ` Atenção: o token vence em ${ddmmyyyy(rep.tokenExpires)}; gere um que não vence (usuário do sistema).`;
  } catch (e) {
    rep.message = explain(e, step);
    d.log?.('ativação na Meta', step, e instanceof Error ? e.message : e);
  }
  return rep;
}

export async function handle(req: Request, d: HandlerDeps): Promise<Response> {
  const url = new URL(req.url), c = d.cfg;
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req, c) });
  if (req.method === 'GET') {
    // cadastro do webhook na Meta
    if (url.searchParams.get('hub.mode') === 'subscribe') {
      const ok = !!c.verifyToken && url.searchParams.get('hub.verify_token') === c.verifyToken;
      return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
        : new Response('token de verificação não confere', { status: 403 });
    }
    // saúde: a função alcança o banco com a chave de serviço? (não lê dado de ninguém)
    if (url.searchParams.has('health')) {
      let db = false;
      try { await d.rpc('wa_user', { p_phone: '0000000000' }); db = true; } catch (e) { d.log?.('saúde: banco', e instanceof Error ? e.message : e); }
      return new Response(JSON.stringify({ db, configured: !!(c.token && c.phoneId && c.appSecret && c.verifyToken) }), { headers: { 'Content-Type': 'application/json' } });
    }
    // o app pergunta se o robô está pronto e qual número abrir
    if (url.searchParams.has('info')) {
      const ready = !!(c.token && c.phoneId && c.appSecret && c.verifyToken);
      const number = ready ? await botNumber(d) : '';
      return new Response(JSON.stringify({ configured: ready && !!number, number: number || null }), {
        headers: { ...cors(req, c), 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' },
      });
    }
    return new Response('Meu Caixa: robô do WhatsApp', { status: 200 });
  }
  if (req.method !== 'POST') return new Response('método não permitido', { status: 405 });
  // o app do dono pede para ativar/conferir na Meta (login do app, nunca a assinatura da Meta)
  if (url.searchParams.has('setup')) {
    const headers = { ...cors(req, c), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    let admin = false;
    try { admin = !!jwt && !!d.isAdmin && await d.isAdmin(jwt); } catch (e) { d.log?.('ativação: login', e instanceof Error ? e.message : e); }
    if (!admin) return new Response(JSON.stringify({ ok: false, message: 'Só o dono da conta pode ativar o robô.' }), { status: 403, headers });
    return new Response(JSON.stringify(await setupMeta(d)), { headers });
  }
  if (!c.appSecret) return new Response('robô não configurado', { status: 503 });
  const raw = await req.arrayBuffer();
  if (!(await signatureOk(c.appSecret, raw, req.headers.get('x-hub-signature-256')))) return new Response('assinatura inválida', { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(raw)); } catch { return new Response('json inválido', { status: 400 }); }
  const msgs = messagesOf(payload, c.phoneId);
  const work = (async () => {
    for (const m of msgs) {
      try { await processOne(d, m); } catch (e) { d.log?.('mensagem falhou', m.id, e instanceof Error ? e.message : e); }
    }
    if (msgs.length && d.housekeeping && (d.random ?? Math.random)() < 0.02) {
      try { await d.housekeeping(); } catch (e) { d.log?.('limpeza falhou', e instanceof Error ? e.message : e); }
    }
  })();
  if (d.waitUntil) d.waitUntil(work); else await work;
  return new Response('ok', { status: 200 });
}
