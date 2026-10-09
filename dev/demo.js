// Cópia do app em modo demonstração (dados de exemplo no aparelho, sem nuvem) — usada na prévia.
// Uso: node demo.js [saida.html]   (padrão: dev/out/demo.html)
const fs = require('fs'), path = require('path');
const { appHtml } = require('./lib');

const out = path.resolve(process.argv[2] || path.join(__dirname, 'out', 'demo.html'));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, appHtml({ demo: true }));
console.log('✅ demonstração:', out);
