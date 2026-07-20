const BUILD = "7.4.1-pwa-20260720-integration-fix2";
const CACHE_PREFIX = "dmvault-mh20th";
const CORE_CACHE = `${CACHE_PREFIX}-core-${BUILD}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${BUILD}`;
const CORE = [
  "./", "./index.html",
  "../core/dmvault-nav.css",
  "../core/dmvault-nav.js", "./guide.html", "./stage.html", "./background.html",
  "./style.css", "./manifest.webmanifest", "./pwa/project-config.js",
  "./pwa/dmvault-pwa.js", "./pwa/dmvault-pwa.css", "./icons/icon-192.png",
  "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png",
  "./evolution/index.html", "./evolution/dex/index.html"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CORE_CACHE).then(cache => cache.addAll(CORE)));
});
self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && ![CORE_CACHE,RUNTIME_CACHE].includes(k)).map(k => caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).then(res => {
      const copy=res.clone(); caches.open(RUNTIME_CACHE).then(c=>c.put(req,copy)); return res;
    }).catch(async()=> (await caches.match(req)) || (await caches.match("./index.html"))));
    return;
  }
  event.respondWith(caches.match(req).then(cached => {
    const network=fetch(req).then(res=>{
      if(res.ok){const copy=res.clone();caches.open(RUNTIME_CACHE).then(c=>c.put(req,copy));}
      return res;
    }).catch(()=>cached);
    return cached || network;
  }));
});
