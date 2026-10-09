// Gera os arquivos que o robô do WhatsApp compartilha com o app e com a IA (fonte da verdade continua lá):
//   supabase/functions/whatsapp/smart.ts   ← trecho do app.html: ícone automático e lançamento rápido
//   supabase/functions/whatsapp/context.ts ← cópia de supabase/functions/ai/context.ts (contas do mês)
// Uso: node sync-bot.js   (o test-bot.mjs falha se as cópias estiverem desatualizadas)
const fs = require('fs'), path = require('path');
const { ROOT } = require('./lib');

const FN = path.join(__dirname, 'supabase', 'functions');
const START = '/* ===== Ícone automático, emojis e lançamento rápido';
const END = '\n(() => {\n';

function smartSource() {
  const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  const a = html.indexOf(START), b = html.indexOf(END, a);
  if (a < 0 || b < 0) throw new Error('trecho do lançamento rápido não encontrado no app.html');
  return '// @ts-nocheck\n// GERADO por dev/sync-bot.js a partir do app.html (ícone automático e lançamento rápido). Não edite aqui.\n'
    + html.slice(a, b).trimEnd().split('\n').filter((l) => !/^const (EMOJI_SET|PALETTE) =/.test(l)).join('\n') // listas só da tela
    + '\n\nexport { norm, suggestIcon, iconIsSpecific, familyOf, parseQuick, parseAmountBR, stripLeadingEmoji };\n';
}
function contextSource() {
  return '// CÓPIA GERADA por dev/sync-bot.js de ../ai/context.ts. Não edite aqui.\n' + fs.readFileSync(path.join(FN, 'ai', 'context.ts'), 'utf8');
}
const FILES = { 'whatsapp/smart.ts': smartSource, 'whatsapp/context.ts': contextSource };

module.exports = { FILES, FN };
if (require.main === module) {
  for (const [rel, gen] of Object.entries(FILES)) {
    fs.mkdirSync(path.dirname(path.join(FN, rel)), { recursive: true });
    fs.writeFileSync(path.join(FN, rel), gen());
    console.log('✅ gerado:', path.join('supabase/functions', rel));
  }
}
