(() => {
  const installButton = document.getElementById('installButton');
  const guideButton = document.getElementById('iosGuideButton');
  const dialog = document.getElementById('installDialog');
  const dialogClose = document.getElementById('dialogClose');
  const updateToast = document.getElementById('updateToast');
  const reloadButton = document.getElementById('reloadButton');
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installButton.hidden = false;
  });

  installButton?.addEventListener('click', async () => {
    if (!deferredPrompt) {
      dialog?.showModal();
      return;
    }
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    window.DMVAULT_ANALYTICS?.track('pwa_install_prompt', { outcome: choice.outcome });
    deferredPrompt = null;
    installButton.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    window.DMVAULT_ANALYTICS?.track('pwa_installed');
    installButton.hidden = true;
  });

  guideButton?.addEventListener('click', () => dialog?.showModal());
  dialogClose?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' });
        if (registration.waiting) updateToast.hidden = false;
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) updateToast.hidden = false;
          });
        });
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  reloadButton?.addEventListener('click', async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  });

  window.DMVAULT_ANALYTICS?.track('hub_open');
})();
