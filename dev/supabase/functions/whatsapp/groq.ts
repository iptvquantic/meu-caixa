// Meu Caixa — o que o robô pede à Groq: responder pergunta, entender a frase (understand.ts), tirar o lançamento
// de uma frase sem número e transcrever áudio. A chave fica só nos Secrets (GROQ_API_KEY).
import type { Quick } from './bot.ts';


const EXTRACT = `Você converte a frase de um brasileiro em um lançamento financeiro. Responda SOMENTE um JSON, sem texto fora dele:
{"lancamento": true, "tipo": "saida", "valor": 52.9, "parcelas": 1, "descricao": "Mercado", "data": "AAAA-MM-DD"}
- valor em reais, número com ponto decimal ("cinquenta e dois e noventa" = 52.9; "mil e duzentos" = 1200; "dois mil" = 2000; "vinte e cinco centavos" = 0.25).
- tipo: recebi/vendi/ganhei/entrou = "entrada"; investi/apliquei/guardei = "aporte"; resgatei/tirei do investimento = "resgate"; "no cartão", "no crédito" ou parcelado = "cartao"; senão "saida".
- parcelas: só para cartão ("em 10 vezes" = 10); senão 1.
- descricao: 1 a 4 palavras, sem o valor e sem verbos como gastei/paguei, com inicial maiúscula (ex.: "Uber", "Mercado", "Cliente João").
- data: "hoje" = a data de hoje informada; "ontem" = um dia antes; "dia 5" = dia 5 deste mês; sem data = hoje.
Se a frase não for um lançamento com valor (pergunta, conversa, sem valor), responda {"lancamento": false}.`;

const TYPES: Record<string, [string, string | null]> = { saida: ['out', null], entrada: ['in', null], cartao: ['card', null], aporte: ['invest', 'aporte'], resgate: ['invest', 'resgate'] };
const okDate = (s: unknown, today: string) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + 'T12:00:00Z'))) return today;
  const diff = (Date.parse(s + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 864e5;
  return diff > 60 || diff < -400 ? today : s; // data absurda → hoje
};

// Resposta da IA → lançamento validado (ou null)
export function toQuick(out: string, today: string): Quick | null {
  const m = /\{[\s\S]*\}/.exec(out || '');
  if (!m) return null;
  let j: any;
  try { j = JSON.parse(m[0]); } catch { return null; }
  if (!j || j.lancamento !== true) return null;
  const valor = typeof j.valor === 'string' ? Number(j.valor.replace(/\./g, '').replace(',', '.')) : Number(j.valor);
  if (!(valor > 0 && valor < 1e9)) return null;
  const [type, investKind] = TYPES[String(j.tipo ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] ?? TYPES.saida;
  const parc = type === 'card' ? Math.min(48, Math.max(1, Math.round(Number(j.parcelas) || 1))) : 1;
  const desc = String(j.descricao ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return { type, amount: Math.round(valor * 100) / 100, installments: parc, date: okDate(j.data, today), description: desc ? desc[0].toUpperCase() + desc.slice(1) : '', investKind };
}

// llama-3.3-70b-versatile saiu do ar na Groq em 16/08/2026: a reserva agora é o gpt-oss-20b
// Áudio: o Whisper completo acerta mais português; o turbo fica de reserva. Trechos de silêncio viram frases
// inventadas ("Legendas pela comunidade Amara.org", "Obrigado.") — esses são descartados.
export const AUDIO_MODELS = ['whisper-large-v3', 'whisper-large-v3-turbo'];
const JUNK = /^(legendas? (pela|por|da) .*|legendado .*|obrigad[oa]( por assistir| pela atenção)?|tchau|inscreva-se.*|ative o sininho.*|música|aplausos|risos|e aí|hum+|ah+|\.+|-+)$/i;
export function speechText(j: any) {
  const segs: any[] = Array.isArray(j?.segments) ? j.segments : [];
  const kept = segs.length
    ? segs.filter((s) => !(Number(s?.no_speech_prob) > 0.6 && Number(s?.avg_logprob) < -0.6)).map((s) => String(s?.text ?? '').trim())
    : [String(j?.text ?? '').trim()];
  const text = kept.filter((t) => t && !JUNK.test(t.replace(/[!.,…]+$/g, '').trim())).join(' ').replace(/\s+/g, ' ').trim();
  return JUNK.test(text.replace(/[!.,…]+$/g, '').trim()) ? '' : text;
}
const errOf = async (r: Response) => { try { const j = await r.json(); return String(j?.error?.message ?? j?.message ?? '').slice(0, 200); } catch { return ''; } };

export function groq(key: string, fetcher: typeof fetch = fetch, models = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], base = 'https://api.groq.com/openai/v1', log?: (...a: unknown[]) => void) {
  const CHAT = `${base}/chat/completions`, AUDIO = `${base}/audio/transcriptions`;
  type ChatOpts = { maxTokens: number; temperature: number; json?: boolean; schema?: Record<string, unknown>; effort?: string };
  async function chat(messages: { role: string; content: string }[], o: ChatOpts) {
    if (!key) throw new Error('GROQ_API_KEY não configurada');
    let last = '';
    for (const model of models) {
      // formato estrito quando há esquema; se o modelo recusar o esquema, tenta só "JSON"
      for (const fmt of o.schema ? ['schema', 'json'] : [o.json ? 'json' : '']) {
        const body: Record<string, unknown> = { model, messages, temperature: o.temperature, max_tokens: o.maxTokens };
        if (fmt === 'schema') body.response_format = { type: 'json_schema', json_schema: o.schema };
        else if (fmt === 'json') body.response_format = { type: 'json_object' };
        if (o.effort && model.startsWith('openai/gpt-oss')) body.reasoning_effort = o.effort;
        const r = await fetcher(CHAT, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (r.ok) { const t = (await r.json())?.choices?.[0]?.message?.content?.trim(); if (t) return t as string; last = 'resposta vazia'; break; }
        last = `Groq ${r.status}`;
        log?.('IA recusou', model, fmt || 'texto', r.status, await errOf(r));
        if (r.status === 401 || r.status === 403) throw new Error('IA indisponível (' + last + ')');
        if (r.status !== 400) break; // fora do ar ou limite: próximo modelo
      }
    }
    throw new Error('IA indisponível (' + last + ')');
  }
  return {
    ask: (system: string, question: string) => chat([{ role: 'system', content: system }, { role: 'user', content: question }], { maxTokens: 900, temperature: 0.5 }),
    extract: async (text: string, today: string) =>
      toQuick(await chat([{ role: 'system', content: EXTRACT }, { role: 'user', content: `Hoje é ${today}. Frase: ${text.slice(0, 500)}` }], { maxTokens: 300, temperature: 0, json: true, effort: 'low' }), today),
    // entende a frase com o contexto da pessoa (understand.ts): resposta no formato estrito do esquema
    interpret: (system: string, context: string, schema: Record<string, unknown>) =>
      chat([{ role: 'system', content: system }, { role: 'user', content: context }], { maxTokens: 2000, temperature: 0, schema, effort: 'medium' }),
    // áudio → texto. vocab = nomes e termos da pessoa (o Whisper acerta mais o que já conhece)
    transcribe: async (audio: Blob, fileName = 'audio.ogg', vocab = '') => {
      if (!key) throw new Error('GROQ_API_KEY não configurada');
      let last = '';
      for (const model of AUDIO_MODELS) {
        const form = new FormData();
        form.append('file', audio, fileName);
        form.append('model', model);
        form.append('language', 'pt');
        form.append('temperature', '0');
        form.append('response_format', 'verbose_json');
        form.append('prompt', (vocab || 'Lançamentos de dinheiro em reais: mercado 52,90; uber 23 ontem; recebi 300 no PIX; parcela 3/12; notebook 3.600 em 12x no cartão.').slice(0, 640));
        const r = await fetcher(AUDIO, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
        if (r.ok) return speechText(await r.json());
        const why = await errOf(r);
        last = `Groq ${r.status}${why ? ': ' + why : ''}`;
        log?.('transcrição recusada', model, fileName, audio.size, r.status, why); // sem o áudio, sem a chave
        if (r.status === 401 || r.status === 403) break;
      }
      throw new Error(`transcrição falhou (${last})`);
    },
  };
}
