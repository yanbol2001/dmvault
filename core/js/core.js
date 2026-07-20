(() => {
  "use strict";
  const config = window.DMVaultConfig || {};
  const events = new EventTarget();
  const state = new Map();
  let toastTimer = null;

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[char]);
  const formatDateTime = value => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-TW", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hour12:false }).format(date);
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const debugEnabled = () => Boolean(config.debug || new URLSearchParams(location.search).get("debug") === "1");
  const log = (...args) => { if (debugEnabled()) console.debug("[DMVault]", ...args); };
  const reportError = (error, context = "unknown") => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    console.error(`[DMVault:${context}]`, normalized);
    events.dispatchEvent(new CustomEvent("error", { detail:{ error:normalized, context } }));
    return normalized;
  };
  const showToast = (message, options = {}) => {
    const node = $("#app-toast");
    if (!node) return;
    node.textContent = String(message);
    node.dataset.tone = options.tone || "info";
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, Number(options.duration) || 3200);
  };
  const setBusy = (element, busy, busyLabel = "處理中…") => {
    if (!element) return;
    if (busy) {
      element.dataset.originalLabel = element.textContent;
      element.textContent = busyLabel;
      element.disabled = true;
      element.setAttribute("aria-busy", "true");
    } else {
      element.textContent = element.dataset.originalLabel || element.textContent;
      element.disabled = false;
      element.removeAttribute("aria-busy");
    }
  };
  const emit = (name, detail = {}) => events.dispatchEvent(new CustomEvent(name, { detail }));
  const on = (name, handler, options) => { events.addEventListener(name, handler, options); return () => events.removeEventListener(name, handler, options); };
  const ready = callback => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", callback, { once:true }) : callback();

  window.DMVault = Object.freeze({ $, $$, escapeHtml, formatDateTime, sleep, log, reportError, showToast, setBusy, emit, on, ready, state, config, debugEnabled });
  ready(() => emit("core:ready", { version:config.platformVersion || "0.0.0" }));
})();
