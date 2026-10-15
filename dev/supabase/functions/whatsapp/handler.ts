// Meu Caixa — porta de entrada do robô do WhatsApp: confere que a mensagem veio mesmo da Meta (assinatura),
// ignora repetidas, chama o robô e manda a resposta. Também responde ao teste de cadastro do webhook da Meta,
// diz ao app se o robô está pronto para os clientes (e qual é o número dele) e, a pedido do dono pelo app, ativa
// e confere o robô na Meta (webhook do app, inscrição da conta do WhatsApp e ativação do número com PIN).
// O número do robô é descoberto sozinho (o conectado da conta); o WhatsApp de atendimento do dono nunca é usado.
// Pelo app (?app), o usuário logado manda o mesmo que mandaria no WhatsApp: texto, áudio ou foto do comprovante.
import type { Incoming } from './bot.ts';
import { IMAGE_TYPES, MAX_IMAGE } from './receipt.ts';

export type Cfg = {
  verifyToken: string; appSecret: string; phoneId: string; token: string; apiVersion: string; allowed: string[];
  selfUrl?: string;            // endereço público desta função (o webhook cadastrado na Meta)
  wabaId?: string;             // conta do WhatsApp (opcional: sem ele, descobre pelo token)
  protectedNumbers?: string[]; // números que o robô nunca usa (ex.: o WhatsApp de atendimento, que fica no celular)
};
export type HandlerDeps = {
  cfg: Cfg;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<any>;
  bot: (m: Incoming) => Promise<string | null>;
  graph: (path: string, init?: RequestInit, token?: string, proof?: boolean) => Promise<Response>; // API da Meta (token do robô ou outro; proof=false só no diagnóstico)
  isAdmin?: (jwt: string) => Promise<boolean>;                  // login do app é do dono/admin?
  userOf?: (jwt: string) => Promise<string | null>;             // login do app → id do usuário (null = inválido)
  assist?: (uid: string, input: AppInput) => Promise<AppResult>; // o robô atendendo pelo app
  lastInbound?: () => Promise<string | null>;                   // quando chegou a última mensagem (prova de que o robô recebe)
  waitUntil?: (p: Promise<unknown>) => void;                    // termina o trabalho depois de responder 200 à Meta
  housekeeping?: () => Promise<unknown>;                        // limpeza leve, de vez em quando (1 a cada 50 avisos)
  random?: () => number;                                        // só para o teste forçar a limpeza
  log?: (...a: unknown[]) => void;
};
// o que o app manda (o mesmo que daria para mandar no WhatsApp) e o que volta
export type AppInput = { text: string; audio?: { data: string; mime: string }; image?: { data: string; mime: string }; noAI: boolean };
export type AppResult = { reply: string | null; handled: boolean; heard?: string; tx?: Record<string, unknown> | null; removed?: string | null };
// to = número que recebeu; waba = conta; mediaId/mime = áudio, foto ou documento
export type WaMsg = { id: string; from: string; type: string; text?: string; audioId?: string; mediaId?: string; mime?: string; to?: string; waba?: string };

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
      const media = m.type === 'image' ? m.image : m.type === 'document' ? m.document : m.type === 'audio' ? m.audio : undefined;
      const text = m.type === 'text' ? m.text?.body
        : m.type === 'button' ? m.button?.text
        : m.type === 'interactive' ? (m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title)
        : media?.caption; // legenda da foto ou do documento
      out.push({
        id: String(m.id), from, type: String(m.type), text: typeof text === 'string' ? text.slice(0, 2000) : undefined,
        audioId: m.type === 'audio' ? m.audio?.id : undefined, mediaId: media?.id ? String(media.id) : undefined,
        mime: typeof media?.mime_type === 'string' ? media.mime_type.slice(0, 80) : undefined, to, waba: e?.id ? String(e.id) : undefined,
      });
    }
  }
  return out;
}
// foto ou imagem mandada como documento = comprovante; outro documento (PDF…) = doc; vídeo, figurinha etc. = other
export const kindOf = (t: string, mime?: string): Incoming['kind'] =>
  t === 'audio' ? 'audio' : t === 'text' || t === 'button' || t === 'interactive' ? 'text' : t === 'image' ? 'image'
  : t === 'document' ? (/^image\//i.test(mime ?? '') ? 'image' : 'doc') : 'other';

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
    reply = await d.bot({ phone: m.from, kind: kindOf(m.type, m.mime), text: m.text, audioId: m.audioId, mediaId: m.mediaId, lastHour: Number(seen.last_hour) || 1 });
  } catch (e) {
    d.log?.('robô falhou', e instanceof Error ? e.message : e);
    reply = 'Tive um problema agora e não consegui terminar. Tente de novo em instantes.';
  }
  if (reply) await sendText(d, m.from, reply, m.to);
}

// ---------- pelo app: entrada conferida e limite por usuário ----------
export const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/x-m4a', 'audio/m4a'];
export const MAX_AUDIO = 4 * 1024 * 1024; // ~4 min de voz em opus/aac
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
function media(v: any, types: string[], max: number) {
  if (!v || typeof v !== 'object') return undefined;
  const mime = String(v.mime ?? '').split(';')[0].trim().toLowerCase(), data = String(v.data ?? '');
  if (!types.includes(mime) || !data || !B64.test(data)) return null;
  if (Math.floor(data.length * 3 / 4) > max) return 'grande' as const;
  return { mime, data };
}
// null = pedido inválido; 'grande' = arquivo acima do limite
export function appInput(body: any): AppInput | null | 'grande' {
  if (!body || typeof body !== 'object') return null;
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, 1000) : '';
  const audio = media(body.audio, AUDIO_TYPES, MAX_AUDIO), image = media(body.image, IMAGE_TYPES, MAX_IMAGE);
  if (audio === null || image === null || (audio && image)) return null;
  if (audio === 'grande' || image === 'grande') return 'grande';
  if (!text && !audio && !image) return null;
  return { text, ...(audio ? { audio } : {}), ...(image ? { image } : {}), noAI: body.noAI === true };
}
const hits = new Map<string, number[]>();
function limited(uid: string, max = 20) { // até 20 pedidos por minuto por usuário (por instância)
  const now = Date.now(), list = (hits.get(uid) ?? []).filter((t) => now - t < 60e3);
  list.push(now); hits.set(uid, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

// ---------- Meta: chamadas e erros ----------
class GraphError extends Error { code?: number; constructor(msg: string, code?: number) { super(msg); this.code = code; } }
async function gj(d: HandlerDeps, path: string, init?: RequestInit, token?: string, proof = true) {
  const r = await d.graph(path, init, token, proof);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new GraphError(String(j?.error?.message ?? 'HTTP ' + r.status), Number(j?.error?.code) || undefined);
  return j;
}
const credentialError = (e: unknown) => e instanceof GraphError && (/appsecret_proof/i.test(e.message) || e.code === 190);

// ---------- número do robô ----------
// Descobre os números que o token enxerga (contas do WhatsApp liberadas → números, com o estado de cada um) e escolhe:
// o configurado (se estiver conectado ou for o único jeito), senão o único conectado, senão o único que houver.
// Números protegidos (o WhatsApp de atendimento, que fica no celular) nunca são usados.
// Valor que não é ID (só algarismos) nunca vai para a Meta nem para os registros.
type Phone = {
  id: string; number: string; name: string; waba?: string; how: 'configurado' | 'conta' | 'token' | 'trocado';
  status?: string; platform?: string; mode?: string; verify?: string;
};
type Waba = { id: string; name: string; numbers: number };
type Found = { phones: Phone[]; wabas: Waba[]; listed: boolean; dbg: any };
type Robot = { ph: Phone; all: Phone[]; wabas: Waba[]; dbg: any | null };
const TTL = 10 * 60e3; // a escolha vale 10 minutos (número novo ativado aparece sozinho)
let robotCache: { key: string; at: number; v: Robot } | null = null;
let infoCache: { at: number; v: RobotInfo } | null = null;
let APP_ID = '';
const PROTECTED_IDS = new Set<string>();
export const resetPhoneCache = () => { robotCache = null; infoCache = null; APP_ID = ''; PROTECTED_IDS.clear(); }; // testes e depois de ativar

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const isId = (v: unknown): v is string => typeof v === 'string' && /^\d{1,20}$/.test(v); // só algarismos: seguro mandar para a Meta
const up = (v: unknown) => v === null || v === undefined || v === '' ? undefined : String(v).toUpperCase().replace(/[^A-Z_]/g, '').slice(0, 30) || undefined;
const phoneOf = (n: any, how: Phone['how'], waba?: string): Phone => ({
  id: String(n.id), number: digits(n.display_phone_number), name: String(n.verified_name ?? '').slice(0, 80), waba, how,
  status: up(n.status), platform: up(n.platform_type), mode: up(n.account_mode), verify: up(n.code_verification_status),
});
const isLive = (p: Phone) => p.status === 'CONNECTED' && (!p.platform || p.platform === 'CLOUD_API');
const isProtected = (c: Cfg, p: Phone) => !!p.number && (c.protectedNumbers ?? []).includes(p.number);
const STATE_FIELDS = 'display_phone_number,verified_name,status,platform_type,account_mode,code_verification_status';
const BASIC_FIELDS = 'display_phone_number,verified_name';
const fieldMissing = (e: unknown, f?: string) => e instanceof GraphError && /nonexisting field/i.test(e.message) && (!f || e.message.includes(f));

async function appIdOf(d: HandlerDeps) {
  if (!APP_ID) {
    const id = String((await gj(d, 'app')).id ?? '');
    if (!/^\d+$/.test(id)) throw new GraphError('app sem id');
    APP_ID = id;
  }
  return APP_ID;
}
// números de uma conta do WhatsApp, com o estado (se a Meta não tiver algum campo, pede só o básico)
async function numbersOf(d: HandlerDeps, waba: string): Promise<any[]> {
  try { return (await gj(d, `${waba}/phone_numbers?fields=id,${STATE_FIELDS}`)).data ?? []; }
  catch (e) { if (fieldMissing(e) && !fieldMissing(e, 'phone_numbers')) return (await gj(d, `${waba}/phone_numbers?fields=id,${BASIC_FIELDS}`)).data ?? []; throw e; }
}
async function discover(d: HandlerDeps): Promise<Found> {
  const c = d.cfg, appId = await appIdOf(d);
  const dbg = (await gj(d, `debug_token?input_token=${encodeURIComponent(c.token)}`, undefined, `${appId}|${c.appSecret}`)).data ?? {};
  const scopes: any[] = dbg.granular_scopes ?? [];
  const ids = [...new Set<string>([c.wabaId, ...scopes.filter((g) => /^whatsapp_business_(management|messaging)$/.test(String(g?.scope)))
    .flatMap((g) => g?.target_ids ?? [])].map(String).filter(isId))];
  const names = new Map<string, string>();
  let listed = true;
  if (!ids.length) {
    // permissão sem lista de contas (vale para as contas atribuídas ao usuário do sistema): pergunta quais são
    const got: any[] | null = await gj(d, 'me/assigned_whatsapp_business_accounts?fields=id,name').then((r) => r.data ?? []).catch(() => null);
    if (got === null) listed = false;
    for (const w of got ?? []) if (isId(String(w?.id))) { ids.push(String(w.id)); names.set(String(w.id), String(w.name ?? '')); }
  }
  const out = new Map<string, Phone>(), wabas: Waba[] = [];
  for (const w of ids.slice(0, 5)) {
    const name = names.get(w) || await gj(d, `${w}?fields=name`).then((r) => String(r.name ?? '')).catch(() => '');
    const nums = await numbersOf(d, w);
    wabas.push({ id: w, name, numbers: nums.length });
    for (const n of nums) if (!out.has(String(n.id))) out.set(String(n.id), phoneOf(n, 'token', w));
  }
  const phones = [...out.values()];
  for (const p of phones) if (isProtected(c, p)) PROTECTED_IDS.add(p.id);
  // o que o token enxerga (só IDs, nomes, números do robô e estados; nada secreto) — para o diagnóstico
  d.log?.('ativação: token', JSON.stringify({
    tipo: dbg.type, escopos: scopes.map((g) => `${g?.scope}:${Array.isArray(g?.target_ids) ? g.target_ids.length : 'todos'}`), contas: wabas, listou: listed,
    numeros: phones.map((p) => ({ id: p.id, numero: p.number, estado: p.status, plataforma: p.platform, modo: p.mode, verificacao: p.verify, protegido: isProtected(c, p) })),
  }));
  return { phones, wabas, listed, dbg };
}
// o ID salvo no WHATSAPP_PHONE_ID, quando não veio na descoberta (ou ela falhou)
async function configuredPhone(d: HandlerDeps): Promise<Phone | null> {
  const c = d.cfg;
  if (!isId(c.phoneId)) return null;
  try {
    let n: any;
    try { n = await gj(d, `${c.phoneId}?fields=${STATE_FIELDS}`); }
    catch (e) { if (fieldMissing(e) && !fieldMissing(e, 'display_phone_number')) n = await gj(d, `${c.phoneId}?fields=${BASIC_FIELDS}`); else throw e; }
    return phoneOf({ ...n, id: c.phoneId }, 'configurado', c.wabaId || undefined);
  } catch (e) {
    if (credentialError(e)) throw e; // chave ou token: o problema é outro
    if (fieldMissing(e, 'display_phone_number')) { // o ID salvo é o da conta do WhatsApp?
      const list = await numbersOf(d, c.phoneId).catch(() => []);
      if (list.length === 1) return phoneOf(list[0], 'conta', c.phoneId);
    }
    return null;
  }
}
async function robot(d: HandlerDeps, fresh = false): Promise<Robot> {
  const c = d.cfg, key = c.phoneId || '-';
  if (!fresh && robotCache && robotCache.key === key && Date.now() - robotCache.at < TTL) return robotCache.v;
  let found: Found | null = null;
  try { found = await discover(d); } catch (e) {
    if (credentialError(e)) throw e;
    d.log?.('descoberta dos números falhou', e instanceof Error ? e.message : e);
  }
  const all = found?.phones ?? [], usable = all.filter((p) => !isProtected(c, p));
  let conf: Phone | null = null;
  if (isId(c.phoneId)) {
    const hit = all.find((p) => p.id === c.phoneId);
    conf = hit ? { ...hit, how: 'configurado' } : await configuredPhone(d);
    if (conf && isProtected(c, conf)) { PROTECTED_IDS.add(conf.id); conf = null; }
  }
  const live = usable.filter(isLive);
  let ph: Phone | null = null;
  if (conf && (isLive(conf) || !conf.status || !live.length)) ph = conf;
  else if (live.length === 1) ph = { ...live[0], how: conf ? 'trocado' : live[0].how };
  else if (!conf && usable.length === 1) ph = usable[0];
  if (!ph) {
    throw Object.assign(new GraphError(usable.length > 1 ? 'vários números' : 'nenhum número', found?.listed ? -2 : -3),
      { list: usable, wabas: found?.wabas ?? [], guarded: all.filter((p) => isProtected(c, p)) });
  }
  if (ph.how !== 'configurado') d.log?.('número do robô escolhido', ph.id, `(${ph.how})`);
  const v: Robot = { ph, all, wabas: found?.wabas ?? [], dbg: found?.dbg ?? null };
  robotCache = { key, at: Date.now(), v };
  return v;
}
export async function resolvePhone(d: HandlerDeps): Promise<Phone> {
  return (await robot(d)).ph;
}

// ---------- pronto para os clientes? ----------
export type RobotInfo = { configured: boolean; ready: boolean; number: string | null };
async function webhookOk(d: HandlerDeps, appId: string) {
  const subs: any[] = (await gj(d, `${appId}/subscriptions`, undefined, `${appId}|${d.cfg.appSecret}`)).data ?? [];
  const sub = subs.find((s) => s?.object === 'whatsapp_business_account');
  return !!sub && sub.active !== false && sub.callback_url === d.cfg.selfUrl && (sub.fields ?? []).some((f: any) => (f?.name ?? f) === 'messages');
}
async function wabaOk(d: HandlerDeps, waba: string, appId: string) {
  const apps: any[] = (await gj(d, `${waba}/subscribed_apps`)).data ?? [];
  return apps.some((a) => String(a?.whatsapp_business_api_data?.id ?? a?.id ?? '') === appId);
}
// Pronto = número conectado na API (não de teste) e mensagens chegando: confirmado por mensagem recebida nos
// últimos 7 dias ou pelo webhook e pela conta inscritos no app. Na dúvida, não está pronto (o cliente não vê o robô).
async function readyCheck(d: HandlerDeps, ph: Phone) {
  if (ph.mode === 'SANDBOX' || (ph.status && !isLive(ph))) return false;
  const last = d.lastInbound ? await d.lastInbound().catch(() => null) : null;
  if (last && Date.now() - Date.parse(last) < 7 * 864e5) return true;
  if (!ph.status || !ph.waba || !d.cfg.selfUrl) return false;
  try { const appId = await appIdOf(d); return await webhookOk(d, appId) && await wabaOk(d, ph.waba, appId); } catch { return false; }
}
async function robotInfo(d: HandlerDeps): Promise<RobotInfo> {
  if (infoCache && Date.now() - infoCache.at < TTL) return infoCache.v;
  const c = d.cfg;
  let v: RobotInfo = { configured: false, ready: false, number: null };
  if (c.token && c.appSecret && c.verifyToken) {
    const ph = await resolvePhone(d).catch(() => null);
    if (ph) v = { configured: true, ready: await readyCheck(d, ph), number: ph.number || null };
  }
  infoCache = { at: Date.now(), v };
  return v;
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
export type NumberView = { id: string; number: string; name: string; state: string; robot: boolean };
export type SetupReport = {
  ok: boolean; message: string; number?: string | null; name?: string | null;
  webhook?: 'ok' | 'ativado'; waba?: 'ok' | 'ativado' | 'desconhecido'; tokenExpires?: string | null;
  fix?: { meta?: string; metaLabel?: string; secrets?: string }; // onde o dono corrige (links diretos)
  phoneId?: string; phones?: { id: string; number: string; name: string }[];
  numbers?: NumberView[];                 // números da conta, com o estado de cada um
  register?: { id: string; number: string }; // número que dá para ativar com um PIN pelo app
  attention?: boolean;                    // ativo na Meta, mas ainda não atende os clientes
  ready?: boolean;                        // os clientes já podem conectar
};
const BUSINESS_USERS = 'https://business.facebook.com/settings/system-users';
const waManager = (biz?: string, waba?: string) => {
  const q = new URLSearchParams();
  if (biz && isId(biz)) q.set('business_id', biz);
  if (waba && isId(waba)) q.set('asset_id', waba);
  const qs = q.toString();
  return `https://business.facebook.com/latest/whatsapp_manager/phone_numbers${qs ? '?' + qs : ''}`;
};
const STATE: Record<string, string> = {
  CONNECTED: 'conectado', PENDING: 'aguardando ativação', DISCONNECTED: 'offline', OFFLINE: 'offline', UNVERIFIED: 'não confirmado',
  FLAGGED: 'com alerta da Meta', RESTRICTED: 'restrito pela Meta', RATE_LIMITED: 'limitado pela Meta', BANNED: 'bloqueado pela Meta',
  DELETED: 'apagado', MIGRATED: 'migrado', UNKNOWN: 'desconhecido',
};
const stateOf = (c: Cfg, p: Phone) => isProtected(c, p) ? 'seu atendimento (fica no celular)'
  : p.mode === 'SANDBOX' ? 'número de teste da Meta'
  : p.platform && p.platform !== 'CLOUD_API' ? 'fora da API do WhatsApp'
  : p.status ? STATE[p.status] ?? p.status.toLowerCase() : '';
const viewOf = (c: Cfg, list: Phone[], robotId?: string): NumberView[] =>
  list.slice(0, 6).map((p) => ({ id: p.id, number: p.number, name: p.name, state: stateOf(c, p), robot: p.id === robotId }));
const label = (p: Phone) => `+${p.number}${p.name ? ` (${p.name})` : ''}`;
// caminhos da tela atual da Meta (Meta Business Suite, em português de Portugal no painel do dono)
const ADD_NUMBER = 'No Gestor do WhatsApp → Números de telemóvel → Adicionar número de telemóvel, cadastre um chip que não tenha WhatsApp instalado (nome "Meu Caixa"); se o botão estiver cinza, aceite antes os Termos de Serviço no aviso do topo. Depois toque em Conferir de novo.';

function explain(e: unknown, step: string) {
  if (!(e instanceof GraphError)) return `Não consegui falar com a Meta (${step}). Tente de novo em instantes.`;
  const m = e.message.toLowerCase();
  if (m.includes('appsecret_proof') || m.includes('client secret')) return 'A chave secreta do app (WHATSAPP_APP_SECRET) não confere com o app da Meta.';
  if (e.code === 190) return 'O token do WhatsApp (WHATSAPP_TOKEN) não vale mais: gere outro no usuário do sistema da Meta e troque no Supabase.';
  if (e.code === 10 || (e.code ?? 0) >= 200 && (e.code ?? 0) < 300) return `O token não tem permissão para ${step} (precisa de whatsapp_business_management e whatsapp_business_messaging).`;
  if (step === 'ler o número') return 'O WHATSAPP_PHONE_ID não é um número desta conta do WhatsApp: confira a "Identificação do número de telemóvel" no Gestor do WhatsApp → Números de telemóvel.';
  return `A Meta recusou ${step}: ${e.message.slice(0, 200)}`;
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
  infoCache = null;
  const rep: SetupReport = { ok: false, message: '' };
  let step = 'ler o número';
  try {
    const R = await robot(d, true), ph = R.ph;
    rep.number = ph.number || null;
    rep.name = ph.name || null;
    rep.numbers = viewOf(c, R.all.length ? R.all : [ph], ph.id);
    step = 'identificar o app';
    const appId = await appIdOf(d);
    const appToken = `${appId}|${c.appSecret}`;
    step = 'conferir o token';
    const dbg = R.dbg ?? (await gj(d, `debug_token?input_token=${encodeURIComponent(c.token)}`, undefined, appToken)).data ?? {};
    if (dbg.is_valid === false) throw new GraphError('token inválido', 190);
    const exp = Number(dbg.expires_at) || 0;
    rep.tokenExpires = exp > 0 ? new Date(exp * 1000).toISOString() : null;
    // webhook do app: este endereço, campo "messages"
    step = 'ler o webhook';
    if (await webhookOk(d, appId)) rep.webhook = 'ok';
    else {
      step = 'ativar o webhook';
      const q = new URLSearchParams({ object: 'whatsapp_business_account', callback_url: c.selfUrl, verify_token: c.verifyToken, fields: 'messages', include_values: 'true' });
      if ((await gj(d, `${appId}/subscriptions?${q}`, { method: 'POST' }, appToken)).success !== true) throw new GraphError('webhook não confirmado');
      rep.webhook = 'ativado';
    }
    // conta do WhatsApp inscrita no app (sem isso as mensagens não chegam)
    step = 'ligar a conta do WhatsApp ao app';
    const ids = [...new Set<string>((dbg.granular_scopes ?? []).filter((g: any) => /^whatsapp_business_(management|messaging)$/.test(String(g?.scope)))
      .flatMap((g: any) => g?.target_ids ?? []).map(String).filter(isId))];
    let waba = ph.waba || c.wabaId || (ids.length === 1 ? ids[0] : '');
    for (const w of waba ? [] : ids) {
      const nums: any[] = (await gj(d, `${w}/phone_numbers?fields=id`)).data ?? [];
      if (nums.some((n) => String(n?.id) === ph.id)) { waba = w; break; }
    }
    if (!waba) rep.waba = 'desconhecido';
    else if (await wabaOk(d, waba, appId)) rep.waba = 'ok';
    else {
      if ((await gj(d, `${waba}/subscribed_apps`, { method: 'POST' })).success !== true) throw new GraphError('inscrição não confirmada');
      rep.waba = 'ativado';
    }
    rep.ok = true;
    const biz = waba ? await gj(d, `${waba}?fields=owner_business_info`).then((r) => String(r?.owner_business_info?.id ?? '')).catch(() => '') : '';
    const manager = { meta: waManager(biz, waba), metaLabel: 'Abrir o Gestor do WhatsApp' };
    const now = rep.webhook === 'ativado' || rep.waba === 'ativado' ? ' Liguei agora o robô na Meta.' : '';
    const live = isLive(ph) && ph.mode !== 'SANDBOX';
    if (ph.mode === 'SANDBOX') {
      rep.attention = true; rep.fix = manager;
      rep.message = `O robô está no número de teste da Meta (${label(ph)}): ele só conversa com até 5 números cadastrados no painel do app e não serve para os clientes. ${ADD_NUMBER}`;
    } else if (ph.status && !live) {
      rep.attention = true; rep.fix = manager;
      const st = stateOf(c, ph);
      if (ph.verify && ph.verify !== 'VERIFIED') {
        rep.message = `O número ${label(ph)} ainda não foi confirmado pela Meta (${st}). No Gestor do WhatsApp → Números de telemóvel, clique nele e confirme com o código por SMS; depois toque em Conferir de novo.`;
      } else {
        rep.register = { id: ph.id, number: ph.number };
        rep.message = `Falta ativar o número ${label(ph)} na API do WhatsApp${st && st !== 'fora da API do WhatsApp' ? ` (estado: ${st})` : ''}. Crie um PIN de 6 números abaixo e toque em Ativar número. Guarde o PIN: a Meta pede ele se o número for cadastrado de novo.`;
      }
    } else if (rep.waba === 'desconhecido') {
      rep.attention = true; rep.fix = { meta: BUSINESS_USERS, metaLabel: 'Abrir o Meta Business' };
      rep.message = `Não achei a conta do WhatsApp do número ${label(ph)}. No Meta Business: Utilizadores do sistema → seu usuário → Atribuir ativos → Contas do WhatsApp, marque a conta do número com controle total e toque em Conferir de novo.`;
    } else {
      rep.ready = !!ph.status || (d.lastInbound ? await readyCheck(d, ph) : false);
      rep.message = rep.ready
        ? `Robô pronto no número ${label(ph)}: os clientes já podem conectar o WhatsApp deles.${now}`
        : `Robô ligado na Meta no número ${label(ph)}.${now} Mande uma mensagem de outro WhatsApp para o robô para confirmar que ele responde.`;
      if (!rep.ready) rep.attention = true;
    }
    if (rep.tokenExpires) rep.message += ` Atenção: o token vence em ${ddmmyyyy(rep.tokenExpires)}; gere um que não vence (usuário do sistema).`;
    if (ph.how === 'trocado') rep.message += ` (O WHATSAPP_PHONE_ID aponta para outro número, que não está conectado; não precisa mexer: o robô usa o conectado.)`;
    else if (ph.how !== 'configurado' && c.phoneId && !PROTECTED_IDS.has(c.phoneId)) {
      rep.phoneId = ph.id;
      rep.message += ` (${phoneIdHint(c)} Não precisa mexer: o robô acha o número sozinho.)`;
    }
  } catch (e) {
    d.log?.('ativação na Meta', step, e instanceof Error ? e.message : e);
    if (e instanceof GraphError && /appsecret_proof/i.test(e.message)) Object.assign(rep, await secretHelp(d));
    else if (e instanceof GraphError && (e.code === -2 || e.code === -3)) Object.assign(rep, await phoneHelp(d, e));
    else rep.message = explain(e, step);
  }
  return rep;
}
// Que tipo de valor está no WHATSAPP_PHONE_ID (para o aviso do dono; nunca mostra o valor)
const phoneIdHint = (c: Cfg) => !c.phoneId ? 'O WHATSAPP_PHONE_ID está vazio.'
  : c.phoneId === c.appSecret ? 'No WHATSAPP_PHONE_ID foi colada a chave secreta do app, e não o ID do número.'
  : c.phoneId === c.token ? 'No WHATSAPP_PHONE_ID foi colado o token, e não o ID do número.'
  : c.phoneId === c.verifyToken ? 'No WHATSAPP_PHONE_ID foi colado o token de verificação, e não o ID do número.'
  : !isId(c.phoneId) ? 'O WHATSAPP_PHONE_ID salvo não é um ID (o ID do número só tem algarismos).'
  : 'O WHATSAPP_PHONE_ID salvo não é o ID do número.';
// Não deu para escolher o número sozinho: diz quais existem (ou onde copiar) e o que fazer
async function phoneHelp(d: HandlerDeps, e: GraphError): Promise<Pick<SetupReport, 'message' | 'fix' | 'phones' | 'numbers' | 'attention'>> {
  const c = d.cfg, fix = { secrets: secretsPage(c) };
  const list: Phone[] = (e as any).list ?? [], guarded: Phone[] = (e as any).guarded ?? [], wabas: Waba[] = (e as any).wabas ?? [];
  const phones = list.slice(0, 5).map((p) => ({ id: p.id, number: p.number, name: p.name }));
  const numbers = viewOf(c, [...guarded, ...list]);
  d.log?.('ativação: números encontrados', JSON.stringify(phones)); // IDs e números do robô (nada secreto)
  const named = wabas.map((w) => `"${w.name || w.id}"`).join(', ');
  if (list.length > 1) {
    return { message: `Sua conta tem mais de um número; coloque no WHATSAPP_PHONE_ID o ID do número do robô: ${list.map((p) => `${label(p)}, ID ${p.id}`).join('; ')}.`, fix, phones, numbers };
  }
  // só o WhatsApp de atendimento (que fica no celular): o robô precisa de um número só dele
  if (guarded.length) {
    const biz = wabas[0]?.id ? await gj(d, `${wabas[0].id}?fields=owner_business_info`).then((r) => String(r?.owner_business_info?.id ?? '')).catch(() => '') : '';
    return {
      message: `O número da sua conta do WhatsApp, ${guarded.map(label).join(', ')}, é o seu WhatsApp de atendimento, que fica no app do celular: o robô não pode usar esse número (ele responderia os seus clientes). O robô precisa de um número só dele. ${ADD_NUMBER}`,
      fix: { meta: waManager(biz, guarded[0].waba ?? wabas[0]?.id), metaLabel: 'Abrir o Gestor do WhatsApp' }, phones, numbers, attention: true,
    };
  }
  // o token vale para "todas as contas do usuário do sistema", mas nenhuma conta foi atribuída a ele: o token não muda
  if (e.code === -2 && !wabas.length) {
    return {
      message: 'Falta um passo na Meta: o usuário do sistema do token ainda não tem nenhuma conta do WhatsApp atribuída. No Meta Business: Utilizadores do sistema → seu usuário → Atribuir ativos → Contas do WhatsApp, marque a conta do número do robô com controle total e confirme. O token continua o mesmo: depois é só tocar em Conferir de novo.',
      fix: { meta: BUSINESS_USERS, metaLabel: 'Abrir o Meta Business' }, phones, numbers,
    };
  }
  if (e.code === -2) {
    return {
      message: `A conta do WhatsApp ${named} não tem nenhum número. ${ADD_NUMBER}`,
      fix: { meta: waManager(undefined, wabas[0]?.id), metaLabel: 'Abrir o Gestor do WhatsApp' }, phones, numbers,
    };
  }
  return { message: `${phoneIdHint(c)} Copie a "Identificação do número de telemóvel" (Gestor do WhatsApp → Números de telemóvel → clique no número) e cole no WHATSAPP_PHONE_ID.`, fix, phones, numbers };
}

// Ativa na API do WhatsApp um número da conta que ainda não está conectado (PIN de 6 números = verificação em duas etapas)
const REGISTER_ERR: Record<number, string> = {
  133005: 'Esse número já tem um PIN de verificação em duas etapas diferente deste. Digite o PIN que você já usa nesse número.',
  133006: 'A Meta pede para confirmar o número de novo com o código por SMS (Gestor do WhatsApp → Números de telemóvel → o número).',
  133008: 'Muitas tentativas de PIN. Espere algumas horas e tente de novo.',
  133009: 'Tentativas de PIN rápidas demais. Espere alguns minutos e tente de novo.',
  133015: 'O número foi apagado há pouco tempo. Espere uns 5 minutos e tente de novo.',
  133016: 'Muitas tentativas de cadastro desse número. Espere e tente de novo mais tarde.',
};
export async function registerNumber(d: HandlerDeps, phoneId: string, pin: string): Promise<SetupReport> {
  const c = d.cfg;
  if (!isId(phoneId)) return { ok: false, message: 'Número inválido.' };
  if (!/^\d{6}$/.test(pin)) return { ok: false, message: 'O PIN precisa ter exatamente 6 números.', register: { id: phoneId, number: '' } };
  let found: Found;
  try { found = await discover(d); } catch (e) { return { ok: false, message: explain(e, 'ler os números') }; }
  const p = found.phones.find((x) => x.id === phoneId);
  if (!p) return { ok: false, message: 'Esse número não está na sua conta do WhatsApp.' };
  if (isProtected(c, p)) return { ok: false, message: `${label(p)} é o seu WhatsApp de atendimento: o robô não ativa esse número.` };
  if (isLive(p)) { resetPhoneCache(); return setupMeta(d); }
  const r = await d.graph(`${phoneId}/register`, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', pin }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error || j?.success === false) {
    const code = Number(j?.error?.code) || 0;
    d.log?.('ativação do número recusada', phoneId, code, String(j?.error?.message ?? r.status).slice(0, 200)); // nunca o PIN
    return { ok: false, message: REGISTER_ERR[code] ?? `A Meta não ativou o número: ${String(j?.error?.error_user_msg ?? j?.error?.message ?? 'erro ' + r.status).slice(0, 200)}`, register: { id: p.id, number: p.number } };
  }
  d.log?.('número ativado na API', phoneId);
  resetPhoneCache();
  const rep = await setupMeta(d);
  rep.message = `Número ${label(p)} ativado na API do WhatsApp. ${rep.message}`;
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
      return new Response(JSON.stringify({ db, configured: !!(c.token && c.appSecret && c.verifyToken) }), { headers: { 'Content-Type': 'application/json' } });
    }
    // o app pergunta se o robô está pronto e qual número abrir (o cliente só vê o robô quando ready = true)
    if (url.searchParams.has('info')) {
      return new Response(JSON.stringify(await robotInfo(d)), {
        headers: { ...cors(req, c), 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' },
      });
    }
    return new Response('Meu Caixa: robô do WhatsApp', { status: 200 });
  }
  if (req.method !== 'POST') return new Response('método não permitido', { status: 405 });
  // o app manda texto, áudio ou foto com o login do usuário (nunca a assinatura da Meta)
  if (url.searchParams.has('app')) {
    const headers = { ...cors(req, c), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    const out = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers });
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    let uid: string | null = null;
    try { uid = jwt && d.userOf && d.assist ? await d.userOf(jwt) : null; } catch (e) { d.log?.('app: login', e instanceof Error ? e.message : e); }
    if (!uid) return out({ error: 'Entre de novo na sua conta.' }, 401);
    if (limited(uid)) return out({ error: 'Muitos pedidos seguidos. Espere um minuto.' }, 429);
    const inp = appInput(await req.json().catch(() => null));
    if (inp === 'grande') return out({ error: 'Arquivo grande demais. Mande uma foto ou um áudio menor.' }, 413);
    if (!inp) return out({ error: 'Mande um texto, um áudio ou uma foto.' }, 400);
    try { return out(await d.assist!(uid, inp)); } catch (e) {
      d.log?.('app: robô falhou', e instanceof Error ? e.message : e);
      return out({ error: 'Não consegui terminar agora. Tente de novo em instantes.' }, 502);
    }
  }
  // o app do dono pede para ativar/conferir na Meta (login do app, nunca a assinatura da Meta)
  if (url.searchParams.has('setup')) {
    const headers = { ...cors(req, c), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    let admin = false;
    try { admin = !!jwt && !!d.isAdmin && await d.isAdmin(jwt); } catch (e) { d.log?.('ativação: login', e instanceof Error ? e.message : e); }
    if (!admin) return new Response(JSON.stringify({ ok: false, message: 'Só o dono da conta pode ativar o robô.' }), { status: 403, headers });
    const body = await req.json().catch(() => ({}));
    if (body?.action === 'register') {
      return new Response(JSON.stringify(await registerNumber(d, String(body.phone ?? ''), String(body.pin ?? ''))), { headers });
    }
    return new Response(JSON.stringify(await setupMeta(d)), { headers });
  }
  if (!c.appSecret) return new Response('robô não configurado', { status: 503 });
  const raw = await req.arrayBuffer();
  if (!(await signatureOk(c.appSecret, raw, req.headers.get('x-hub-signature-256')))) return new Response('assinatura inválida', { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(raw)); } catch { return new Response('json inválido', { status: 400 }); }
  const msgs = messagesOf(payload, '');
  const work = (async () => {
    // só o número do robô é atendido (o de atendimento do dono, mesmo na mesma conta, nunca)
    const R = msgs.length ? await robot(d).catch(() => null) : null;
    for (const m of msgs) {
      if (m.to && PROTECTED_IDS.has(m.to)) continue;
      const mine = R ? (m.to ? m.to === R.ph.id : !!m.waba && m.waba === R.ph.waba)
        : (!m.to || m.to === c.phoneId || (!!m.waba && (m.waba === c.phoneId || m.waba === c.wabaId)) || !isId(c.phoneId)); // sem conseguir conferir: atende
      if (!mine) continue; // outro número da Meta
      try { await processOne(d, m); } catch (e) { d.log?.('mensagem falhou', m.id, e instanceof Error ? e.message : e); }
    }
    if (msgs.length && d.housekeeping && (d.random ?? Math.random)() < 0.02) {
      try { await d.housekeeping(); } catch (e) { d.log?.('limpeza falhou', e instanceof Error ? e.message : e); }
    }
  })();
  if (d.waitUntil) d.waitUntil(work); else await work;
  return new Response('ok', { status: 200 });
}
