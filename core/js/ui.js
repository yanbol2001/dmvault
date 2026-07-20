(() => {
  "use strict";
  const core = window.DMVault || {};
  const $ = core.$ || ((selector, scope = document) => scope.querySelector(selector));
  const escapeHtml = core.escapeHtml || (value => String(value));
  const config = window.DMVaultConfig || {};
  const dataEngine = window.DMVaultData;
  function renderProject(project) {
    const tags = (project.tags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    const available = project.status === "available";
    const action = available && project.url
      ? `<a class="project-action" href="${escapeHtml(project.url)}" data-project-id="${escapeHtml(project.id)}" target="_blank" rel="noopener"><span>進入作品</span><span class="action-arrow" aria-hidden="true">→</span></a>`
      : `<span class="project-action disabled" aria-disabled="true">準備中</span>`;
    return `<article class="project-card"><div class="project-card-top"><span class="project-status ${escapeHtml(project.status || "planned")}">${available ? "可使用" : "準備中"}</span>${project.isNew ? '<span class="new-badge">NEW</span>' : ""}</div><h3>${escapeHtml(project.name)}</h3><p class="project-subtitle">${escapeHtml(project.subtitle || "")}</p><p class="project-description">${escapeHtml(project.description || "")}</p><div class="tag-list">${tags}</div><div class="version-row"><span>Content</span><strong>v${escapeHtml(project.contentVersion || "0.0.0")}</strong><time datetime="${escapeHtml(project.updated || "")}">${escapeHtml(project.updated || "尚未發布")}</time></div>${action}</article>`;
  }
  function renderUpdate(update) {
    const items = (update.items || []).map(item => `<li>${escapeHtml(item)}</li>`).join("");
    return `<article class="update-item"><div class="update-meta"><span>${escapeHtml(update.scope)}</span><strong>v${escapeHtml(update.version)}</strong><time datetime="${escapeHtml(update.date)}">${escapeHtml(update.date)}</time></div><div><h3>${escapeHtml(update.title)}</h3><ul>${items}</ul></div></article>`;
  }
  function setText(selector, value) { const node = $(selector); if (node) node.textContent = value; }
  function renderSkeletons(target, count, type) { target.innerHTML = Array.from({length:count},()=>`<div class="loading-skeleton ${type}" aria-hidden="true"><span></span><span></span><span></span></div>`).join(""); }
  function renderLoadError(target, message, retryAction) { target.innerHTML = `<div class="load-error"><p>${escapeHtml(message)}</p><button class="secondary-button retry-button" type="button" data-retry="${retryAction}">重新載入</button></div>`; }

  function setupSectionNavigation() {
    const links=[...document.querySelectorAll('.main-nav a[href^="#"]')]; const sections=links.map(link=>document.querySelector(link.getAttribute('href'))).filter(Boolean);
    if (!links.length||!sections.length||!('IntersectionObserver' in window)) return;
    const observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(!visible)return;links.forEach(link=>{const active=link.getAttribute('href')===`#${visible.target.id}`;link.classList.toggle('active',active);active?link.setAttribute('aria-current','location'):link.removeAttribute('aria-current');});},{rootMargin:'-25% 0px -60% 0px',threshold:[0,.25,.5,.75]});
    sections.forEach(section=>observer.observe(section));
  }

  async function loadProjects() {
    const grid=$("#project-grid"); if (!grid) return;
    renderSkeletons(grid,3,"project-skeleton"); setText("#project-summary","作品資料載入中");
    try {
      const registry=await dataEngine.getRegistry({ force:true });
      const files=registry.index.projects;
      const projects=registry.projects;
      const failed=registry.failures.length;
      if (!projects.length) throw new Error("all project files failed");
      grid.innerHTML=projects.map(renderProject).join("")+(failed?`<p class="partial-warning">另有 ${failed} 個作品資料暫時無法載入。</p>`:"");
      const available=projects.filter(p=>p.status==="available").length;
      setText("#project-summary",failed?`${available} 個作品可使用・${failed} 個載入失敗`:`${available} 個作品可使用`);
      setText("#stat-total",files.length); setText("#stat-available",available); setText("#footer-project-count",`作品：${files.length}`);
    } catch { renderLoadError(grid,"作品資料載入失敗，請確認網路後重新載入。","projects"); setText("#project-summary","作品資料載入失敗"); }
  }

  async function loadUpdates() {
    const list=$("#update-list"); if (!list) return;
    renderSkeletons(list,2,"update-skeleton"); setText("#update-summary","更新紀錄載入中");
    try {
      const all=await dataEngine.getUpdates({ force:true }); const limit=Number(config.latestUpdateLimit)||3; let expanded=Boolean(window.DMVaultPreferences?.get("updatesExpanded", false)); const toggle=$("#toggle-updates");
      const render=()=>{const visible=expanded?all:all.slice(0,limit);list.innerHTML=visible.map(renderUpdate).join("");setText("#update-summary",expanded?`顯示全部 ${all.length} 筆更新`:`顯示最近 ${visible.length} 筆更新`);if(toggle){toggle.hidden=all.length<=limit;toggle.textContent=expanded?"收合更新":`顯示全部 ${all.length} 筆`;toggle.setAttribute("aria-expanded",String(expanded));}};
      if(toggle&&!toggle.dataset.bound){toggle.dataset.bound="true";toggle.addEventListener("click",()=>{expanded=!expanded;window.DMVaultPreferences?.set("updatesExpanded",expanded);render();});} render();
    } catch { renderLoadError(list,"更新紀錄暫時無法載入。","updates"); setText("#update-summary","更新紀錄載入失敗"); }
  }


  function setupMobileNavigation() {
    const button = $("#menu-button");
    const nav = $("#main-nav");
    if (!button || !nav) return;
    const close = () => { button.setAttribute("aria-expanded", "false"); nav.classList.remove("open"); document.body.classList.remove("menu-open"); };
    button.addEventListener("click", () => {
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("open", open);
      document.body.classList.toggle("menu-open", open);
    });
    nav.addEventListener("click", event => { if (event.target.closest("a")) close(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
    matchMedia("(min-width: 901px)").addEventListener?.("change", event => { if (event.matches) close(); });
  }

  function setupDataFallbackNotice() {
    const notice = $("#data-fallback-notice");
    if (!notice || !core.on) return;
    core.on("data:fallback", event => {
      notice.hidden = false;
      const savedAt = event.detail?.savedAt ? core.formatDateTime(event.detail.savedAt) : "先前";
      notice.textContent = `目前使用 ${savedAt} 成功載入的備援資料；恢復連線後可重新載入最新版。`;
    });
    core.on("data:loaded", () => {
      const snapshot = dataEngine?.snapshot?.();
      if (!snapshot?.fallback?.length) notice.hidden = true;
    });
  }

  function setupBackToTop() {
    const button = $("#back-to-top");
    if (!button) return;
    const sync = () => { button.hidden = window.scrollY < 620; };
    window.addEventListener("scroll", sync, { passive:true });
    button.addEventListener("click", () => window.scrollTo({ top:0, behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
    sync();
  }

  async function init() {
    const version=config.platformVersion||"0.0.0", updated=config.lastUpdated||"";
    setText("#platform-version",`Platform v${version}`); setText("#platform-updated",updated); setText("#footer-version",`Platform v${version}`); setText("#stat-version",`v${version}`); setText("#stat-updated",updated);
    document.addEventListener("click",event=>{const button=event.target.closest("[data-retry]");if(!button)return;button.dataset.retry==="projects"?loadProjects():loadUpdates();});
    await Promise.all([loadProjects(),loadUpdates()]);
  }
  document.addEventListener("DOMContentLoaded",()=>{setupSectionNavigation();setupMobileNavigation();setupDataFallbackNotice();setupBackToTop();init();});
})();
