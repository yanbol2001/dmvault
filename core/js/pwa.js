(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const installButton = $("install-app");
  const installStatus = $("install-status");
  const networkStatus = $("network-status");
  const cacheStatus = $("cache-status");
  const versionStatus = $("version-status");
  const appStatusCopy = $("app-status-copy");
  const iosInstallNote = $("ios-install-note");
  const updateBar = $("update-bar");
  const updateMessage = $("update-message");
  const updateButton = $("apply-update");
  const checkUpdateButton = $("check-update");
  const refreshOfflineButton = $("refresh-offline");
  const updateCheckNote = $("update-check-note");
  const CHECK_TIME_KEY = "dmvault:last-update-check";
  const expectedWorkerVersion = `dmvault-platform-${window.DMVaultConfig?.platformVersion || ""}`;
  let deferredInstallPrompt = null;
  let waitingWorker = null;
  let registrationRef = null;

  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const sendEvent = (name, params = {}) => window.gtag?.("event", name, params);

  function showToast(message, options = {}) {
    window.DMVault?.showToast(message, options);
  }
  function setCheckNote(message, state = "") {
    if (!updateCheckNote) return;
    updateCheckNote.textContent = message;
    updateCheckNote.classList.remove("ready", "warning");
    if (state) updateCheckNote.classList.add(state);
  }
  function formatLocalTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-TW", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false }).format(date);
  }
  function saveCheckTime(date = new Date()) {
    try { localStorage.setItem(CHECK_TIME_KEY, date.toISOString()); } catch {}
  }
  function restoreCheckTime() {
    try {
      const formatted = formatLocalTime(localStorage.getItem(CHECK_TIME_KEY));
      if (formatted) setCheckNote(`最近檢查：${formatted}`);
    } catch {}
  }
  function updateNetworkStatus() {
    if (!networkStatus) return;
    const online = navigator.onLine;
    networkStatus.classList.toggle("offline", !online);
    networkStatus.classList.toggle("ready", online);
    networkStatus.innerHTML = `<span class="status-dot" aria-hidden="true"></span>${online ? "目前在線" : "目前離線"}`;
    if (checkUpdateButton) checkUpdateButton.disabled = !online;
    if (refreshOfflineButton) refreshOfflineButton.disabled = !online;
  }
  async function askWorker(type, timeout = 3000) {
    const worker = navigator.serviceWorker?.controller || registrationRef?.active;
    if (!worker) return null;
    return new Promise(resolve => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), timeout);
      channel.port1.onmessage = event => { clearTimeout(timer); resolve(event.data); };
      worker.postMessage({ type }, [channel.port2]);
    });
  }

  async function updateVersionStatus() {
    if (!versionStatus) return;
    versionStatus.classList.remove("ready", "warning");
    try {
      const [indexResponse, workerInfo] = await Promise.all([
        fetch("projects/index.json", { cache: "no-store" }),
        askWorker("GET_VERSION")
      ]);
      if (!indexResponse.ok) throw new Error("index");
      const index = await indexResponse.json();
      const expected = window.DMVaultConfig?.platformVersion || "";
      const workerVersion = String(workerInfo?.version || "").replace(/^dmvault-platform-/, "");
      const synced = index.platformVersion === expected && (!workerVersion || workerVersion === expected);
      versionStatus.textContent = synced ? `版本已同步（v${expected}）` : "版本資料不一致，請檢查更新";
      versionStatus.classList.add(synced ? "ready" : "warning");
      if (!synced && updateBar) {
        if (updateMessage) updateMessage.textContent = "DMVault 偵測到版本資料不一致";
        updateBar.hidden = false;
      }
    } catch {
      versionStatus.textContent = navigator.onLine ? "暫時無法確認版本" : "離線時使用已快取版本";
      versionStatus.classList.add(navigator.onLine ? "warning" : "ready");
    }
  }

  async function updateCacheStatus() {
    if (!cacheStatus) return;
    cacheStatus.classList.remove("ready", "warning");
    if (!("serviceWorker" in navigator) || !("caches" in window)) {
      cacheStatus.textContent = "此瀏覽器不支援離線快取";
      cacheStatus.classList.add("warning");
      return;
    }
    const result = await askWorker("GET_CACHE_STATUS");
    if (!result) {
      cacheStatus.textContent = "離線資料準備中";
      return;
    }
    const ready = result.ready === true;
    const mismatch = Boolean(result.version && expectedWorkerVersion && result.version !== expectedWorkerVersion);
    const refreshed = formatLocalTime(result.refreshedAt);
    cacheStatus.classList.toggle("ready", ready && !mismatch);
    cacheStatus.classList.toggle("warning", !ready || mismatch);
    cacheStatus.textContent = mismatch
      ? "已偵測到舊版離線資料，請套用更新"
      : ready
        ? `離線資料已就緒（${result.cached}/${result.total}）${refreshed ? `・${refreshed}` : ""}`
        : `離線資料尚未完整（${result.cached}/${result.total}）`;
    if (mismatch && updateBar) {
      if (updateMessage) updateMessage.textContent = "DMVault 離線資料需要更新";
      updateBar.hidden = false;
    }
  }
  function updateInstallStatus() {
    if (!installStatus) return;
    installStatus.classList.remove("ready", "warning");
    if (!window.isSecureContext) {
      installStatus.textContent = "需使用 HTTPS 或 localhost 才能安裝";
      installStatus.classList.add("warning");
      if (installButton) installButton.hidden = true;
      if (appStatusCopy) appStatusCopy.textContent = "部署至 HTTPS 後即可使用完整安裝與離線功能。";
      return;
    }
    if (isStandalone()) {
      installStatus.textContent = "已安裝並以 App 模式執行";
      installStatus.classList.add("ready");
      if (installButton) installButton.hidden = true;
      if (iosInstallNote) iosInstallNote.hidden = true;
      if (appStatusCopy) appStatusCopy.textContent = "DMVault 已安裝，可從桌面或主畫面直接開啟。";
      return;
    }
    if (deferredInstallPrompt) {
      installStatus.textContent = "此瀏覽器可直接安裝";
      if (installButton) installButton.hidden = false;
      if (appStatusCopy) appStatusCopy.textContent = "可安裝到桌面或主畫面，並離線開啟已快取資料。";
    } else {
      installStatus.textContent = isIOS ? "可加入 iPhone／iPad 主畫面" : "可使用瀏覽器的安裝功能";
      if (iosInstallNote) iosInstallNote.hidden = !isIOS;
      if (appStatusCopy) appStatusCopy.textContent = "支援離線快取；安裝方式依瀏覽器與裝置而不同。";
    }
  }

  window.addEventListener("online", async () => { updateNetworkStatus(); setCheckNote("網路已恢復，可檢查更新"); await updateCacheStatus(); });
  window.addEventListener("offline", () => { updateNetworkStatus(); setCheckNote("離線時無法檢查更新", "warning"); });
  window.addEventListener("pageshow", updateCacheStatus);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) updateCacheStatus(); });
  updateNetworkStatus(); updateInstallStatus(); restoreCheckTime();

  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); deferredInstallPrompt = event; updateInstallStatus(); });
  installButton?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    sendEvent("pwa_install_prompt", { outcome: choice.outcome });
    deferredInstallPrompt = null; updateInstallStatus();
  });
  window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; updateInstallStatus(); showToast("DMVault 已完成安裝"); sendEvent("pwa_installed"); });

  if (!("serviceWorker" in navigator)) {
    if (installStatus) installStatus.textContent = "此瀏覽器不支援離線 App";
    setCheckNote("無法使用更新檢查", "warning");
    return;
  }

  navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" }).then(async registration => {
    registrationRef = registration;
    await navigator.serviceWorker.ready;
    await updateCacheStatus();
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      setCheckNote("正在下載新版本…");
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          waitingWorker = worker;
          setCheckNote("新版本已準備完成", "ready");
          if (updateMessage) updateMessage.textContent = "DMVault 有新版本可用";
          if (updateBar) updateBar.hidden = false;
        }
      });
    });
    if (registration.waiting) { waitingWorker = registration.waiting; setCheckNote("新版本已準備完成", "ready"); if (updateBar) updateBar.hidden = false; }
  }).catch(() => {
    if (installStatus) installStatus.textContent = "離線功能註冊失敗";
    setCheckNote("更新服務無法啟動", "warning");
  });

  checkUpdateButton?.addEventListener("click", async () => {
    if (!navigator.onLine || !registrationRef) { showToast("目前無法檢查更新"); return; }
    checkUpdateButton.disabled = true; checkUpdateButton.textContent = "檢查中…"; setCheckNote("正在檢查更新…"); sendEvent("pwa_update_check");
    try {
      await registrationRef.update();
      await new Promise(resolve => setTimeout(resolve, 900));
      const now = new Date(); saveCheckTime(now);
      if (registrationRef.waiting) {
        waitingWorker = registrationRef.waiting; setCheckNote("新版本已準備完成", "ready"); if (updateBar) updateBar.hidden = false;
      } else if (!registrationRef.installing) {
        setCheckNote(`最近檢查：${formatLocalTime(now)}，目前為最新版`, "ready"); showToast("目前已是最新版本");
      }
    } catch { setCheckNote("檢查失敗，請稍後再試", "warning"); showToast("暫時無法檢查更新"); }
    finally { checkUpdateButton.disabled = !navigator.onLine; checkUpdateButton.textContent = "檢查更新"; }
  });

  refreshOfflineButton?.addEventListener("click", async () => {
    if (!navigator.onLine) { showToast("目前離線，無法重新下載資料"); return; }
    refreshOfflineButton.disabled = true; refreshOfflineButton.textContent = "下載中…"; setCheckNote("正在重新下載離線核心資料…");
    try {
      const result = await askWorker("REFRESH_CORE_CACHE", 15000);
      if (!result) throw new Error();
      await updateCacheStatus();
      await updateVersionStatus();
      if (result.failed > 0) { setCheckNote(`仍有 ${result.failed} 個檔案下載失敗`, "warning"); showToast("部分離線資料下載失敗"); }
      else { setCheckNote(`離線資料已更新：${formatLocalTime(result.refreshedAt)}`, "ready"); showToast("離線資料已重新下載"); }
    } catch { setCheckNote("重新下載失敗，請稍後再試", "warning"); showToast("離線資料更新失敗"); }
    finally { refreshOfflineButton.disabled = !navigator.onLine; refreshOfflineButton.textContent = "重新下載離線資料"; }
  });

  updateButton?.addEventListener("click", () => {
    const worker = waitingWorker || registrationRef?.waiting;
    if (!worker) { location.reload(); return; }
    worker.postMessage({ type: "SKIP_WAITING" });
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => location.reload());
})();
