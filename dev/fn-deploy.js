// Entrada para publicar uma função do Supabase pelo conector EXATAMENTE como está num commit do GitHub.
// Gera o index.ts da função com os imports locais ('./bot.ts', ...) apontando para os arquivos daquele commit
// no repositório público. Só esse index.ts (pequeno, em ASCII) passa pelo publicador; o resto o Supabase
// baixa do commit na hora de empacotar — sem risco de cópia errada e com rastreio do que está no ar.
// Uso: node fn-deploy.js <commit de 40 caracteres> [função...]   → dev/out/deploy/<função>/index.ts
//      (o commit precisa estar no main do GitHub e os arquivos locais iguais a ele)
// Conferir antes: WA_FN_DIR=out/deploy/whatsapp node test-bot-live.mjs  (roda a entrada gerada, baixando do GitHub)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { toAscii } = require('./fn-ascii.js');

const REPO = 'iptvquantic/meu-caixa';
const SRC = path.join(__dirname, 'supabase', 'functions'), OUT = path.join(__dirname, 'out', 'deploy');
const git = (...a) => execFileSync('git', a, { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const sha = process.argv[2] || '';
if (!/^[0-9a-f]{40}$/.test(sha)) { console.error('uso: node fn-deploy.js <commit de 40 caracteres> [função...]'); process.exit(1); }
try { git('merge-base', '--is-ancestor', sha, 'origin/main'); } catch { console.error(`o commit ${sha.slice(0, 7)} não está no origin/main (faça push e git fetch)`); process.exit(1); }

const fns = process.argv.length > 3 ? process.argv.slice(3) : ['whatsapp', 'ai'];
for (const fn of fns) {
  const files = fs.readdirSync(path.join(SRC, fn)).filter((x) => x.endsWith('.ts'));
  for (const f of files) {
    const rel = `dev/supabase/functions/${fn}/${f}`;
    if (git('show', `${sha}:${rel}`) !== fs.readFileSync(path.join(SRC, fn, f), 'utf8')) {
      console.error(`${rel} está diferente do commit ${sha.slice(0, 7)}: o publicado não seria o testado`); process.exit(1);
    }
  }
  const base = `https://raw.githubusercontent.com/${REPO}/${sha}/dev/supabase/functions/${fn}/`;
  const src = fs.readFileSync(path.join(SRC, fn, 'index.ts'), 'utf8');
  const local = [...src.matchAll(/from '\.\/([\w.-]+\.ts)'/g)].map((m) => m[1]);
  if (!local.length || local.some((f) => !files.includes(f))) { console.error(`${fn}/index.ts: imports locais inesperados`); process.exit(1); }
  const out = `// Publicado do commit ${sha} do GitHub (${REPO}). Gerado por dev/fn-deploy.js; fonte: dev/supabase/functions/${fn}/.\n`
    + src.replace(/from '\.\/([\w.-]+\.ts)'/g, (_, f) => `from '${base}${f}'`);
  fs.mkdirSync(path.join(OUT, fn), { recursive: true });
  fs.writeFileSync(path.join(OUT, fn, 'index.ts'), toAscii(out, `${fn}/index.ts`));
  console.log(`✅ ${fn}: out/deploy/${fn}/index.ts (importa ${local.join(', ')} do commit ${sha.slice(0, 7)})`);
}
