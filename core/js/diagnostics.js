(() => {
  "use strict";
  const core = window.DMVault;
  const data = window.DMVaultData;
  const config = window.DMVaultConfig || {};
  const required = [
    ["平台設定", "core/js/config.js"], ["平台 Core", "core/js/core.js"], ["Data Engine", "core/js/data.js"],
    ["介面程式", "core/js/ui.js"], ["PWA 程式", "core/js/pwa.js"], ["作品索引", "projects/index.json"],
    ["更新紀錄", "projects/updates.json"], ["Manifest", "manifest.webmanifest"], ["Service Worker", "service-worker.js"]
  ];
  const checkResource = async ([label, path]) => {
    try { const response = await fetch(path, { cache:"no-store" }); return { label, path, ok:response.ok, status:response.status }; }
    catch (error) { return { label, path, ok:false, status:0, error:error?.message || "network" }; }
  };
  async function runIntegrityCheck() {
    const resources = await Promise.all(required.map(checkResource));
    let registry = null, updates = null, dataError = null;
    try { registry = await data.getRegistry({ force:true }); updates = await data.getUpdates({ force:true }); }
    catch (error) { dataError = error; }
    const indexVersion = registry?.index?.platformVersion || "";
    const versionSynced = Boolean(indexVersion && indexVersion === config.platformVersion);
    const missing = resources.filter(item => !item.ok);
    return {
      checkedAt:new Date().toISOString(), platformVersion:config.platformVersion || "", indexVersion,
      versionSynced, resources, missing, projects:registry?.projects?.length || 0,
      projectFailures:registry?.failures?.length || 0, updates:updates?.length || 0,
      ok:missing.length === 0 && !dataError && versionSynced && (registry?.failures?.length || 0) === 0,
      dataError:dataError?.message || null, debug:core?.debugEnabled?.() || false,
      userAgent:navigator.userAgent, standalone:matchMedia("(display-mode: standalone)").matches
    };
  }
  window.DMVaultDiagnostics = Object.freeze({ runIntegrityCheck, required });
})();
