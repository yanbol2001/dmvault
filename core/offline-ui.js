(() => {
  "use strict";
  const grid = document.getElementById("offline-project-grid");
  const storage = document.getElementById("offline-storage");
  if (!grid) return;

  const state = new Map();
  const busy = new Set();
  const fmtBytes = value => {
    const n = Number(value || 0);
    if (!n) return "大小未知";
    const units = ["B", "KB", "MB", "GB"];
    let v = n, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
    return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
  };
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

  function toast(message) {
    const el = document.getElementById("app-toast");
    if (!el) return;
    el.textContent = message; el.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function track(action, project) {
    try { window.gtag?.("event", action, { project_id: project, platform_area: "offline_package" }); } catch {}
  }

  async function updateStorage() {
    if (!storage) return;
    try {
      if (!navigator.storage?.estimate) throw new Error();
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      storage.textContent = quota ? `瀏覽器儲存空間：${fmtBytes(usage)} / ${fmtBytes(quota)}` : `已使用：${fmtBytes(usage)}`;
    } catch { storage.textContent = "儲存空間由瀏覽器管理"; }
  }

  function cardMarkup(item) {
    const s = state.get(item.id) || { installed: false };
    const isBusy = busy.has(item.id);
    const update = Boolean(s.installed && s.version !== item.version);
    const badgeClass = s.error ? "error" : update ? "update" : s.installed ? "installed" : "";
    const badge = s.error ? "發生錯誤" : update ? "可更新" : s.installed ? "已下載" : "未下載";
    let detail = `共 ${item.fileCount} 個檔案，預估 ${fmtBytes(item.estimatedBytes)}。`;
    if (s.installed) detail = `已下載 ${s.cachedFiles || s.fileCount || item.fileCount} 個檔案，安裝版本 ${esc(s.version)}。`;
    if (s.message) detail = esc(s.message);
    const progress = s.progress ? Math.max(0, Math.min(100, Math.round((s.progress.completed / Math.max(1, s.progress.total)) * 100))) : 0;
    const primaryText = isBusy ? "處理中…" : update ? "更新離線資料" : s.installed ? "重新下載" : "下載離線資料";
    return `<article class="offline-card" data-project="${esc(item.id)}">
      <div class="offline-card-head"><div><h3>${esc(item.name)}</h3><span class="offline-version">可用版本：${esc(item.version)}</span></div><span class="offline-badge ${badgeClass}">${badge}</span></div>
      <p class="offline-detail">${detail}</p>
      <div class="offline-progress-wrap" ${s.progress || isBusy ? "" : "hidden"}>
        <div class="offline-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div>
        <div class="offline-progress-text"><span>${s.progress ? `${s.progress.completed} / ${s.progress.total}` : "準備中"}</span><span>${progress}%${s.progress?.failed ? `・失敗 ${s.progress.failed}` : ""}</span></div>
      </div>
      <div class="offline-card-actions">
        <button class="offline-button" type="button" data-action="download" ${isBusy ? "disabled" : ""}>${primaryText}</button>
        ${s.installed ? `<button class="offline-button danger" type="button" data-action="delete" ${isBusy ? "disabled" : ""}>刪除離線資料</button>` : ""}
      </div>
    </article>`;
  }

  function render() {
    const index = window.__dmvaultOfflineIndex;
    if (!index) return;
    grid.innerHTML = index.projects.map(cardMarkup).join("");
  }

  async function refreshStatus() {
    const index = window.__dmvaultOfflineIndex;
    if (!index) return;
    try {
      const result = await window.DMVaultOffline.list();
      for (const packageStatus of result.packages || []) state.set(packageStatus.project, packageStatus);
      render();
    } catch (error) {
      grid.innerHTML = `<div class="offline-error">無法讀取離線資料狀態：${esc(error.message)}</div>`;
    }
  }

  async function download(project) {
    busy.add(project);
    state.set(project, { ...(state.get(project) || {}), message: "正在準備下載…", progress: { completed: 0, total: 1, failed: 0 } });
    render(); track("offline_package_download_start", project);
    try {
      const result = await window.DMVaultOffline.download(project, progress => {
        const current = state.get(project) || {};
        state.set(project, { ...current, message: `正在下載離線資料${progress.file ? `：${progress.file.split("/").pop()}` : ""}`, progress: { completed: progress.completed || 0, total: progress.total || 1, failed: progress.failed || 0 } });
        render();
      });
      state.set(project, { ...result, installed: true, message: "離線資料已完整下載，可以在沒有網路時使用。" });
      track("offline_package_download_complete", project); toast("離線資料下載完成");
    } catch (error) {
      const old = state.get(project) || {};
      state.set(project, { ...old, error: true, message: `下載未完成：${error.message}`, progress: null });
      track("offline_package_download_failed", project); toast("離線資料下載失敗，原有版本不受影響");
    } finally { busy.delete(project); render(); updateStorage(); }
  }

  async function remove(project) {
    if (!confirm("確定要刪除這個作品的離線資料嗎？作品仍可在有網路時使用。")) return;
    busy.add(project); render();
    try {
      await window.DMVaultOffline.remove(project);
      state.set(project, { installed: false, message: "離線資料已刪除。" });
      track("offline_package_delete", project); toast("離線資料已刪除");
    } catch (error) {
      state.set(project, { ...(state.get(project) || {}), error: true, message: `刪除失敗：${error.message}` });
    } finally { busy.delete(project); render(); updateStorage(); }
  }

  grid.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    const card = event.target.closest("[data-project]");
    if (!button || !card) return;
    const project = card.dataset.project;
    button.dataset.action === "delete" ? remove(project) : download(project);
  });

  async function init() {
    if (!window.DMVaultOffline) { grid.innerHTML = '<div class="offline-error">離線管理核心未載入。</div>'; return; }
    try {
      window.__dmvaultOfflineIndex = await window.DMVaultOffline.getIndex();
      render(); await refreshStatus(); await updateStorage();
    } catch (error) { grid.innerHTML = `<div class="offline-error">離線資料中心載入失敗：${esc(error.message)}</div>`; }
  }

  document.getElementById("refresh-offline")?.addEventListener("click", event => {
    event.preventDefault(); document.getElementById("offline-data")?.scrollIntoView({ behavior: "smooth" });
  });
  init();
})();
