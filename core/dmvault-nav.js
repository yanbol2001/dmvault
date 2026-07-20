(() => {
  "use strict";

  const script = document.currentScript;
  if (!script || document.querySelector(".dmvault-platform-nav")) return;

  const root = script.dataset.dmvaultRoot || "../";
  const base = root.endsWith("/") ? root : `${root}/`;

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = `${base}core/dmvault-nav.css`;
  document.head.appendChild(stylesheet);

  const path = location.pathname.toLowerCase();
  const current = path.includes("/mh-20th/")
    ? "mh"
    : path.includes("/pendulum-color/")
      ? "pendulum"
      : path.includes("/godzilla-70th/")
        ? "godzilla"
        : "home";

  const links = [
    { id: "home", label: "DMVault", href: base, className: "dmvault-home" },
    { id: "mh", label: "MH 20th", href: `${base}mh-20th/` },
    { id: "pendulum", label: "Pendulum COLOR", href: `${base}pendulum-color/` },
    { id: "godzilla", label: "Godzilla 70th", href: `${base}godzilla-70th/` }
  ];

  const nav = document.createElement("nav");
  nav.className = "dmvault-platform-nav";
  nav.setAttribute("aria-label", "DMVault 專案導覽");

  for (const item of links) {
    const anchor = document.createElement("a");
    anchor.href = item.href;
    anchor.textContent = item.label;
    if (item.className) anchor.className = item.className;
    if (item.id === current) anchor.setAttribute("aria-current", "page");
    nav.appendChild(anchor);
  }

  const mount = () => document.body.insertBefore(nav, document.body.firstChild);
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
})();
