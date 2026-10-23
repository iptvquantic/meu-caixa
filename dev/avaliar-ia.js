// Gera a função TEMPORÁRIA de avaliação do "entender" (mc-avaliar) a partir de avaliar-ia.ts: o understand.ts vem de
// um commit do GitHub (exatamente o que vai para o ar), a senha vira só o hash (ela não fica salva em lugar nenhum) e a
// função desliga sozinha depois de algumas horas (responde 410).
// Uso: node avaliar-ia.js <commit de 40 caracteres> <senha de 16+ caracteres> [horas=3]
//   → out/deploy/mc-avaliar/index.ts, publicado pelo conector do Supabase (nome mc-avaliar, verify_jwt=false).
// Rodar: GET …/functions/v1/mc-avaliar/<senha>/<casos: 1,5,7 ou 43-50>/<esforço: low|medium>/<modelo: 120|20>
// Cuidado com a cota grátis da Groq (8 mil tokens por minuto, 200 mil por dia): cada frase usa ~1,8 mil.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');

const [sha, pass, hours = '3'] = process.argv.slice(2);
if (!/^[0-9a-f]{40}$/.test(sha || '') || !pass || pass.length < 16 || !(Number(hours) > 0 && Number(hours) <= 12)) {
  console.error('uso: node avaliar-ia.js <commit de 40 caracteres> <senha de 16+ caracteres> [horas, até 12]');
  process.exit(1);
}
// o commit precisa estar no GitHub (a função baixa o understand.ts de lá)
try { execFileSync('git', ['branch', '-r', '--contains', sha], { cwd: __dirname, encoding: 'utf8' }).trim() || (() => { throw new Error(); })(); }
catch { console.error(`❌ o commit ${sha.slice(0, 7)} não está no GitHub (faça push antes)`); process.exit(1); }

const url = `https://raw.githubusercontent.com/iptvquantic/meu-caixa/${sha}/dev/supabase/functions/whatsapp/understand.ts`;
const ate = new Date(Date.now() + Number(hours) * 3600e3).toISOString().replace(/\.\d+Z$/, 'Z');
const src = fs.readFileSync(path.join(__dirname, 'avaliar-ia.ts'), 'utf8')
  .replace('__UNDERSTAND__', url)
  .replace('__HASH__', crypto.createHash('sha256').update(pass).digest('hex'))
  .replace('__ATE__', ate);
if (/__(UNDERSTAND|HASH|ATE)__/.test(src)) { console.error('❌ avaliar-ia.ts sem os marcadores esperados'); process.exit(1); }
const out = path.join(__dirname, 'out', 'deploy', 'mc-avaliar', 'index.ts');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, src);
const cases = (src.match(/^\s*\{ t: '/gm) || []).length;
console.log(`✅ ${path.relative(__dirname, out)}: ${cases} frases, understand.ts do commit ${sha.slice(0, 7)}, desliga em ${ate}`);
