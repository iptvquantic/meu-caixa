// Versão só-ASCII das funções do Supabase, para publicar sem risco de perder caracteres invisíveis
// (acentos combinantes, seletores de variação de emoji) ao copiar o código para o publicador.
// Cada caractere fora do ASCII vira \uXXXX — em strings, templates, regex e comentários o Deno lê igual.
// Uso: node fn-ascii.js   → dev/out/fn/<função>/<arquivo>.ts   (o test-bot-live.mjs roda com WA_FN_DIR=dev/out/fn/whatsapp)
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, 'supabase', 'functions'), OUT = path.join(__dirname, 'out', 'fn');

function toAscii(text, file) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) { out += text[i]; continue; }
    if (text[i - 1] === '\\') throw new Error(`${file}: barra invertida antes de caractere especial na posição ${i}`);
    out += '\\u' + code.toString(16).padStart(4, '0');
  }
  if (/[^\x00-\x7f]/.test(out)) throw new Error('sobrou caractere especial em ' + file);
  return out;
}

function main() {
  const done = [];
  for (const fn of ['whatsapp', 'ai']) {
    fs.mkdirSync(path.join(OUT, fn), { recursive: true });
    for (const f of fs.readdirSync(path.join(SRC, fn)).filter((x) => x.endsWith('.ts'))) {
      const text = fs.readFileSync(path.join(SRC, fn, f), 'utf8');
      const ascii = toAscii(text, `${fn}/${f}`);
      fs.writeFileSync(path.join(OUT, fn, f), ascii);
      done.push(`${fn}/${f} (${ascii.length} bytes)`);
    }
  }
  console.log('✅ versão ASCII:', done.join(', '));
}

module.exports = { toAscii };
if (require.main === module) main();
