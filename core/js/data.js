(() => {
  "use strict";
  const core = window.DMVault;
  const config = window.DMVaultConfig || {};
  const memory = new Map();
  const inflight = new Map();
  const STORAGE_PREFIX = "dmvault:data:";
  const fallbackPaths = new Set();
  function storageKey(path) { return `${STORAGE_PREFIX}${path}`; }
  function saveFallback(path, value) {
    try { localStorage.setItem(storageKey(path), JSON.stringify({ savedAt:new Date().toISOString(), value })); } catch {}
  }
  function readFallback(path, type) {
    try {
      const raw = localStorage.getItem(storageKey(path));
      if (!raw) return null;
      const stored = JSON.parse(raw);
      if (!stored || (type && !validate(type, stored.value))) return null;
      fallbackPaths.add(String(path));
      core?.emit("data:fallback", { path:String(path), savedAt:stored.savedAt || null });
      return stored.value;
    } catch { return null; }
  }

  class DataError extends Error {
    constructor(message, options = {}) { super(message, options); this.name = "DataError"; this.path = options.path || ""; this.status = options.status || 0; }
  }
  function validate(type, value) {
    const isDate = input => /^\d{4}-\d{2}-\d{2}$/.test(String(input || ""));
    if (type === "projectIndex") return value && Array.isArray(value.projects) && typeof value.platformVersion === "string";
    if (type === "project") return value && typeof value.id === "string" && typeof value.name === "string" && ["available","planned"].includes(value.status) && (!value.updated || isDate(value.updated));
    if (type === "updates") return value && Array.isArray(value.updates);
    if (type === "update") return value && typeof value.scope === "string" && typeof value.version === "string" && isDate(value.date) && Array.isArray(value.items);
    return true;
  }
  async function fetchJson(path, options = {}) {
    const key = String(path);
    if (!options.force && memory.has(key)) return memory.get(key);
    if (!options.force && inflight.has(key)) return inflight.get(key);
    const promise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Number(options.timeout) || Number(config.requestTimeoutMs) || 6500);
      try {
        const response = await fetch(key, { cache:options.cache || "no-store", signal:controller.signal });
        if (!response.ok) throw new DataError(`資料讀取失敗（${response.status}）`, { path:key, status:response.status });
        const value = await response.json();
        if (options.type && !validate(options.type, value)) throw new DataError("資料格式不符合預期", { path:key });
        memory.set(key, value);
        fallbackPaths.delete(key);
        saveFallback(key, value);
        core?.emit("data:loaded", { path:key, type:options.type || "json" });
        return value;
      } catch (error) {
        const fallback = options.allowFallback === false ? null : readFallback(key, options.type);
        if (fallback) { memory.set(key, fallback); return fallback; }
        if (error?.name === "AbortError") throw new DataError("資料讀取逾時", { path:key, cause:error });
        throw error instanceof DataError ? error : new DataError(error?.message || "資料讀取失敗", { path:key, cause:error });
      } finally { clearTimeout(timer); inflight.delete(key); }
    })();
    inflight.set(key, promise);
    return promise;
  }
  async function getRegistry(options = {}) {
    const index = await fetchJson("projects/index.json", { ...options, type:"projectIndex" });
    const results = await Promise.allSettled(index.projects.map(path => fetchJson(path, { ...options, type:"project" })));
    return {
      index,
      projects:results.filter(item => item.status === "fulfilled").map(item => item.value),
      failures:results.filter(item => item.status === "rejected").map((item, i) => ({ path:index.projects[i], error:item.reason }))
    };
  }
  async function getUpdates(options = {}) {
    const data = await fetchJson("projects/updates.json", { ...options, type:"updates" });
    return data.updates.filter(item => validate("update", item));
  }
  function clear(path) { path ? memory.delete(String(path)) : memory.clear(); }
  function snapshot() { return { cached:[...memory.keys()], pending:[...inflight.keys()], fallback:[...fallbackPaths] }; }
  function clearPersisted() { try { Object.keys(localStorage).filter(key => key.startsWith(STORAGE_PREFIX)).forEach(key => localStorage.removeItem(key)); } catch {} }
  window.DMVaultData = Object.freeze({ DataError, fetchJson, getRegistry, getUpdates, validate, clear, snapshot, clearPersisted });
})();
