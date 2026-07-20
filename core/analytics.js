(() => {
  const config = window.DMVAULT_CONFIG;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  window.DMVAULT_ANALYTICS = {
    track(eventName, params = {}) {
      if (typeof window.gtag !== 'function') return;
      window.gtag('event', eventName, {
        project_name: config.project,
        app_version: config.version,
        display_mode: standalone ? 'standalone' : 'browser',
        ...params
      });
    }
  };
})();
