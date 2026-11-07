// Meu Caixa — contas sem depender de e-mail (Supabase Edge Function "conta"). O e-mail padrão do Supabase só entrega
// para a equipe do projeto (o dono): sem um servidor de e-mail próprio, o cliente não recebe a confirmação do cadastro
// nem o "Esqueci a senha". Por isso:
//   1) "criar": a conta nova nasce confirmada, com limite de tentativas por endereço e no total (signup_attempt, no
//      banco; o IP vira um código embaralhado e nunca é guardado) e respeitando "cadastro fechado" do Supabase;
//   2) "link": o dono (master/admin), no painel de clientes, gera o link de nova senha de um cliente e manda pelo WhatsApp.
// Nada do que a pessoa digita (e-mail, senha) vai para o registro. Lógica sem a biblioteca do Supabase (testável);
// main.ts liga as dependências de verdade.
export type Cfg = { allowed: string[]; appUrl: string };
export type Profile = { plan: string | null; email: string | null };
export type Deps = {
  cfg: Cfg;
  settings: () => Promise<{ signup: boolean } | null>; // configuração pública do login (cadastro aberto?)
  hash: (s: string) => Promise<string>;
  allow: (ipHash: string) => Promise<boolean>; // true = pode criar (e anota a tentativa)
  createUser: (email: string, password: string) => Promise<void>; // conta já confirmada
  userOf: (jwt: string) => Promise<string | null>; // quem está logado
  profileOf: (uid: string) => Promise<Profile | null>;
  recoveryLink: (email: string, redirectTo: string) => Promise<string>; // link de nova senha (não manda e-mail)
  log: (msg: string, extra?: unknown) => void;
};

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// a mesma regra do app: 8+ caracteres com letras e números (até 72, o limite do Supabase)
export const strongPass = (p: string) => p.length >= 8 && p.length <= 72 && /\p{L}/u.test(p) && /\d/.test(p);
const ADMIN = new Set(['master', 'admin']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUSY = 'Não deu para concluir agora. Tente de novo em instantes.';

export function cors(origin: string, allowed: string[]) {
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return { 'Access-Control-Allow-Origin': ok ? origin : allowed[0], 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' };
}
// o endereço de quem chamou (o Supabase põe no x-forwarded-for); só vira código embaralhado para o limite
export function clientIp(req: Request) {
  const f = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
  return f || (req.headers.get('cf-connecting-ip') ?? '').trim() || (req.headers.get('x-real-ip') ?? '').trim() || 'desconhecido';
}
const errText = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 160);

type Json = (b: unknown, status?: number) => Response;
export async function handle(req: Request, d: Deps): Promise<Response> {
  const H = { ...cors(req.headers.get('origin') ?? '', d.cfg.allowed), 'Content-Type': 'application/json' };
  const json: Json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: H });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: H });
  // saúde: só a configuração pública do login (sem ler dado de ninguém)
  if (req.method === 'GET' && new URL(req.url).searchParams.has('health')) {
    const s = await d.settings().catch(() => null);
    return json({ ok: !!s, signup: s ? s.signup : null });
  }
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  let b: Record<string, unknown> | null = null;
  try { b = await req.json(); } catch { /* corpo inválido */ }
  if (b?.acao === 'criar') return create(req, b, d, json);
  if (b?.acao === 'link') return link(req, b, d, json);
  return json({ error: 'Pedido inválido' }, 400);
}

async function create(req: Request, b: Record<string, unknown>, d: Deps, json: Json) {
  const email = String(b.email ?? '').trim().toLowerCase(), pass = String(b.senha ?? '');
  if (email.length > 254 || !EMAIL.test(email)) return json({ error: 'Digite um e-mail válido.', reason: 'email' }, 400);
  if (!strongPass(pass)) return json({ error: 'Senha fraca: use pelo menos 8 caracteres, com letras e números.', reason: 'weak' }, 400);
  // "cadastro fechado" no Supabase vale aqui também (a chave de serviço passaria por cima)
  const s = await d.settings().catch(() => null);
  if (s && !s.signup) return json({ error: 'O cadastro está fechado no momento. Fale com o suporte no WhatsApp.', reason: 'closed' }, 403);
  let ok = false;
  try { ok = await d.allow(await d.hash('ip:' + clientIp(req))); }
  catch (e) { d.log('limite de cadastro indisponível', errText(e)); return json({ error: BUSY }, 503); }
  if (!ok) return json({ error: 'Muitas contas criadas agora. Tente de novo em 1 hora ou fale com o suporte no WhatsApp.', reason: 'limit' }, 429);
  try { await d.createUser(email, pass); }
  catch (e) {
    const m = errText(e);
    if (/already|registered|exists|duplicate/i.test(m)) return json({ error: 'Este e-mail já tem conta. Use "Entrar".', reason: 'exists' }, 409);
    if (/password/i.test(m)) return json({ error: 'Senha fraca: use pelo menos 8 caracteres, com letras e números.', reason: 'weak' }, 400);
    d.log('erro ao criar conta', m);
    return json({ error: BUSY }, 502);
  }
  d.log('conta criada');
  return json({ ok: true });
}

async function link(req: Request, b: Record<string, unknown>, d: Deps, json: Json) {
  const auth = req.headers.get('authorization') ?? '';
  const me = auth.startsWith('Bearer ') ? await d.userOf(auth.slice(7)).catch(() => null) : null;
  if (!me) return json({ error: 'Faça login' }, 401);
  const mine = await d.profileOf(me).catch(() => null);
  if (!mine || !ADMIN.has(String(mine.plan))) return json({ error: 'Só o dono gera o link de nova senha.' }, 403);
  const target = String(b.usuario ?? '');
  if (!UUID.test(target)) return json({ error: 'Cliente inválido.' }, 400);
  const p = await d.profileOf(target).catch(() => null);
  if (!p || !p.email) return json({ error: 'Cliente não encontrado.' }, 404);
  if (ADMIN.has(String(p.plan))) return json({ error: 'Conta de administrador: use "Esqueci minha senha" na tela de entrada.' }, 403);
  try {
    const url = await d.recoveryLink(p.email, d.cfg.appUrl);
    d.log('link de nova senha gerado', { por: me, para: target });
    return json({ ok: true, link: url });
  } catch (e) {
    d.log('erro ao gerar link de nova senha', errText(e));
    return json({ error: BUSY }, 502);
  }
}
