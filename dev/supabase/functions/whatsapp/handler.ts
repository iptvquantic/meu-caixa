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
  graph: (path: string, init?: RequestInit, token?: string, proof?: boolean) => Promise<Response>; // API da Meta (token do robô ou outro; proof=false só no diagnóstico)
  isAdmin?: (jwt: string) => Promise<boolean>;                  // login do app é do dono/admin?
  waitUntil?: (p: Promise<unknown>) => void;                    // termina o trabalho depois de responder 200 à Meta
  housekeeping?: () => Promise<unknown>;                        // limpeza leve, de vez em quando (1 a cada 50 avisos)
  random?: () => number;                                        // só para o teste forçar a limpeza
  log?: (...a: unknown[]) => void;
};
export type WaMsg = { id: string; from: string; type: string; text?: string; audioId?: string; to?: string; waba?: string }; // to = número que recebeu; waba = conta

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

// Mensagens recebidas no aviso da Meta (ignora status de entrega e outros números).
// O ID configurado pode ser o do número ou o da conta do WhatsApp (entry.id): os dois servem.
export function messagesOf(payload: any, phoneId: string): WaMsg[] {
  const out: WaMsg[] = [];
  for (const e of payload?.entry ?? []) for (const ch of e?.changes ?? []) {
    if (ch?.field !== 'messages') continue;
    const v = ch.value ?? {}, to = v.metadata?.phone_number_id ? String(v.metadata.phone_number_id) : undefined;
    if (phoneId && to && to !== phoneId && String(e?.id ?? '') !== phoneId) continue;
    for (const m of v.messages ?? []) {
      const from = String(m?.from ?? '');
      if (!m?.id || !/^\d{6,20}$/.test(from)) continue;
      const text = m.type === 'text' ? m.text?.body
        : m.type === 'button' ? m.button?.text
        : m.type === 'interactive' ? (m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title) : undefined;
      out.push({ id: String(m.id), from, type: String(m.type), text: typeof text === 'string' ? text.slice(0, 2000) : undefined, audioId: m.type === 'audio' ? m.audio?.id : undefined, to, waba: e?.id ? String(e.id) : undefined });
    }
  }
  return out;
}
const kindOf = (t: string): Incoming['kind'] =>
  t === 'audio' ? 'audio' : t === 'text' || t === 'button' || t === 'interactive' ? 'text' : t === 'image' || t === 'document' || t === 'video' ? 'image' : 'other';

// Responde pelo mesmo número que recebeu (from); sem ele, pelo número do robô
export async function sendText(d: HandlerDeps, to: string, body: string, from?: string) {
  const via = from || (await resolvePhone(d).catch(() => null))?.id || (isId(d.cfg.phoneId) ? d.cfg.phoneId : '');
  if (!via) { d.log?.('envio: número do robô desconhecido'); return false; }
  const r = await d.graph(`${via}/messages`, {
    method: 'POST',
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: body.slice(0, 4096), preview_url: false } }),
  });
  if (!r.ok) d.log?.('envio falhou', r.status, (await r.text()).slice(0, 300));
  return r.ok;
}
// "visto" + "digitando…" enquanto o robô pensa (se a Meta recusar o "digitando", fica só o visto)
async function markRead(d: HandlerDeps, id: string, from?: string) {
  try {
    const base = { messaging_product: 'whatsapp', status: 'read', message_id: id }, via = from || (isId(d.cfg.phoneId) ? d.cfg.phoneId : '');
    if (!via) return;
    const r = await d.graph(`${via}/messages`, { method: 'POST', body: JSON.stringify({ ...base, typing_indicator: { type: 'text' } }) });
    if (!r.ok) await d.graph(`${via}/messages`, { method: 'POST', body: JSON.stringify(base) });
  } catch { /* não impede a resposta */ }
}

async function processOne(d: HandlerDeps, m: WaMsg) {
  const seen = await d.rpc('wa_seen', { p_id: m.id, p_phone: m.from });
  if (!seen?.new) return; // a Meta reenviou: já foi tratada
  await markRead(d, m.id, m.to);
  let reply: string | null;
  try {
    reply = await d.bot({ phone: m.from, kind: kindOf(m.type), text: m.text, audioId: m.audioId, lastHour: Number(seen.last_hour) || 1 });
  } catch (e) {
    d.log?.('robô falhou', e instanceof Error ? e.message : e);
    reply = 'Tive um problema agora e não consegui terminar. Tente de novo em instantes.';
  }
  if (reply) await sendText(d, m.from, reply, m.to);
}

// Número do robô. O WHATSAPP_PHONE_ID salvo pode estar errado (é comum colar o ID da conta do WhatsApp ou outro valor
// da Meta): o robô descobre o número pela conta ou pelo próprio token, uma vez por instância, e funciona assim mesmo;
// a ativação diz ao dono qual ID colocar. Valor que não é ID (só algarismos) nunca vai para a Meta nem para os registros.
type Phone = { id: string; number: string; name: string; waba?: string; how: 'configurado' | 'conta' | 'token' };
const phoneCache = new Map<string, Phone>();
export const resetPhoneCache = () => phoneCache.clear(); // testes
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const isId = (v: unknown): v is string => typeof v === 'string' && /^\d{1,20}$/.test(v); // só algarismos: seguro mandar para a Meta
const phoneOf = (n: any, how: Phone['how'], waba?: string): Phone => ({ id: String(n.id), number: digits(n.display_phone_number), name: String(n.verified_name ?? ''), waba, how });
// Números que o token enxerga: contas do WhatsApp liberadas para ele → números de cada conta
async function phonesOfToken(d: HandlerDeps): Promise<Phone[]> {
  const c = d.cfg, appId = String((await gj(d, 'app')).id ?? '');
  const dbg = (await gj(d, `debug_token?input_token=${encodeURIComponent(c.token)}`, undefined, `${appId}|${c.appSecret}`)).data ?? {};
  const wabas = [...new Set<string>([c.wabaId, ...(dbg.granular_scopes ?? []).filter((g: any) => /^whatsapp_business_(management|messaging)$/.test(String(g?.scope)))
    .flatMap((g: any) => g?.target_ids ?? [])].map(String).filter(isId))];
  const out = new Map<string, Phone>();
  for (const w of wabas.slice(0, 5)) for (const n of (await gj(d, `${w}/phone_numbers?fields=id,display_phone_number,verified_name`)).data ?? []) if (!out.has(String(n.id))) out.set(String(n.id), phoneOf(n, 'token', w));
  return [...out.values()];
}
export async function resolvePhone(d: HandlerDeps): Promise<Phone> {
  const c = d.cfg, key = c.phoneId || '-', hit = phoneCache.get(key);
  if (hit) return hit;
  let ph: Phone | null = null;
  if (isId(c.phoneId)) {
    try { ph = phoneOf({ ...(await gj(d, `${c.phoneId}?fields=display_phone_number,verified_name`)), id: c.phoneId }, 'configurado', c.wabaId || undefined); }
    catch (e) {
      if (e instanceof GraphError && (/appsecret_proof/i.test(e.message) || e.code === 190)) throw e; // chave ou token: o problema é outro
      if (e instanceof GraphError && /nonexisting field/i.test(e.message)) { // o ID salvo é o da conta do WhatsApp?
        const list: any[] = await gj(d, `${c.phoneId}/phone_numbers?fields=id,display_phone_number,verified_name`).then((r) => r.data ?? []).catch(() => []);
        if (list.length === 1) ph = phoneOf(list[0], 'conta', c.phoneId);
      }
    }
  }
  if (!ph) {
    let list: Phone[];
    try { list = await phonesOfToken(d); }
    catch (e) { throw Object.assign(new GraphError(`descoberta: ${e instanceof Error ? e.message : e}`, -3), { list: [] }); }
    if (list.length !== 1) throw Object.assign(new GraphError(list.length ? 'vários números' : 'nenhum número', -2), { list });
    ph = list[0];
  }
  if (ph.how !== 'configurado') d.log?.('WHATSAPP_PHONE_ID não é o ID do número; usando', ph.id, `(${ph.how})`);
  phoneCache.set(key, ph);
  return ph;
}
// Que tipo de valor está no WHATSAPP_PHONE_ID (para o aviso do dono; nunca mostra o valor)
const phoneIdHint = (c: Cfg) => !c.phoneId ? 'O WHATSAPP_PHONE_ID está vazio.'
  : c.phoneId === c.appSecret ? 'No WHATSAPP_PHONE_ID foi colada a chave secreta do app, e não o ID do número.'
  : c.phoneId === c.token ? 'No WHATSAPP_PHONE_ID foi colado o token, e não o ID do número.'
  : c.phoneId === c.verifyToken ? 'No WHATSAPP_PHONE_ID foi colado o token de verificação, e não o ID do número.'
  : !isId(c.phoneId) ? 'O WHATSAPP_PHONE_ID salvo não é um ID (o ID do número só tem algarismos).'
  : 'O WHATSAPP_PHONE_ID salvo não é o ID do número.';
// Quais números/contas este robô atende (vazio = não deu para conferir: aceita, a assinatura já garante que é do nosso app)
async function allowedIds(d: HandlerDeps) {
  const ids = new Set<string>();
  for (const v of [d.cfg.phoneId, d.cfg.wabaId]) if (isId(v)) ids.add(v);
  try { const ph = await resolvePhone(d); ids.add(ph.id); if (ph.waba) ids.add(ph.waba); } catch { return new Set<string>(); }
  return ids;
}
async function botNumber(d: HandlerDeps) {
  try { return (await resolvePhone(d)).number; } catch { return ''; }
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
  fix?: { meta?: string; secrets?: string }; // onde o dono corrige (links diretos)
  phoneId?: string; phones?: { id: string; number: string; name: string }[];
};
class GraphError extends Error { code?: number; constructor(msg: string, code?: number) { super(msg); this.code = code; } }
async function gj(d: HandlerDeps, path: string, init?: RequestInit, token?: string, proof = true) {
  const r = await d.graph(path, init, token, proof);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new GraphError(String(j?.error?.message ?? 'HTTP ' + r.status), Number(j?.error?.code) || undefined);
  return j;
}
function explain(e: unknown, step: string) {
  if (!(e instanceof GraphError)) return `Não consegui falar com a Meta (${step}). Tente de novo em instantes.`;
  const m = e.message.toLowerCase();
  if (m.includes('appsecret_proof') || m.includes('client secret')) return 'A chave secreta do app (WHATSAPP_APP_SECRET) não confere com o app da Meta.';
  if (e.code === 190) return 'O token do WhatsApp (WHATSAPP_TOKEN) não vale mais: gere outro no usuário do sistema da Meta e troque no Supabase.';
  if (e.code === 10 || (e.code ?? 0) >= 200 && (e.code ?? 0) < 300) return `O token não tem permissão para ${step} (precisa de whatsapp_business_management e whatsapp_business_messaging).`;
  if (step === 'ler o número') return 'O WHATSAPP_PHONE_ID não é um número desta conta do WhatsApp: confira o "Identificação do número de telefone" na Meta.';
  return `A Meta recusou ${step}: ${e.message}`;
}
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const secretsPage = (c: Cfg) => {
  try { return `https://supabase.com/dashboard/project/${new URL(c.selfUrl ?? '').hostname.split('.')[0]}/functions/secrets`; } catch { return undefined; }
};
// A Meta recusou a prova da chave secreta: descobre de qual app é o token (sem a prova, só leitura) e se a chave
// salva é desse app — para dizer ao dono exatamente o que trocar e onde. Nunca mostra a chave.
async function secretHelp(d: HandlerDeps): Promise<Pick<SetupReport, 'message' | 'fix'>> {
  const c = d.cfg, s = c.appSecret;
  const shape = /^\d{10,20}$/.test(s) ? ' O valor salvo parece o ID do app, não a chave secreta.'
    : !/^[0-9a-f]{32}$/i.test(s) ? ' O valor salvo não tem o formato da chave secreta (32 letras e números).' : '';
  let app: { id?: string; name?: string } | null = null;
  try { app = await gj(d, 'app?fields=id,name', undefined, undefined, false); } catch { /* o app exige a prova em toda chamada */ }
  const fix = { secrets: secretsPage(c) } as SetupReport['fix'] & object;
  if (!app?.id || !/^\d+$/.test(String(app.id))) {
    return { message: `A chave secreta do app (WHATSAPP_APP_SECRET) não confere com o token do WhatsApp (WHATSAPP_TOKEN).${shape} Os dois precisam ser do mesmo app na Meta.`, fix };
  }
  const id = String(app.id), name = String(app.name ?? 'Meu Caixa').slice(0, 60);
  fix.meta = `https://developers.facebook.com/apps/${id}/settings/basic/`;
  let mine = false;
  try { await gj(d, `${id}?fields=id`, undefined, `${id}|${s}`, false); mine = true; } catch { /* chave de outro app ou errada */ }
  d.log?.('ativação: chave secreta', JSON.stringify({ app: id, name, mesmoApp: mine, formato: shape ? 'estranho' : 'ok' })); // sem a chave
  if (mine) return { message: `A chave secreta (WHATSAPP_APP_SECRET) é do app "${name}", mas a Meta recusou a prova feita com o token (WHATSAPP_TOKEN). Gere um token novo no usuário do sistema para esse app e troque no Supabase.`, fix };
  return {
    message: `A chave secreta salva no Supabase (WHATSAPP_APP_SECRET) não é a do app "${name}" na Meta.${shape} `
      + 'Copie a "Chave secreta do aplicativo" (Configurações do app → Básico → Mostrar) e cole no lugar dela nos segredos do Supabase.',
    fix,
  };
}

export async function setupMeta(d: HandlerDeps): Promise<SetupReport> {
  const c = d.cfg;
  const missing = ([['WHATSAPP_TOKEN', c.token], ['WHATSAPP_APP_SECRET', c.appSecret], ['WHATSAPP_VERIFY_TOKEN', c.verifyToken]] as const)
    .filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return { ok: false, message: `Faltam segredos no Supabase (Edge Functions → Secrets): ${missing.join(', ')}.` };
  if (!c.selfUrl) return { ok: false, message: 'A função não sabe o próprio endereço (SUPABASE_URL).' };
  const rep: SetupReport = { ok: false, message: '' };
  let step = 'ler o número', ph: Phone | null = null;
  try {
    ph = await resolvePhone(d);
    rep.number = ph.number || null;
    rep.name = ph.name || null;
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
    let waba = c.wabaId || ph.waba || (ids.length === 1 ? ids[0] : '');
    for (const w of waba ? [] : ids) {
      const nums: any[] = (await gj(d, `${w}/phone_numbers?fields=id`)).data ?? [];
      if (nums.some((n) => String(n?.id) === ph!.id)) { waba = w; break; }
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
    if (ph.how !== 'configurado') {
      rep.phoneId = ph.id; rep.fix = { secrets: secretsPage(c) };
      rep.message += ` ${phoneIdHint(c)} Já estou usando o número da sua conta (+${ph.number}); para deixar definitivo, troque esse segredo pelo ID do número: ${ph.id}.`;
    }
  } catch (e) {
    d.log?.('ativação na Meta', step, e instanceof Error ? e.message : e);
    if (e instanceof GraphError && /appsecret_proof/i.test(e.message)) Object.assign(rep, await secretHelp(d));
    else if (e instanceof GraphError && (e.code === -2 || e.code === -3)) Object.assign(rep, await phoneHelp(d, e));
    else rep.message = explain(e, step);
  }
  return rep;
}
// Não deu para escolher o número sozinho: diz quais existem (ou onde copiar) e o tipo de valor que está salvo
async function phoneHelp(d: HandlerDeps, e: GraphError): Promise<Pick<SetupReport, 'message' | 'fix' | 'phones'>> {
  const c = d.cfg, fix = { secrets: secretsPage(c) };
  const phones = ((e as any).list ?? []).slice(0, 5).map((p: Phone) => ({ id: p.id, number: p.number, name: p.name }));
  d.log?.('ativação: números encontrados', JSON.stringify(phones)); // IDs e números do robô (nada secreto)
  const list = phones.map((p: any) => `${p.id} (+${p.number}${p.name ? ', ' + p.name : ''})`).join('; ');
  return {
    message: `${phoneIdHint(c)} ` + (phones.length > 1 ? `Sua conta tem mais de um número; coloque no WHATSAPP_PHONE_ID o ID do número do robô: ${list}.`
      : 'Copie a "Identificação do número de telefone" em WhatsApp → Configuração da API, na Meta, e cole no WHATSAPP_PHONE_ID.'),
    fix, phones,
  };
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
      return new Response(JSON.stringify({ db, configured: !!(c.token && c.appSecret && c.verifyToken) }), { headers: { 'Content-Type': 'application/json' } });
    }
    // o app pergunta se o robô está pronto e qual número abrir
    if (url.searchParams.has('info')) {
      const ready = !!(c.token && c.appSecret && c.verifyToken);
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
  const msgs = messagesOf(payload, '');
  const work = (async () => {
    let allow: Set<string> | null = null;
    for (const m of msgs) {
      const direct = (!!m.to && m.to === c.phoneId) || (!!m.waba && (m.waba === c.phoneId || m.waba === c.wabaId));
      if (!direct) { allow ??= await allowedIds(d); if (allow.size && !allow.has(m.to ?? '') && !allow.has(m.waba ?? '')) continue; } // outro número da Meta
      try { await processOne(d, m); } catch (e) { d.log?.('mensagem falhou', m.id, e instanceof Error ? e.message : e); }
    }
    if (msgs.length && d.housekeeping && (d.random ?? Math.random)() < 0.02) {
      try { await d.housekeeping(); } catch (e) { d.log?.('limpeza falhou', e instanceof Error ? e.message : e); }
    }
  })();
  if (d.waitUntil) d.waitUntil(work); else await work;
  return new Response('ok', { status: 200 });
}
