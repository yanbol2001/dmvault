const VERSION = "dmvault-platform-1.2.2-mh-mobile-source-static-v1";
const CORE_CACHE = `${VERSION}-core`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const OFFLINE_CACHE_PREFIX = "dmvault-offline-package-";
const OFFLINE_TEMP_PREFIX = "dmvault-offline-temp-";
const OFFLINE_META_CACHE = "dmvault-offline-metadata-v1";
const CACHE_META_KEY = "./__dmvault_cache_meta__";
const CACHE_SCHEMA = 3;
const RUNTIME_CACHE_LIMIT = 60;
const CORE_FILES = [
  "./", "./index.html",
  "./core/dmvault-nav.css", "./core/dmvault-nav.js", "./core/analytics.js", "./core/feedback.css", "./core/feedback-config.js", "./core/feedback.js", "./core/offline-manager.js", "./core/offline-ui.css", "./core/offline-ui.js",
  "./core/offline-manifests/index.json", "./core/offline-manifests/mh-20th.json", "./core/offline-manifests/pendulum-color.json", "./core/offline-manifests/godzilla-70th.json",
  "./diagnostics.html", "./offline.html", "./manifest.webmanifest",
  "./core/css/dmvault-core.css", "./core/js/config.js", "./core/js/core.js", "./core/js/preferences.js", "./core/js/analytics.js", "./core/js/data.js", "./core/js/diagnostics.js", "./core/js/ui.js", "./core/js/pwa.js",
  "./projects/index.json", "./projects/updates.json", "./projects/mh-20th.json", "./projects/pendulum-color.json", "./projects/godzilla-70th.json",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
  "./mh-20th/", "./mh-20th/index.html",
  "./pendulum-color/", "./pendulum-color/index.html",
  "./godzilla-70th/", "./godzilla-70th/index.html"
];

const safePart = value => String(value || "unknown").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);
const packageCacheName = (project, version) => `${OFFLINE_CACHE_PREFIX}${safePart(project)}-${safePart(version)}`;
const metadataURL = project => new URL(`./__dmvault_offline_metadata__/${encodeURIComponent(project)}`, self.registration.scope).href;

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
    } catch (error) {
      return { file, ok: false, error: String(error) };
    }
  }));
  const failedFiles = results.filter(item => !item.ok).map(item => item.file);
  const refreshedAt = new Date().toISOString();
  await cache.put(CACHE_META_KEY, new Response(JSON.stringify({ refreshedAt, version: VERSION, schema: CACHE_SCHEMA }), { headers: { "Content-Type": "application/json" } }));
  return { ready: failedFiles.length === 0, cached: results.length - failedFiles.length, failed: failedFiles.length, total: results.length, failedFiles, version: VERSION, schema: CACHE_SCHEMA, refreshedAt };
}

async function readPackageMetadata(project) {
  try {
    const cache = await caches.open(OFFLINE_META_CACHE);
    const response = await cache.match(metadataURL(project));
    return response ? await response.json() : null;
  } catch { return null; }
}

async function writePackageMetadata(project, metadata) {
  const cache = await caches.open(OFFLINE_META_CACHE);
  await cache.put(metadataURL(project), new Response(JSON.stringify(metadata), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }));
}

async function deletePackageMetadata(project) {
  const cache = await caches.open(OFFLINE_META_CACHE);
  await cache.delete(metadataURL(project));
}

async function projectCacheNames(project) {
  const prefix = `${OFFLINE_CACHE_PREFIX}${safePart(project)}-`;
  return (await caches.keys()).filter(name => name.startsWith(prefix));
}

function post(port, payload) { try { port?.postMessage(payload); } catch {} }

async function downloadOfflinePackage(manifest, port) {
  if (!manifest || manifest.schema !== 1 || !manifest.id || !manifest.version || !Array.isArray(manifest.files)) {
    throw new Error("離線資料清單格式不正確");
  }
  const project = safePart(manifest.id);
  const finalName = packageCacheName(project, manifest.version);
  const tempName = `${OFFLINE_TEMP_PREFIX}${project}-${Date.now()}`;
  const tempCache = await caches.open(tempName);
  const uniqueFiles = [...new Set(manifest.files.map(String))];
  const failures = [];
  let completed = 0;
  let downloadedBytes = 0;
  post(port, { type: "OFFLINE_PACKAGE_STARTED", project, version: manifest.version, total: uniqueFiles.length });

  const worker = async file => {
    try {
      const request = new Request(new URL(file, self.registration.scope).href, { credentials: "same-origin", cache: "reload" });
      const response = await fetch(request);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const length = Number(response.headers.get("content-length") || 0);
      await tempCache.put(request, response.clone());
      downloadedBytes += length;
    } catch (error) {
      failures.push({ file, error: String(error?.message || error) });
    } finally {
      completed += 1;
      post(port, { type: "OFFLINE_PACKAGE_PROGRESS", project, completed, total: uniqueFiles.length, failed: failures.length, downloadedBytes, file });
    }
  };

  // Moderate concurrency avoids overwhelming mobile browsers and GitHub Pages.
  const queue = [...uniqueFiles];
  const runners = Array.from({ length: Math.min(6, queue.length || 1) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);

  if (failures.length) {
    await caches.delete(tempName);
    const result = { ok: false, project, version: manifest.version, total: uniqueFiles.length, completed, failures, failed: failures.length };
    post(port, { type: "OFFLINE_PACKAGE_FAILED", ...result });
    return result;
  }

  // Commit atomically: copy fully downloaded temp cache, then remove old versions.
  await caches.delete(finalName);
  const finalCache = await caches.open(finalName);
  for (const request of await tempCache.keys()) {
    const response = await tempCache.match(request);
    if (response) await finalCache.put(request, response);
  }
  await caches.delete(tempName);
  const oldNames = (await projectCacheNames(project)).filter(name => name !== finalName);
  await Promise.all(oldNames.map(name => caches.delete(name)));
  const metadata = { project, name: manifest.name || project, version: String(manifest.version), cacheName: finalName, fileCount: uniqueFiles.length, estimatedBytes: Number(manifest.estimatedBytes || downloadedBytes || 0), installedAt: new Date().toISOString(), schema: 1 };
  await writePackageMetadata(project, metadata);
  const result = { ok: true, ...metadata };
  post(port, { type: "OFFLINE_PACKAGE_COMPLETE", ...result });
  return result;
}

async function deleteOfflinePackage(project) {
  const names = await projectCacheNames(project);
  await Promise.all(names.map(name => caches.delete(name)));
  await deletePackageMetadata(project);
  return { ok: true, project, deletedCaches: names.length };
}

async function getOfflinePackageStatus(project) {
  const metadata = await readPackageMetadata(project);
  const names = await projectCacheNames(project);
  if (!metadata || !names.includes(metadata.cacheName)) return { installed: false, project, cacheNames: names };
  const cache = await caches.open(metadata.cacheName);
  const keys = await cache.keys();
  return { installed: true, ...metadata, cachedFiles: keys.length };
}

self.addEventListener("install", event => { event.waitUntil(refreshCoreCache()); });
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    if ("navigationPreload" in self.registration) await self.registration.navigationPreload.enable();
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("dmvault-platform-") && ![CORE_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key)));
    // Interrupted temporary package downloads are never kept.
    await Promise.all(keys.filter(key => key.startsWith(OFFLINE_TEMP_PREFIX)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function fetchWithTimeout(request, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function matchAnyCache(request) {
  let cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const url = new URL(request.url);
  if (url.pathname.endsWith("/")) {
    const indexURL = new URL("index.html", url).href;
    cached = await caches.match(indexURL, { ignoreSearch: true });
  }
  return cached || null;
}

async function networkFirst(request, fallback = "./offline.html") {
  try {
    const response = await fetchWithTimeout(request);
    if (response.ok) { (await caches.open(RUNTIME_CACHE)).put(request, response.clone()); trimCache(RUNTIME_CACHE, RUNTIME_CACHE_LIMIT); }
    return response;
  } catch {
    return (await matchAnyCache(request)) || caches.match(fallback, { ignoreSearch: true });
  }
}

async function cacheFirstRevalidate(request) {
  const cached = await matchAnyCache(request);
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
      if (preload) { (await caches.open(RUNTIME_CACHE)).put(event.request, preload.clone()); return preload; }
      return networkFirst(event.request);
    })());
    return;
  }
  if (url.pathname.endsWith(".json") || event.request.destination === "manifest") { event.respondWith(networkFirst(event.request, "./offline.html")); return; }
  if (["style", "script", "image", "font", "audio", "video"].includes(event.request.destination)) event.respondWith(cacheFirstRevalidate(event.request));
});

self.addEventListener("message", event => {
  const data = event.data || {};
  const port = event.ports?.[0];
  if (data.type === "SKIP_WAITING") { self.skipWaiting(); return; }
  if (data.type === "GET_VERSION") { post(port, { version: VERSION, schema: CACHE_SCHEMA }); return; }
  if (data.type === "REFRESH_CORE_CACHE") { event.waitUntil(refreshCoreCache().then(result => post(port, result))); return; }
  if (data.type === "DOWNLOAD_OFFLINE_PACKAGE") {
    event.waitUntil(downloadOfflinePackage(data.manifest, port).catch(error => post(port, { type: "OFFLINE_PACKAGE_FAILED", ok: false, error: String(error?.message || error) })));
    return;
  }
  if (data.type === "DELETE_OFFLINE_PACKAGE") {
    event.waitUntil(deleteOfflinePackage(data.project).then(result => post(port, result)).catch(error => post(port, { ok: false, error: String(error) })));
    return;
  }
  if (data.type === "GET_OFFLINE_PACKAGE_STATUS") {
    event.waitUntil(getOfflinePackageStatus(data.project).then(result => post(port, result)));
    return;
  }
  if (data.type === "LIST_OFFLINE_PACKAGES") {
    event.waitUntil(Promise.all((data.projects || []).map(getOfflinePackageStatus)).then(packages => post(port, { packages })));
    return;
  }
  if (data.type === "GET_CACHE_STATUS") {
    event.waitUntil((async () => {
      const cache = await caches.open(CORE_CACHE);
      const results = await Promise.all(CORE_FILES.map(async file => ({ file, response: await cache.match(file) })));
      const missing = results.filter(item => !item.response).map(item => item.file);
      let refreshedAt = null, schema = null;
      try { const metaResponse = await cache.match(CACHE_META_KEY); if (metaResponse) { const meta = await metaResponse.json(); refreshedAt = meta.refreshedAt || null; schema = meta.schema || null; } } catch {}
      post(port, { ready: missing.length === 0, cached: CORE_FILES.length - missing.length, total: CORE_FILES.length, missing, version: VERSION, schema, refreshedAt });
    })());
  }
});
