// Meu Caixa — robô do WhatsApp (Supabase Edge Function "whatsapp", verify_jwt=false: quem chama é a Meta,
// e cada aviso é conferido pela assinatura com a chave secreta do app da Meta).
// Segredos (Supabase → Edge Functions → Secrets): WHATSAPP_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_PHONE_ID,
// WHATSAPP_VERIFY_TOKEN e GROQ_API_KEY (opcional: WHATSAPP_WABA_ID). Nenhum deles fica no código.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { answer } from './bot.ts';
import { todaySP } from './context.ts';
import { groq } from './groq.ts';
import { type Cfg, handle } from './handler.ts';

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
const ai = groq(env('GROQ_API_KEY'), fetch, undefined, env('GROQ_BASE_URL', 'https://api.groq.com/openai/v1'));

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

const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;

Deno.serve((req) => handle(req, {
  cfg, rpc, graph, housekeeping, isAdmin,
  bot: (m) => answer(m, { rpc, ask: ai.ask, extract: ai.extract, transcribe, deleteTx, today: todaySP, appUrl: APP_URL }),
  waitUntil: runtime ? (p) => runtime.waitUntil(p) : undefined,
  log: (...a) => console.error('[whatsapp]', ...a),
}));
