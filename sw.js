// Meu Caixa — service worker: abre rápido e funciona sem internet (só leitura).
// Dados do Supabase nunca são guardados aqui: sempre vêm da internet.
const VERSION = 'mc-2.2.1';
const SHELL = ['./app.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
// Bibliotecas com versão fixa: guardadas já na instalação para o app abrir sem internet
const LIBS = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js', 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'];
const CDN = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(async (c) => { await c.addAll(SHELL); await Promise.all(LIBS.map((u) => c.add(u).catch(() => {}))); }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co') || url.hostname === 'www.gstatic.com' || url.hostname.endsWith('firebaseio.com') || url.hostname.endsWith('googleapis.com') && !url.hostname.startsWith('fonts.')) return;
  // Páginas: sempre tenta a versão nova; sem internet, usa a guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./app.html'))));
    return;
  }
  // Arquivos do próprio site e bibliotecas (versões fixas): cache primeiro
  if (url.origin === self.location.origin || CDN.includes(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return r;
    })));
  }
});
