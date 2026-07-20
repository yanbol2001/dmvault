(() => {
  const config = window.DMVaultConfig || {};
  const id = config.ga4MeasurementId;
  if (!id || id.includes("XXXX")) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){ dataLayer.push(arguments); };
  gtag("js", new Date());
  gtag("config", id, { anonymize_ip: true, send_page_view: true });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);

  document.addEventListener("click", event => {
    const project = event.target.closest("[data-project-id]");
    if (project) gtag("event", "project_open", { project_id: project.dataset.projectId, link_url: project.href });

    const nav = event.target.closest('.main-nav a[href^="#"]');
    if (nav) gtag("event", "section_navigation", { section: nav.getAttribute("href").slice(1) });

    const updates = event.target.closest("#toggle-updates");
    if (updates) gtag("event", "updates_toggle", { expanded: updates.getAttribute("aria-expanded") !== "true" });
  });
})();
