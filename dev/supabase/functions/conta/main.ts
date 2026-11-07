// Meu Caixa — função "conta": liga o handler (handler.ts) ao banco e ao login do Supabase. O index.ts só importa a
// biblioteca do Supabase e chama start() — assim a publicação leva poucas linhas.
// verify_jwt=false: criar conta é sem login; o link de nova senha confere o login do dono aqui dentro.
// Segredos: nenhum novo (usa a chave de serviço que o Supabase já dá às funções).
import { type Deps, handle } from './handler.ts';

const env = (k: string, d = '') => (Deno.env.get(k) ?? d).trim();
const named = (k: string) => { try { const o = JSON.parse(env(k) || '{}'); return String(o.default ?? Object.values(o)[0] ?? ''); } catch { return ''; } };
// chave de serviço e chave pública: as novas (sb_secret_/sb_publishable_) e, se não houver, as antigas
const SECRET = named('SUPABASE_SECRET_KEYS') || env('SUPABASE_SERVICE_ROLE_KEY');
const PUBLIC_KEY = named('SUPABASE_PUBLISHABLE_KEYS') || env('SUPABASE_ANON_KEY');
const BASE = env('SUPABASE_URL').replace(/\/+$/, '');
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

type CreateClient = (url: string, key: string, options?: Record<string, unknown>) => any;
export function start(createClient: CreateClient) {
  const sb = createClient(BASE, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  const enc = new TextEncoder();
  const deps: Deps = {
    cfg: {
      allowed: env('ALLOWED_ORIGINS', 'https://iptvquantic.github.io').split(',').map((s) => s.trim()).filter(Boolean),
      appUrl: env('APP_URL', 'https://iptvquantic.github.io/meu-caixa/app.html'),
    },
    settings: async () => {
      const r = await fetch(`${BASE}/auth/v1/settings`, { headers: { apikey: PUBLIC_KEY } });
      if (!r.ok) return null;
      const j = await r.json();
      return { signup: !j?.disable_signup };
    },
    // conta que não existe: com a chave certa o login responde "não encontrada" (404); com a chave errada, 401/403
    adminOk: async () => {
      const { error } = await sb.auth.admin.getUserById('00000000-0000-0000-0000-000000000000');
      return !!error && (error.status === 404 || /not.?found/i.test(String(error.message)));
    },
    // o segredo da função embaralha o endereço: o código não volta a ser o IP
    hash: async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(`${SECRET}|${s}`))),
    allow: async (h) => {
      const { data, error } = await sb.rpc('signup_attempt', { p_ip_hash: h });
      if (error) throw new Error(error.message);
      return data === true;
    },
    createUser: async (email, password) => {
      const { error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw new Error(error.message);
    },
    userOf: async (jwt) => {
      const { data, error } = await sb.auth.getUser(jwt);
      return error ? null : data?.user?.id ?? null;
    },
    profileOf: async (uid) => {
      const { data, error } = await sb.from('profiles').select('plan, email').eq('id', uid).maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    recoveryLink: async (email, redirectTo) => {
      const { data, error } = await sb.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
      if (error) throw new Error(error.message);
      const url = data?.properties?.action_link;
      if (!url) throw new Error('link vazio');
      return url;
    },
    log: (m, x) => console.log('[conta]', m, x === undefined ? '' : JSON.stringify(x)),
  };
  Deno.serve((req) => handle(req, deps));
}
