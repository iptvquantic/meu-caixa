// Acrescenta ícones Lucide ao mapa ICONS do app.html, da mesma versão dos que já estão lá (lucide-static 1.57.0).
// O pacote é baixado do npm uma vez para dev/.tools (fora do git).
// Uso: node icons-add.js lock-open calendar-plus ...   (ícone que já existe é pulado)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const VER = '1.57.0';
const dir = path.join(__dirname, '.tools', 'lucide-static-' + VER);
const icons = path.join(dir, 'package', 'icons');
if (!fs.existsSync(icons)) {
  fs.mkdirSync(dir, { recursive: true });
  const tgz = execFileSync('npm', ['pack', 'lucide-static@' + VER, '--silent'], { cwd: dir, encoding: 'utf8' }).trim().split('\n').pop();
  execFileSync('tar', ['-xzf', tgz], { cwd: dir });
}
const app = path.join(__dirname, '..', 'app.html');
let s = fs.readFileSync(app, 'utf8');
const m = s.match(/const ICONS=(\{.*?\});\n/s);
if (!m) { console.error('❌ não achei o mapa ICONS no app.html'); process.exit(1); }
const I = JSON.parse(m[1]);
let added = 0;
for (const n of process.argv.slice(2)) {
  if (I[n]) { console.log('já existe:', n); continue; }
  const f = path.join(icons, n + '.svg');
  if (!fs.existsSync(f)) { console.error('❌ ícone não existe no Lucide ' + VER + ':', n); process.exit(1); }
  // só os elementos de dentro do <svg>, numa linha (o app monta o <svg> com o mesmo traço dos outros)
  I[n] = fs.readFileSync(f, 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '').split('\n').map(l => l.trim()).filter(Boolean).join('');
  console.log('+', n); added++;
}
if (added) { s = s.replace(m[0], () => 'const ICONS=' + JSON.stringify(I) + ';\n'); fs.writeFileSync(app, s); }
console.log(`✅ ${Object.keys(I).length} ícones no app (${added} novo${added === 1 ? '' : 's'})`);
