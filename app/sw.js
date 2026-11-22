// Service worker: guarda la app (no los datos) para que abra rápido y se pueda instalar.
// Red primero: si hay conexión siempre se usa la versión nueva; sin conexión, la guardada.
const CACHE = 'casa-v3';
const ARCHIVOS = ['./', 'index.html', 'estilos.css', 'app.js', 'solicitud.js', 'manifest.webmanifest', 'icono.svg', 'icono-192.png', 'icono-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // la API va directo al servidor
  e.respondWith(fetch(e.request).then(r => {
    const copia = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copia));
    return r;
  }).catch(() => caches.match(e.request)));
});
