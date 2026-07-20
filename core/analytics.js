(() => {
  'use strict';

  const MEASUREMENT_ID = 'G-LQEFPC3QCF';
  const PLATFORM_VERSION = '1.0.0-dev26';
  const PROJECT_VERSIONS = {
    hub: '1.0.0-dev26',
    'mh-20th': 'V7 Phase 4.1',
    'pendulum-color': 'v0.81',
    'godzilla-70th': 'V3.0 RC9.8'
  };

  if (window.__DMVAULT_ANALYTICS_LOADED__) return;
  window.__DMVAULT_ANALYTICS_LOADED__ = true;

  const path = location.pathname.toLowerCase();
  const project = path.includes('/mh-20th/') ? 'mh-20th'
    : path.includes('/pendulum-color/') ? 'pendulum-color'
    : path.includes('/godzilla-70th/') ? 'godzilla-70th'
    : 'hub';

  const displayMode = (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  ) ? 'pwa' : 'browser';

  const commonParams = () => ({
    platform_name: 'DMVault',
    platform_version: PLATFORM_VERSION,
    project_name: project,
    project_version: PROJECT_VERSIONS[project] || 'unknown',
    display_mode: displayMode,
    connection_mode: navigator.onLine ? 'online' : 'offline'
  });

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);

  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID, {
    send_page_view: false,
    anonymize_ip: true,
    transport_type: 'beacon'
  });

  function track(eventName, params = {}) {
    if (!eventName || typeof eventName !== 'string') return;
    gtag('event', eventName, { ...commonParams(), ...params });
  }

  function pageView() {
    track('page_view', {
      page_title: document.title,
      page_location: location.href,
      page_path: `${location.pathname}${location.search}${location.hash}`
    });
  }

  window.DMVaultAnalytics = Object.freeze({
    measurementId: MEASUREMENT_ID,
    project,
    displayMode,
    track,
    pageView
  });
  window.DMVAULT_ANALYTICS = window.DMVaultAnalytics;

  pageView();

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link) return;

    const href = link.href;
    let targetUrl;
    try { targetUrl = new URL(href, location.href); } catch { return; }

    const targetPath = targetUrl.pathname.toLowerCase();
    const targetProject = targetPath.includes('/mh-20th/') ? 'mh-20th'
      : targetPath.includes('/pendulum-color/') ? 'pendulum-color'
      : targetPath.includes('/godzilla-70th/') ? 'godzilla-70th'
      : targetPath.includes('/dmvault/') ? 'hub'
      : null;

    if (targetProject && targetProject !== project) {
      track('project_navigation', {
        from_project: project,
        to_project: targetProject,
        link_text: (link.textContent || '').trim().slice(0, 100),
        link_url: targetUrl.href
      });
    } else if (targetUrl.origin !== location.origin) {
      track('external_link_click', {
        link_domain: targetUrl.hostname,
        link_url: targetUrl.href,
        link_text: (link.textContent || '').trim().slice(0, 100)
      });
    }
  }, { passive: true });

  window.addEventListener('online', () => track('connection_change', { connection_mode: 'online' }));
  window.addEventListener('offline', () => track('connection_change', { connection_mode: 'offline' }));

  window.addEventListener('appinstalled', () => track('pwa_installed'));
  window.addEventListener('beforeinstallprompt', () => track('pwa_install_prompt_available'));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      track('page_hidden', { engagement_time_msec: Math.round(performance.now()) });
    }
  });
})();
