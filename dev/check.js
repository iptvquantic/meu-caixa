// Checagem estática obrigatória antes de publicar:
// toda ação (data-act) tem função, todo id usado existe, nada de onclick com variável, HTML bem formado,
// JavaScript sem erro de sintaxe e nenhuma chave secreta no código público.
// Uso: node check.js [arquivo.html]  (padrão: ../app.html)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const parse5 = require('parse5');
const { inlineScripts } = require('./lib');

const file = process.argv[2] || path.join(__dirname, '..', 'app.html');
const html = fs.readFileSync(file, 'utf8');
let fail = 0;
const bad = (...m) => { fail++; console.log('❌', ...m); };

// 1) JavaScript compila
const scripts = inlineScripts(html);
if (scripts.length !== 2) bad(`esperava 2 scripts embutidos, achei ${scripts.length}`);
scripts.forEach((code, i) => { try { new vm.Script(code, { filename: `script-${i}.js` }); } catch (e) { bad(`erro de sintaxe no script ${i}:`, e.message); } });

// 2) Ações: toda data-act usada tem função no mapa ACT
const start = html.indexOf('const ACT = {'), end = html.indexOf('const INPUT = {');
if (start < 0 || end < 0) bad('mapa de ações (ACT/INPUT) não encontrado');
const handlers = new Set([...html.slice(start, end).matchAll(/^\s{2}([a-zA-Z]+):/gm)].map(m => m[1]));
const used = new Set([...html.matchAll(/data-act="([a-zA-Z]+)"/g)].map(m => m[1]));
for (const a of used) if (!handlers.has(a)) bad('data-act sem função:', a);
for (const h of handlers) if (!used.has(h) && !html.includes(`ACT.${h}`)) console.log('ℹ️ função de ação sem uso direto (pode ser dinâmica):', h);

// 3) ids usados existem
const defined = new Set([...html.matchAll(/\bid="([a-zA-Z0-9_-]+)"/g)].map(m => m[1]));
const usedIds = new Set([...html.matchAll(/\$\$?\('#([a-zA-Z0-9_-]+)/g)].map(m => m[1]).concat([...html.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1])));
for (const id of usedIds) if (!defined.has(id)) bad('id usado mas não existe:', id);

// 4) Sem handlers inline com variável (o padrão perigoso do app antigo)
if (/on(click|change|input|submit)="[^"]*\$\{/.test(html)) bad('onclick/onchange com interpolação de variável');

// 5) HTML bem formado
const errors = [];
parse5.parse(html, { onParseError: e => errors.push(e) });
errors.filter(e => e.code !== 'missing-doctype').slice(0, 10).forEach(e => bad('HTML:', e.code, 'linha', e.startLine));

// 6) Nada de segredo no código público
const secrets = html.match(/sb_secret_[A-Za-z0-9_-]{10,}|gsk_[A-Za-z0-9]{20,}/);
if (secrets) bad('possível chave secreta no código:', secrets[0].slice(0, 12) + '…');
for (const m of html.matchAll(/eyJ[A-Za-z0-9_-]+\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
  try { const p = JSON.parse(Buffer.from(m[1], 'base64url').toString()); if (p.role && p.role !== 'anon') bad('token com papel', p.role, 'no código'); } catch { /* não é JWT */ }
}

console.log(`ações: ${used.size} usadas / ${handlers.size} funções · ids: ${usedIds.size} usados / ${defined.size} definidos · scripts: ${scripts.length}`);
console.log(fail ? `❌ checagem estática: ${fail} problema(s)` : '✅ checagem estática ok');
process.exit(fail ? 1 : 0);
