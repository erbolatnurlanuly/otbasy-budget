// Қосымша файлдарын сақтайды: интернет болса — жаңасын алады, болмаса — сақталғанын көрсетеді.
const CACHE = "budget-v5";
const FILES = ["./", "index.html", "app.css?v=5", "app.js?v=5", "quickadd.js?v=5", "shim.js?v=5", "config.js?v=5", "supabase.js", "manifest.webmanifest", "icon-180.png", "icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())) });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())) });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)) } return r })
    .catch(() => caches.match(e.request, { ignoreSearch: false }).then(r => r || caches.match("index.html"))));
});
