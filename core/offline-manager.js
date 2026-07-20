/** DMVault Offline Package core client API v1. No UI is created here. */
(() => {
  "use strict";
  const INDEX_URL = "./core/offline-manifests/index.json";

  async function registration() {
    if (!("serviceWorker" in navigator)) throw new Error("此瀏覽器不支援離線功能");
    return navigator.serviceWorker.ready;
  }

  async function send(type, payload = {}, onProgress = null) {
    const reg = await registration();
    const worker = reg.active || reg.waiting || reg.installing;
    if (!worker) throw new Error("Service Worker 尚未就緒");
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => reject(new Error("離線核心回應逾時")), 30 * 60 * 1000);
      channel.port1.onmessage = event => {
        const data = event.data || {};
        if (data.type === "OFFLINE_PACKAGE_PROGRESS" || data.type === "OFFLINE_PACKAGE_STARTED") {
          onProgress?.(data); return;
        }
        clearTimeout(timer);
        if (data.ok === false || data.type === "OFFLINE_PACKAGE_FAILED") reject(Object.assign(new Error(data.error || "離線資料下載失敗"), { detail: data }));
        else resolve(data);
      };
      worker.postMessage({ type, ...payload }, [channel.port2]);
    });
  }

  async function getIndex() {
    const response = await fetch(INDEX_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`無法讀取離線專案清單：${response.status}`);
    return response.json();
  }

  async function getManifest(project) {
    const index = await getIndex();
    const item = index.projects.find(entry => entry.id === project);
    if (!item) throw new Error(`找不到專案：${project}`);
    const response = await fetch(item.manifest, { cache: "no-store" });
    if (!response.ok) throw new Error(`無法讀取 ${project} 離線清單：${response.status}`);
    return response.json();
  }

  async function download(project, onProgress) {
    const manifest = await getManifest(project);
    return send("DOWNLOAD_OFFLINE_PACKAGE", { manifest }, onProgress);
  }
  const remove = project => send("DELETE_OFFLINE_PACKAGE", { project });
  const status = project => send("GET_OFFLINE_PACKAGE_STATUS", { project });
  async function list() { const index = await getIndex(); return send("LIST_OFFLINE_PACKAGES", { projects: index.projects.map(p => p.id) }); }
  async function checkUpdate(project) { const [manifest, installed] = await Promise.all([getManifest(project), status(project)]); return { project, installed, availableVersion: manifest.version, updateAvailable: Boolean(installed.installed && installed.version !== manifest.version) }; }

  window.DMVaultOffline = Object.freeze({ getIndex, getManifest, download, remove, status, list, checkUpdate });
})();
