(() => {
  "use strict";
  const cfg = window.DMVaultConfig || {};
  const rootUrl = new URL(document.documentElement.dataset.dmvaultRoot || "./", document.baseURI);
  const absolute = path => new URL(path, rootUrl).href;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  // GA4 is loaded once by the platform shared analytics module.
  const track = (name, params={}) => {
    if (window.DMVaultAnalytics?.track) {
      window.DMVaultAnalytics.track(name, {
        project_id: cfg.projectId,
        app_version: cfg.version,
        ...params
      });
    }
  };
  window.DMVaultTrack = track;

  track("dmvault_launch", {
    project_id: cfg.projectId,
    launch_mode: standalone ? "standalone" : "browser",
    platform_family: isIOS ? "ios" : (/android/i.test(navigator.userAgent) ? "android" : "desktop")
  });

  document.addEventListener("click", event => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    const url = new URL(link.href, location.href);
    track(url.origin === location.origin ? "navigation_click" : "outbound_click", {
      link_text: (link.textContent || "").trim().slice(0, 100),
      link_url: url.href,
      destination_path: url.pathname
    });
  }, {capture:true});

  window.addEventListener("appinstalled", () => {
    localStorage.setItem(`dmvault-installed-${cfg.projectId}`, new Date().toISOString());
    track("pwa_installed", { platform_family: isIOS ? "ios" : "other" });
    document.querySelector(".dmvault-install-tip")?.remove();
  });

  function toast(message, buttonText, onClick, className="") {
    const old = document.querySelector(".dmvault-pwa-toast");
    if (old) old.remove();
    const box = document.createElement("div");
    box.className = `dmvault-pwa-toast ${className}`.trim();
    box.innerHTML = `<span></span><button type="button"></button><button class="dmvault-toast-close" type="button" aria-label="關閉">×</button>`;
    box.querySelector("span").textContent = message;
    const action = box.querySelector("button:not(.dmvault-toast-close)");
    action.textContent = buttonText;
    action.onclick = onClick;
    box.querySelector(".dmvault-toast-close").onclick = () => box.remove();
    document.body.appendChild(box);
    return box;
  }

  let deferredInstall;
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstall = event;
    if (standalone || sessionStorage.getItem("dmvault-install-dismissed")) return;
    const box = toast("可將 DMVault 安裝到裝置，離線時也能開啟。", "安裝", async () => {
      box.remove();
      deferredInstall.prompt();
      const choice = await deferredInstall.userChoice;
      track("pwa_install_prompt_result", { outcome: choice.outcome });
      deferredInstall = null;
    }, "dmvault-install-tip");
    box.querySelector(".dmvault-toast-close").addEventListener("click", () => sessionStorage.setItem("dmvault-install-dismissed", "1"));
  });

  // iOS has no beforeinstallprompt. Give Safari users the correct manual path once.
  if (isIOS && !standalone && !sessionStorage.getItem("dmvault-ios-tip")) {
    window.addEventListener("load", () => setTimeout(() => {
      const box = toast("iPhone／iPad：請用 Safari 的分享按鈕，選擇「加入主畫面」。", "知道了", () => {
        sessionStorage.setItem("dmvault-ios-tip", "1"); box.remove();
      }, "dmvault-install-tip");
    }, 1400), {once:true});
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register(absolute(cfg.serviceWorker || "service-worker.js"), {
          scope: rootUrl.pathname,
          updateViaCache: "none"
        });
        registration.update();
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (!refreshing) { refreshing = true; location.reload(); }
        });
        const showUpdate = worker => {
          if (!worker) return;
          const box = toast("DMVault 有新版可用。", "立即更新", () => {
            worker.postMessage({type:"SKIP_WAITING"});
            box.querySelector("button:not(.dmvault-toast-close)").disabled = true;
          }, "dmvault-update-tip");
        };
        if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate(worker);
          });
        });
      } catch (error) {
        console.warn("DMVault PWA registration failed:", error);
      }
    }, {once:true});
  }
})();
