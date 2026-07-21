(() => {
  'use strict';

  const cfg = Object.assign({
    endpoint: '',
    enabled: true,
    minMessageLength: 5,
    maxMessageLength: 2000,
    maxQueueSize: 100
  }, window.DMVAULT_FEEDBACK_CONFIG || {});
  if (!cfg.enabled) return;

  const QUEUE_KEY = 'dmvault.feedback.queue.v2';
  const LEGACY_QUEUE_KEY = 'dmvault.feedback.queue.v1';
  const MAX_ATTEMPTS = 12;
  let flushing = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  const projectFromPath = () => {
    const path = location.pathname.toLowerCase();
    if (path.includes('/mh-20th/')) return 'Monster Hunter 20th';
    if (path.includes('/pendulum-color/')) return 'Pendulum COLOR';
    if (path.includes('/godzilla-70th/')) return 'Godzilla 70th';
    return 'DMVault Platform';
  };

  const cleanText = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  const branchVersionFromPage = () => {
    const path = location.pathname.toLowerCase();
    if (path.includes('/pendulum-color/')) {
      const code = (new URLSearchParams(location.search).get('version') || 'v0').toLowerCase();
      const labels = {
        v0: 'V0 病毒剋星', v1: 'V1 自然靈魂', v2: 'V2 深海救星',
        v3: 'V3 噩夢軍團', v4: 'V4 風之守衛', v5: 'V5 鋼之帝國'
      };
      return labels[code] || code.toUpperCase();
    }
    return '';
  };

  const versionFromPage = () => {
    const path = location.pathname.toLowerCase();
    const candidates = [
      window.DMVAULT_FEEDBACK_CONTEXT?.version,
      document.documentElement.dataset.contentVersion,
      document.querySelector('[data-content-version]')?.dataset.contentVersion,
      document.querySelector('#footer-version')?.textContent,
      document.querySelector('#platform-version')?.textContent,
      document.querySelector('.dm-badge')?.textContent,
      window.DMVAULT_CONFIG?.version
    ].map(cleanText).filter(Boolean);
    if (candidates.length) return candidates[0];
    if (path.includes('/mh-20th/')) return 'DMVault MH20th V7.4.1';
    if (path.includes('/godzilla-70th/')) return 'DMVault Godzilla 70th V3.0 RC9.8';
    if (path.includes('/pendulum-color/')) return branchVersionFromPage();
    const titleVersion = document.title.match(/(?:v|V)\d+(?:\.\d+)*(?:[-\w.]*)?/g)?.pop();
    return titleVersion || 'unknown';
  };

  const valueByLabel = (root, labels) => {
    if (!root) return '';
    const wanted = labels.map(label => cleanText(label));
    for (const label of root.querySelectorAll('.stat-label, .info td:first-child, dt, th')) {
      if (!wanted.includes(cleanText(label.textContent))) continue;
      const value = label.nextElementSibling;
      if (value) return cleanText(value.textContent);
    }
    return '';
  };

  const closestVisible = selectors => {
    const center = innerHeight / 2;
    let best = null;
    let bestScore = Infinity;
    for (const element of document.querySelectorAll(selectors)) {
      const rect = element.getBoundingClientRect();
      if (rect.height <= 0 || rect.width <= 0 || rect.bottom < 0 || rect.top > innerHeight) continue;
      const score = Math.abs((Math.max(0, rect.top) + Math.min(innerHeight, rect.bottom)) / 2 - center);
      if (score < bestScore) { best = element; bestScore = score; }
    }
    return best;
  };

  const elementFromHash = () => {
    const hash = decodeURIComponent(location.hash || '');
    const match = hash.match(/(?:digimon|monster)=([^&]+)/i);
    if (match) {
      const id = CSS.escape(match[1]);
      return document.querySelector(`#evo-${id}, #monster-${id}, [data-id="${id}"], [data-monster="${id}"]`);
    }
    if (/^#(?:evo-|monster-)/.test(hash)) return document.querySelector(hash);
    return null;
  };

  const contextFromPage = () => {
    const explicit = window.DMVAULT_FEEDBACK_CONTEXT || {};
    let element = elementFromHash();
    if (!element) element = document.querySelector('.dex-map-node.selected, .dex-map-node.hovered');
    if (!element) element = closestVisible('.evolution-sheet, article.current, .monster-card, .dex-card, [id^="monster-"]');

    const titleNode = element?.querySelector('.source-title-zh span:first-child, .source-title-zh, .name h3, h3, strong');
    let item = cleanText(explicit.item || titleNode?.textContent || element?.getAttribute('title') || '');
    item = item.replace(/^#\d+\s*/, '').replace(/｜.*$/, '').trim();

    let dex = cleanText(explicit.dex || valueByLabel(element, ['圖鑑編號', '編號']));
    if (!dex && element?.id) dex = (element.id.match(/(?:monster|evo)-(\d+)$/)?.[1] || '');
    if (!dex && element?.getAttribute('title')) dex = element.getAttribute('title').match(/#(\d+)/)?.[1] || '';

    const stage = cleanText(explicit.stage || element?.querySelector('.stage-pill, .stage-tag, .badge')?.textContent || '');
    const branchVersion = cleanText(explicit.branchVersion || branchVersionFromPage());
    const view = cleanText(explicit.view || document.querySelector('.dm-nav .active, nav .active, [aria-current="page"]')?.textContent || '');
    const summary = [branchVersion, view, item && `項目：${item}`, dex && `編號：${dex}`, stage && `階段：${stage}`].filter(Boolean).join('｜');
    return { branchVersion, item, dex, stage, view, summary };
  };

  const isPWA = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const pageName = () => document.querySelector('h1')?.textContent?.trim() || document.title;

  const diagnostics = () => {
    const context = contextFromPage();
    return {
      project: projectFromPath(),
      page: pageName(),
      version: versionFromPage(),
      branchVersion: context.branchVersion,
      item: context.item,
      dex: context.dex,
      stage: context.stage,
      view: context.view,
      contextSummary: context.summary,
      url: location.href,
      online: navigator.onLine,
      pwa: isPWA(),
      viewport: `${innerWidth}×${innerHeight}`,
      platform: navigator.userAgentData?.platform || navigator.platform || '',
      userAgent: navigator.userAgent,
      language: navigator.language,
      time: new Date().toISOString()
    };
  };

  const randomCode = () => {
    const bytes = new Uint8Array(4);
    if (crypto.getRandomValues) crypto.getRandomValues(bytes);
    else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
    return Array.from(bytes, byte => byte.toString(36).padStart(2, '0')).join('').slice(0, 6).toUpperCase();
  };

  const createFeedbackId = () => {
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('');
    return `FB-${date}-${randomCode()}`;
  };

  const readQueue = () => {
    try {
      const current = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      if (Array.isArray(current)) return current;
    } catch (_) {}
    return [];
  };

  const writeQueue = queue => {
    const limit = Math.max(10, Number(cfg.maxQueueSize) || 100);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-limit)));
    document.dispatchEvent(new CustomEvent('dmvault:feedback-queue-change', { detail: { count: queue.length } }));
  };

  const migrateLegacyQueue = () => {
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_QUEUE_KEY) || '[]');
      if (Array.isArray(legacy) && legacy.length) {
        const current = readQueue();
        const known = new Set(current.map(item => item.payload?.id || item.id));
        for (const payload of legacy) {
          if (!payload?.id || known.has(payload.id)) continue;
          current.push({ payload, attempts: 0, queuedAt: new Date().toISOString(), lastError: '' });
        }
        writeQueue(current);
      }
      localStorage.removeItem(LEGACY_QUEUE_KEY);
    } catch (_) {}
  };

  const enqueue = (payload, errorMessage = '') => {
    const queue = readQueue();
    if (queue.some(item => (item.payload?.id || item.id) === payload.id)) return;
    queue.push({ payload, attempts: 0, queuedAt: new Date().toISOString(), lastError: errorMessage });
    writeQueue(queue);
  };

  async function transmit(payload) {
    if (!cfg.endpoint) throw new Error('尚未連接回報接收端');
    await fetch(cfg.endpoint, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-store',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return true;
  }

  async function flushQueue() {
    if (flushing || !navigator.onLine || !cfg.endpoint) return;
    const queue = readQueue();
    if (!queue.length) return;

    flushing = true;
    const remaining = [];
    for (const entry of queue) {
      const payload = entry.payload || entry;
      try {
        await transmit(payload);
      } catch (error) {
        const attempts = Number(entry.attempts || 0) + 1;
        remaining.push({
          payload,
          attempts: Math.min(attempts, MAX_ATTEMPTS),
          queuedAt: entry.queuedAt || new Date().toISOString(),
          lastAttemptAt: new Date().toISOString(),
          lastError: String(error?.message || error || '傳送失敗')
        });
      }
    }
    writeQueue(remaining);
    flushing = false;
  }

  function build() {
    document.body.classList.add('dmv-feedback-enabled');
    migrateLegacyQueue();

    const btn = document.createElement('button');
    btn.className = 'dmv-feedback-button';
    btn.type = 'button';
    btn.innerHTML = '<span>💬 回報／建議</span><span class="dmv-feedback-queue-badge" hidden></span>';
    btn.setAttribute('aria-haspopup', 'dialog');

    const wrap = document.createElement('div');
    wrap.className = 'dmv-feedback-backdrop';
    wrap.hidden = true;
    wrap.innerHTML = `
      <section class="dmv-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="dmv-feedback-title">
        <div class="dmv-feedback-head">
          <div><h2 id="dmv-feedback-title">回報問題或提供建議</h2><p>目前頁面與裝置資料會自動附上。</p></div>
          <button class="dmv-feedback-close" type="button" aria-label="關閉">×</button>
        </div>
        <form class="dmv-feedback-form">
          <label class="dmv-feedback-field"><span>回報類型</span>
            <select name="type" required>
              <option value="資料錯誤">資料錯誤</option>
              <option value="畫面／功能異常">畫面／功能異常</option>
              <option value="使用建議">使用建議</option>
              <option value="留言鼓勵">留言鼓勵</option>
              <option value="其他">其他</option>
            </select>
          </label>
          <label class="dmv-feedback-field"><span>內容</span>
            <textarea name="message" minlength="${Number(cfg.minMessageLength) || 5}" maxlength="${Number(cfg.maxMessageLength) || 2000}" required placeholder="請說明哪裡有錯、發生什麼狀況，或你希望增加什麼功能。"></textarea>
            <small class="dmv-feedback-hint">請不要填寫密碼、住址等敏感資料。</small>
          </label>
          <label class="dmv-feedback-field"><span>聯絡方式（選填）</span><input name="contact" maxlength="150" placeholder="暱稱、Email 或社群帳號"></label>
          <label class="dmv-feedback-honeypot" aria-hidden="true">網站<input name="website" tabindex="-1" autocomplete="off"></label>
          <div class="dmv-feedback-meta"></div>
          <p class="dmv-feedback-pending" hidden></p>
          <div class="dmv-feedback-actions">
            <button class="dmv-feedback-secondary dmv-feedback-copy" type="button">複製診斷資料</button>
            <button class="dmv-feedback-secondary dmv-feedback-retry" type="button" hidden>重送待送回報</button>
            <button class="dmv-feedback-submit" type="submit">送出回報</button>
          </div>
          <p class="dmv-feedback-status" role="status" aria-live="polite"></p>
        </form>
      </section>`;

    document.body.append(btn, wrap);

    const form = wrap.querySelector('form');
    const close = wrap.querySelector('.dmv-feedback-close');
    const status = wrap.querySelector('.dmv-feedback-status');
    const meta = wrap.querySelector('.dmv-feedback-meta');
    const submit = wrap.querySelector('.dmv-feedback-submit');
    const badge = btn.querySelector('.dmv-feedback-queue-badge');
    const pending = wrap.querySelector('.dmv-feedback-pending');
    const retry = wrap.querySelector('.dmv-feedback-retry');

    const updateQueueUI = () => {
      const count = readQueue().length;
      badge.hidden = count === 0;
      badge.textContent = count > 99 ? '99+' : String(count);
      pending.hidden = count === 0;
      pending.textContent = count ? `尚有 ${count} 筆回報暫存在此裝置，恢復連線後會自動重送。` : '';
      retry.hidden = count === 0 || !navigator.onLine || !cfg.endpoint;
    };

    const show = () => {
      const d = diagnostics();
      meta.innerHTML = `作品：${esc(d.project)}<br>頁面：${esc(d.page)}<br>版本：${esc(d.version)}${d.branchVersion && d.branchVersion !== d.version ? `<br>分支：${esc(d.branchVersion)}` : ''}${d.item ? `<br>目前項目：${esc(d.item)}${d.dex ? `（#${esc(d.dex)}）` : ''}${d.stage ? `・${esc(d.stage)}` : ''}` : ''}<br>模式：${d.pwa ? 'PWA' : '瀏覽器'}・${d.online ? '線上' : '離線'}`;
      status.textContent = cfg.endpoint ? '' : '管理員尚未完成回報功能連線設定。';
      status.className = `dmv-feedback-status${cfg.endpoint ? '' : ' is-error'}`;
      updateQueueUI();
      wrap.hidden = false;
      document.body.style.overflow = 'hidden';
      setTimeout(() => form.elements.message.focus(), 0);
    };

    const hide = () => {
      wrap.hidden = true;
      document.body.style.overflow = '';
    };

    btn.addEventListener('click', show);
    close.addEventListener('click', hide);
    wrap.addEventListener('click', event => { if (event.target === wrap) hide(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !wrap.hidden) hide(); });
    document.addEventListener('dmvault:feedback-queue-change', updateQueueUI);

    wrap.querySelector('.dmv-feedback-copy').addEventListener('click', async () => {
      const text = JSON.stringify(diagnostics(), null, 2);
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = '診斷資料已複製。';
        status.className = 'dmv-feedback-status is-ok';
      } catch (_) {
        status.textContent = '無法自動複製，請改用瀏覽器的分享或複製功能。';
        status.className = 'dmv-feedback-status is-error';
      }
    });

    retry.addEventListener('click', async () => {
      retry.disabled = true;
      status.textContent = '正在重送待送回報…';
      status.className = 'dmv-feedback-status';
      await flushQueue();
      const count = readQueue().length;
      status.textContent = count ? `仍有 ${count} 筆尚未送出，稍後會再重試。` : '待送回報已全部送出。';
      status.className = `dmv-feedback-status ${count ? 'is-error' : 'is-ok'}`;
      retry.disabled = false;
      updateQueueUI();
    });

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const fd = new FormData(form);
      if (String(fd.get('website') || '').trim()) return;

      const message = String(fd.get('message') || '').trim();
      const minLength = Number(cfg.minMessageLength) || 5;
      if (message.length < minLength) {
        status.textContent = `內容請至少輸入 ${minLength} 個字。`;
        status.className = 'dmv-feedback-status is-error';
        return;
      }

      const payload = {
        schema: 2,
        id: createFeedbackId(),
        type: String(fd.get('type') || ''),
        message,
        contact: String(fd.get('contact') || '').trim(),
        diagnostics: diagnostics(),
        createdAt: new Date().toISOString()
      };

      submit.disabled = true;
      status.textContent = '送出中…';
      status.className = 'dmv-feedback-status';

      try {
        if (!navigator.onLine) {
          enqueue(payload, '裝置離線');
          status.textContent = `目前離線，回報 ${payload.id} 已暫存；恢復連線後會自動送出。`;
          status.className = 'dmv-feedback-status is-ok';
          form.reset();
        } else {
          await transmit(payload);
          status.textContent = `已收到，謝謝你的回報！回報編號：${payload.id}`;
          status.className = 'dmv-feedback-status is-ok';
          form.reset();
          setTimeout(hide, 1800);
        }
      } catch (error) {
        if (cfg.endpoint) {
          enqueue(payload, String(error?.message || error || '傳送失敗'));
          status.textContent = `暫時無法送出，回報 ${payload.id} 已保存並會自動重試。`;
        } else {
          status.textContent = '回報接收端尚未設定，請管理員先完成 Google Apps Script 部署。';
        }
        status.className = 'dmv-feedback-status is-error';
      } finally {
        submit.disabled = false;
        updateQueueUI();
      }
    });

    updateQueueUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true });
  else build();

  addEventListener('online', () => { flushQueue(); });
  setTimeout(flushQueue, 1200);
  setInterval(flushQueue, 60000);
})();
