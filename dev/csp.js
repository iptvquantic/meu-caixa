// Política de segurança de conteúdo (CSP) do app.html e do index.html, por meta tag (o GitHub Pages não deixa
// mandar cabeçalho). Os scripts embutidos entram por hash (sha256): um script injetado não roda; fora os CDNs
// fixos, nada externo carrega; os dados só podem sair para o Supabase do projeto (e para o Google, usado só no
// "Trazer dados do app antigo"). A demonstração (prévia) fica sem CSP: não tem dado de ninguém.
// Uso: node csp.js   (reescreve os dois arquivos; o check.js falha se a CSP estiver desatualizada)
const crypto = require('crypto'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const META = /<meta http-equiv="Content-Security-Policy" content="[^"]*">\n/;
const inlineScripts = html => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const sha = s => `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;

function policy(html, kind) {
  const hashes = inlineScripts(html).map(sha).join(' ');
  if (kind === 'landing') {
    return [
      "default-src 'self'", `script-src ${hashes}`, "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com data:", "img-src 'self' data:", "connect-src 'none'", "object-src 'none'",
      "base-uri 'self'", "form-action 'none'",
    ].join('; ');
  }
  const sb = (/supabaseUrl: '(https:\/\/[a-z0-9-]+\.supabase\.co)'/.exec(html) || [])[1];
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes} https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://www.gstatic.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `connect-src 'self'${sb ? ` ${sb} ${sb.replace('https://', 'wss://')}` : ''} https://*.googleapis.com`,
    "media-src 'self' blob:", "worker-src 'self'", "manifest-src 'self'", "frame-src https://*.firebaseapp.com", // login do app antigo (Firebase)
    "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; ');
}
// HTML com a CSP certa para os scripts que ele tem agora (kind: 'app' ou 'landing'; 'none' = sem CSP)
function withCsp(html, kind = 'app') {
  const clean = html.replace(META, '');
  if (kind === 'none') return clean;
  if (!clean.includes('<meta charset="utf-8">\n')) throw new Error('csp: <meta charset="utf-8"> não encontrado');
  return clean.replace('<meta charset="utf-8">\n', `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${policy(clean, kind)}">\n`);
}
const FILES = { 'app.html': 'app', 'index.html': 'landing' };

module.exports = { withCsp, policy, FILES, ROOT };
if (require.main === module) {
  for (const [f, kind] of Object.entries(FILES)) {
    const p = path.join(ROOT, f), html = fs.readFileSync(p, 'utf8'), out = withCsp(html, kind);
    if (out !== html) { fs.writeFileSync(p, out); console.log('✅ CSP atualizada:', f); } else console.log('✅ CSP já em dia:', f);
  }
}
