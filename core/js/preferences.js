(() => {
  "use strict";
  const PREFIX = "dmvault:pref:";
  function get(key, fallback = null) {
    try { const value = localStorage.getItem(PREFIX + key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; }
  }
  function set(key, value) { try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; } }
  function remove(key) { try { localStorage.removeItem(PREFIX + key); } catch {} }
  function clear() { try { Object.keys(localStorage).filter(key => key.startsWith(PREFIX)).forEach(key => localStorage.removeItem(key)); } catch {} }
  window.DMVaultPreferences = Object.freeze({ get, set, remove, clear });
})();
