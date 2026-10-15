// Meu Caixa — robô do WhatsApp (Supabase Edge Function "whatsapp", verify_jwt=false: quem chama é a Meta,
// e cada aviso é conferido pela assinatura com a chave secreta do app da Meta).
// Segredos (Supabase → Edge Functions → Secrets): WHATSAPP_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN e
// GROQ_API_KEY (opcionais: WHATSAPP_PHONE_ID, WHATSAPP_WABA_ID, WHATSAPP_PROTECTED, GROQ_VISION_MODELS). Nenhum fica no código.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { answer, serve, type BotDeps, type WaUser } from './bot.ts';
import { todaySP } from './context.ts';
import { groq } from './groq.ts';
import { type AppInput, type AppResult, type Cfg, handle } from './handler.ts';
import { b64, IMAGE_TYPES, MAX_IMAGE, readReceipt, VISION_MODELS } from './receipt.ts';

const env = (k: string, d = '') => (Deno.env.get(k) ?? d).trim(); // espaço ou quebra de linha colados junto não atrapalham
const named = (k: string) => { try { const o = JSON.parse(env(k) || '{}'); return String(o.default ?? Object.values(o)[0] ?? ''); } catch { return ''; } };
// chave de serviço: a nova (sb_secret_) e, se não houver, a antiga
const SECRET = named('SUPABASE_SECRET_KEYS') || env('SUPABASE_SERVICE_ROLE_KEY');
const sb = createClient(env('SUPABASE_URL'), SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

const cfg: Cfg = {
  verifyToken: env('WHATSAPP_VERIFY_TOKEN'),
  appSecret: env('WHATSAPP_APP_SECRET'),
  phoneId: env('WHATSAPP_PHONE_ID'),
  token: env('WHATSAPP_TOKEN'),
  apiVersion: env('WHATSAPP_API_VERSION', 'v24.0'),
  allowed: env('ALLOWED_ORIGINS', 'https://iptvquantic.github.io').split(',').map((s) => s.trim()).filter(Boolean),
  selfUrl: env('SUPABASE_URL') ? `${env('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/whatsapp` : '',
  wabaId: env('WHATSAPP_WABA_ID'),
  // o WhatsApp de atendimento do dono fica no app do celular: o robô nunca usa esse número
  protectedNumbers: env('WHATSAPP_PROTECTED', '5522991053813').split(',').map((s) => s.replace(/\D/g, '')).filter(Boolean),
};
const APP_URL = env('APP_URL', 'https://iptvquantic.github.io/meu-caixa/app.html');

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}${error.code ? ' (' + error.code + ')' : ''}`);
  return data;
};
// "desfazer": apaga só o lançamento que o banco indicou (wa_undo_target), conferindo o dono
const deleteTx = async (uid: string, id: string) => {
  const { error, count } = await sb.from('transactions').delete({ count: 'exact' }).eq('id', id).eq('user_id', uid);
  if (error) throw new Error(`desfazer: ${error.message}`);
  return (count ?? 0) > 0;
};
// de vez em quando: ids de mensagens com mais de 30 dias já não servem para evitar repetição
const housekeeping = async () => {
  const { error } = await sb.from('wa_inbox').delete().lt('received_at', new Date(Date.now() - 30 * 864e5).toISOString());
  if (error) throw new Error(`limpeza: ${error.message}`);
};
// última mensagem recebida (prova de que a Meta está entregando ao robô)
const lastInbound = async () => {
  const { data, error } = await sb.from('wa_inbox').select('received_at').order('received_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`caixa de entrada: ${error.message}`);
  return data?.received_at ? String(data.received_at) : null;
};
// o app do dono pede a ativação na Meta: login válido e plano master/admin
const isAdmin = async (jwt: string) => {
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data?.user?.id) return false;
  const { data: p, error: e2 } = await sb.from('profiles').select('plan, active').eq('id', data.user.id).maybeSingle();
  if (e2) throw new Error(`perfil: ${e2.message}`);
  return !!p && p.active !== false && ['master', 'admin'].includes(String(p.plan));
};
// endereços configuráveis só para o teste local (dev/test-bot-live.mjs); na produção ficam os oficiais
const GRAPH_URL = env('WHATSAPP_GRAPH_URL', 'https://graph.facebook.com');
// appsecret_proof em toda chamada: um token vazado não serve sem a chave secreta do app
const enc = new TextEncoder(), proofs = new Map<string, string>();
async function proof(token: string) {
  if (!proofs.has(token)) {
    const key = await crypto.subtle.importKey('raw', enc.encode(cfg.appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    proofs.set(token, [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(token)))].map((b) => b.toString(16).padStart(2, '0')).join(''));
  }
  return proofs.get(token)!;
}
const graph = async (path: string, init: RequestInit = {}, token = cfg.token, withProof = true) => {
  const p = withProof && cfg.appSecret && token ? `${path.includes('?') ? '&' : '?'}appsecret_proof=${await proof(token)}` : '';
  return fetch(`${GRAPH_URL}/${cfg.apiVersion}/${path}${p}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
};
const GROQ_BASE = env('GROQ_BASE_URL', 'https://api.groq.com/openai/v1');
const ai = groq(env('GROQ_API_KEY'), fetch, undefined, GROQ_BASE);
const VISION = env('GROQ_VISION_MODELS') ? env('GROQ_VISION_MODELS').split(',').map((s) => s.trim()).filter(Boolean) : VISION_MODELS;

// áudio do WhatsApp: pega o endereço do arquivo na Meta, baixa e manda transcrever
const EXT: Record<string, string> = { ogg: 'ogg', opus: 'ogg', mpeg: 'mp3', mp3: 'mp3', mp4: 'm4a', m4a: 'm4a', aac: 'm4a', wav: 'wav', webm: 'webm', flac: 'flac' };
async function transcribe(mediaId: string) {
  const meta = await graph(encodeURIComponent(mediaId)).then((r) => r.json());
  if (!meta?.url) throw new Error('áudio sem endereço');
  if (Number(meta.file_size) > 16 * 1024 * 1024) return '';
  const file = await fetch(meta.url, { headers: { Authorization: `Bearer ${cfg.token}` } });
  if (!file.ok) throw new Error('download do áudio falhou (' + file.status + ')');
  const sub = String(meta.mime_type ?? 'audio/ogg').split(';')[0].split('/')[1] ?? 'ogg';
  return ai.transcribe(await file.blob(), 'audio.' + (EXT[sub] ?? 'ogg'));
}

// foto do comprovante: pega o arquivo na Meta, confere tipo e tamanho e manda o modelo de visão ler (nada é salvo)
async function receipt(mediaId: string, today: string, categories: string[], note: string) {
  const meta = await graph(encodeURIComponent(mediaId)).then((r) => r.json());
  if (!meta?.url) throw new Error('imagem sem endereço');
  const mime = String(meta.mime_type ?? '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES.includes(mime)) return 'tipo' as const;
  if (Number(meta.file_size) > MAX_IMAGE) return 'grande' as const;
  const file = await fetch(meta.url, { headers: { Authorization: `Bearer ${cfg.token}` } });
  if (!file.ok) throw new Error('download da imagem falhou (' + file.status + ')');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_IMAGE) return 'grande' as const;
  return readReceipt({ key: env('GROQ_API_KEY'), base: GROQ_BASE, models: VISION, mime, data: b64(bytes), today, categories, note });
}

// ---------- pelo app: o mesmo robô, com o login do usuário ----------
const userOf = async (jwt: string) => {
  const { data, error } = await sb.auth.getUser(jwt);
  return error || !data?.user?.id ? null : data.user.id;
};
const AUDIO_EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a' };
const fromB64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
async function assist(uid: string, inp: AppInput): Promise<AppResult> {
  const { data: p, error } = await sb.from('profiles').select('name, plan, settings').eq('id', uid).maybeSingle();
  if (error) throw new Error(`perfil: ${error.message}`);
  const u: WaUser = { user_id: uid, name: String(p?.name ?? ''), access: (await rpc('access_ok', { p_uid: uid })) === true, plan: String(p?.plan ?? ''), settings: p?.settings ?? null };
  let tx: Record<string, unknown> | null = null, removed: string | null = null, heard = '';
  const deps: BotDeps = {
    // guarda o lançamento criado para o app mostrar na hora (e oferecer Desfazer)
    rpc: async (fn, args) => { const r = await rpc(fn, args); if (fn === 'wa_add_tx' && r?.ok) tx = r.tx ?? null; return r; },
    ask: ai.ask, extract: ai.extract, today: todaySP, appUrl: APP_URL,
    transcribe: async () => {
      const a = inp.audio!;
      heard = (await ai.transcribe(new Blob([fromB64(a.data)], { type: a.mime }), 'audio.' + (AUDIO_EXT[a.mime] ?? 'webm'))).trim();
      return heard;
    },
    readReceipt: (_id, today, categories, note) => readReceipt({ key: env('GROQ_API_KEY'), base: GROQ_BASE, models: VISION, mime: inp.image!.mime, data: inp.image!.data, today, categories, note }),
    deleteTx: async (owner, id) => { const ok = await deleteTx(owner, id); if (ok) removed = id; return ok; },
  };
  const kind = inp.image ? 'image' : inp.audio ? 'audio' : 'text';
  const reply = await serve({ phone: 'app', kind, text: inp.text, audioId: inp.audio ? 'app' : undefined, mediaId: inp.image ? 'app' : undefined }, u, deps, { noAI: inp.noAI });
  return { reply, handled: reply !== null, heard: heard || undefined, tx, removed };
}

const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;

Deno.serve((req) => handle(req, {
  cfg, rpc, graph, housekeeping, isAdmin, lastInbound, userOf, assist,
  bot: (m) => answer(m, { rpc, ask: ai.ask, extract: ai.extract, transcribe, readReceipt: receipt, deleteTx, today: todaySP, appUrl: APP_URL }),
  waitUntil: runtime ? (p) => runtime.waitUntil(p) : undefined,
  log: (...a) => console.error('[whatsapp]', ...a),
}));
