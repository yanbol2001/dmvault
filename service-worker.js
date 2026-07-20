const VERSION = "dmvault-platform-1.0.0-dev26";
const CORE_CACHE = `${VERSION}-core`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const CACHE_META_KEY = "./__dmvault_cache_meta__";
const CACHE_SCHEMA = 2;
const RUNTIME_CACHE_LIMIT = 60;
const CORE_FILES = [
  "./", "./index.html",
  "./core/dmvault-nav.css",
  "./core/dmvault-nav.js", "./diagnostics.html", "./offline.html", "./manifest.webmanifest",
  "./core/css/dmvault-core.css", "./core/js/config.js", "./core/js/core.js", "./core/js/preferences.js", "./core/js/analytics.js", "./core/js/data.js", "./core/js/diagnostics.js", "./core/js/ui.js", "./core/js/pwa.js",
  "./projects/index.json", "./projects/updates.json", "./projects/mh-20th.json", "./projects/pendulum-color.json", "./projects/godzilla-70th.json",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png"
];


async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map(key => cache.delete(key)));
}

async function refreshCoreCache() {
  const cache = await caches.open(CORE_CACHE);
  const results = await Promise.all(CORE_FILES.map(async file => {
    try {
      const response = await fetch(file, { cache: "reload" });
      if (!response.ok) throw new Error(`${response.status}`);
      await cache.put(file, response);
      return { file, ok: true };
    } catch {
      return { file, ok: false };
    }
  }));
  const failedFiles = results.filter(item => !item.ok).map(item => item.file);
  const refreshedAt = new Date().toISOString();
  await cache.put(CACHE_META_KEY, new Response(JSON.stringify({ refreshedAt, version: VERSION, schema: CACHE_SCHEMA }), { headers: { "Content-Type": "application/json" } }));
  return {
    ready: failedFiles.length === 0,
    cached: results.length - failedFiles.length,
    failed: failedFiles.length,
    total: results.length,
    failedFiles,
    version: VERSION,
    schema: CACHE_SCHEMA,
    refreshedAt
  };
}

self.addEventListener("install", event => {
  event.waitUntil(refreshCoreCache());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    if ("navigationPreload" in self.registration) {
      await self.registration.navigationPreload.enable();
    }
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("dmvault-platform-") && ![CORE_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function fetchWithTimeout(request, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function networkFirst(request, fallback = "./offline.html") {
  try {
    const response = await fetchWithTimeout(request);
    if (response.ok) { (await caches.open(RUNTIME_CACHE)).put(request, response.clone()); trimCache(RUNTIME_CACHE, RUNTIME_CACHE_LIMIT); }
    return response;
  } catch {
    return (await caches.match(request)) || caches.match(fallback);
  }
}

async function cacheFirstRevalidate(request) {
  const cached = await caches.match(request);
  const networkPromise = fetch(request).then(async response => {
    if (response.ok) { (await caches.open(RUNTIME_CACHE)).put(request, response.clone()); trimCache(RUNTIME_CACHE, RUNTIME_CACHE_LIMIT); }
    return response;
  }).catch(() => null);
  return cached || networkPromise || Response.error();
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      const preload = await event.preloadResponse;
      if (preload) {
        (await caches.open(RUNTIME_CACHE)).put(event.request, preload.clone());
        return preload;
      }
      return networkFirst(event.request);
    })());
    return;
  }

  // JSON 與 manifest 優先抓取最新版；離線時才使用快取。
  if (url.pathname.endsWith(".json") || event.request.destination === "manifest") {
    event.respondWith(networkFirst(event.request, "./offline.html"));
    return;
  }

  if (["style", "script", "image", "font"].includes(event.request.destination)) {
    event.respondWith(cacheFirstRevalidate(event.request));
  }
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === "GET_VERSION") {
    event.ports?.[0]?.postMessage({ version: VERSION });
    return;
  }
  if (event.data?.type === "REFRESH_CORE_CACHE") {
    event.waitUntil((async () => {
      const result = await refreshCoreCache();
      event.ports?.[0]?.postMessage(result);
    })());
    return;
  }
  if (event.data?.type === "GET_CACHE_STATUS") {
    event.waitUntil((async () => {
      const cache = await caches.open(CORE_CACHE);
      const results = await Promise.all(CORE_FILES.map(async file => ({ file, response: await cache.match(file) })));
      const missing = results.filter(item => !item.response).map(item => item.file);
      let refreshedAt = null;
      let schema = null;
      try {
        const metaResponse = await cache.match(CACHE_META_KEY);
        if (metaResponse) { const meta = await metaResponse.json(); refreshedAt = meta.refreshedAt || null; schema = meta.schema || null; }
      } catch {}
      event.ports?.[0]?.postMessage({
        ready: missing.length === 0,
        cached: CORE_FILES.length - missing.length,
        total: CORE_FILES.length,
        missing,
        version: VERSION,
        schema,
        refreshedAt
      });
    })());
  }
});
