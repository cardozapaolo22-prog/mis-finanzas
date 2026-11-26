// Permite abrir la app aunque no haya internet (tus datos se sincronizan al volver la conexión).
// Si cambias algún archivo de la app, sube el número de versión para que los celulares tomen el cambio.
const VERSION = "sol-v5";
const SHELL = ["./", "index.html", "styles.css?v=5", "app.js?v=5", "config.js?v=5", "manifest.json?v=5", "icons/icon-192.png?v=5", "icons/logo-160.png?v=5", "icons/favicon-64.png?v=5"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // No tocar el login ni la base de datos de Firebase
  if (url.hostname.includes("googleapis.com") && !url.hostname.startsWith("fonts.")) return;
  if (url.hostname.includes("firebaseapp.com") || url.pathname.startsWith("/__/")) return;

  const cacheable = url.origin === location.origin || url.hostname === "www.gstatic.com" || url.hostname.startsWith("fonts.");
  if (!cacheable) return;

  // Primero internet (para tener siempre la última versión), si no hay, la copia guardada
  e.respondWith(
    (url.origin === location.origin ? fetch(req.url, {cache: "no-cache", credentials: "same-origin"}) : fetch(req)).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
