// content-epd-mac.js
// EPD customers: при наведении на MAC — год/месяц регистрации OUI + вендор (maclookup.app)

(function () {
  'use strict';

  const MAC_EXACT_RE = /^(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
  const HOST_SELECTOR = 'a, span, div, strong, b, td, th, p, li, label, button';
  const ATTR_MARK = 'data-tsl-mac-tip';
  const ATTR_ORIG = 'data-tsl-mac-orig-title';
  const ATTR_MAC = 'data-tsl-mac-value';
  const DEBOUNCE_MS = 400;

  let settings = { epdMacYear: true };
  let observer = null;
  let debounceTimer = null;
  let lastUrl = location.href;

  /** @type {Map<string, Promise<object>>} */
  const inflight = new Map();
  /** @type {Map<string, object>} */
  const memCache = new Map();

  function normalizeMac(mac) {
    return String(mac || '').trim().toUpperCase();
  }

  function ouiFromMac(mac) {
    const hex = normalizeMac(mac).replace(/[^0-9A-F]/g, '');
    return hex.slice(0, 6);
  }

  function formatYearMonth(updated) {
    // updated: YYYY-MM-DD
    if (!updated || typeof updated !== 'string') return null;
    const m = updated.match(/^(\d{4})-(\d{2})/);
    if (!m) return null;
    return m[1] + '-' + m[2];
  }

  function buildTitle(mac, info) {
    const macNorm = normalizeMac(mac);
    if (!info) {
      return macNorm + '\nДанные OUI недоступны';
    }
    if (info.found === false) {
      return macNorm + '\nOUI не найден в IEEE';
    }
    const ym = formatYearMonth(info.updated);
    const company = (info.company || '').trim();
    const parts = [];
    if (company) parts.push(company);
    if (ym) parts.push(ym);
    if (!parts.length) {
      return macNorm + '\nOUI: нет данных';
    }
    return macNorm + '\n' + parts.join(' · ');
  }

  function lookupOui(mac) {
    const oui = ouiFromMac(mac);
    if (oui.length < 6) {
      return Promise.resolve({ found: false });
    }
    if (memCache.has(oui)) {
      return Promise.resolve(memCache.get(oui));
    }
    if (inflight.has(oui)) {
      return inflight.get(oui);
    }

    const p = new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'lookupMacOui', mac: normalizeMac(mac), oui },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ found: false, error: chrome.runtime.lastError.message });
            return;
          }
          const data = response && response.success
            ? response.data
            : { found: false, error: response?.error };
          if (data && !data.error) {
            memCache.set(oui, data);
          }
          resolve(data || { found: false });
        }
      );
    }).finally(() => {
      inflight.delete(oui);
    });

    inflight.set(oui, p);
    return p;
  }

  function isMacOnlyElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest('script, style, noscript, svg')) return false;

    // Только текстовые дети (или пустые) — leaf / near-leaf
    for (let i = 0; i < el.children.length; i++) {
      return false;
    }

    const text = (el.textContent || '').trim();
    return MAC_EXACT_RE.test(text);
  }

  function collectMacHosts(root) {
    const hosts = [];
    const seen = new Set();
    const scope = root && root.querySelectorAll ? root : document;

    const nodes = scope.querySelectorAll
      ? scope.querySelectorAll(HOST_SELECTOR)
      : [];

    nodes.forEach((el) => {
      if (!isMacOnlyElement(el)) return;
      const mac = normalizeMac(el.textContent);
      if (seen.has(el)) return;
      // Берём самый глубокий leaf — родитель с тем же текстом пропустим,
      // если у него есть element-children (уже отфильтровано).
      seen.add(el);
      hosts.push({ el, mac });
    });

    // Если root сам element с MAC
    if (root && root.nodeType === 1 && isMacOnlyElement(root)) {
      hosts.push({ el: root, mac: normalizeMac(root.textContent) });
    }

    return hosts;
  }

  function applyTip(el, mac, info) {
    if (!el.isConnected) return;

    if (!el.hasAttribute(ATTR_ORIG)) {
      const prev = el.getAttribute('title');
      el.setAttribute(ATTR_ORIG, prev == null ? '' : prev);
    }

    el.setAttribute(ATTR_MARK, ouiFromMac(mac));
    el.setAttribute(ATTR_MAC, normalizeMac(mac));
    el.setAttribute('title', buildTitle(mac, info));
  }

  function enhanceHost(el, mac) {
    if (!settings.epdMacYear) return;
    if (!el || !el.isConnected) return;

    const oui = ouiFromMac(mac);
    const already = el.getAttribute(ATTR_MARK);
    // Уже размечен этим OUI и title не сброшен Vue
    if (already === oui && el.getAttribute(ATTR_MAC) === normalizeMac(mac)) {
      const t = el.getAttribute('title') || '';
      if (t.includes('·') || t.includes('OUI') || t.includes('не найден') || t.includes('недоступ')) {
        return;
      }
    }

    // Пока грузим — MAC + подсказка (не оставляем голый дубль MAC)
    if (!el.hasAttribute(ATTR_ORIG)) {
      const prev = el.getAttribute('title');
      el.setAttribute(ATTR_ORIG, prev == null ? '' : prev);
    }
    el.setAttribute(ATTR_MARK, oui);
    el.setAttribute(ATTR_MAC, normalizeMac(mac));
    if (!(el.getAttribute('title') || '').includes('·')) {
      el.setAttribute('title', normalizeMac(mac) + '\nЗагрузка данных OUI…');
    }

    lookupOui(mac).then((info) => {
      if (!settings.epdMacYear) return;
      applyTip(el, mac, info);
    });
  }

  function scan(root) {
    if (!settings.epdMacYear) return;
    const hosts = collectMacHosts(root || document);
    hosts.forEach(({ el, mac }) => enhanceHost(el, mac));
  }

  function scheduleScan(root) {
    if (!settings.epdMacYear) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => scan(root || document), DEBOUNCE_MS);
  }

  function restoreAll() {
    document.querySelectorAll('[' + ATTR_MARK + ']').forEach((el) => {
      if (el.hasAttribute(ATTR_ORIG)) {
        const orig = el.getAttribute(ATTR_ORIG);
        if (orig === '') {
          el.removeAttribute('title');
        } else {
          el.setAttribute('title', orig);
        }
        el.removeAttribute(ATTR_ORIG);
      }
      el.removeAttribute(ATTR_MARK);
      el.removeAttribute(ATTR_MAC);
    });
  }

  function observeDOM() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      if (!settings.epdMacYear) return;

      let need = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          need = true;
          break;
        }
        if (mutation.type === 'characterData') {
          need = true;
          break;
        }
        if (mutation.type === 'attributes' && mutation.attributeName === 'title') {
          const t = mutation.target;
          if (t && t.getAttribute && t.getAttribute(ATTR_MARK) &&
              !(t.getAttribute('title') || '').includes('·')) {
            // Vue/EPD сбросил title на голый MAC — восстановим
            need = true;
            break;
          }
        }
      }
      if (need) scheduleScan();
    });

    const target = document.body || document.documentElement;
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title']
    });
  }

  function watchSpaNavigation() {
    const checkUrl = () => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      scheduleScan();
    };

    const wrap = (type) => {
      const orig = history[type];
      if (typeof orig !== 'function') return;
      history[type] = function () {
        const ret = orig.apply(this, arguments);
        checkUrl();
        return ret;
      };
    };
    wrap('pushState');
    wrap('replaceState');
    window.addEventListener('popstate', checkUrl);

    setInterval(checkUrl, 1500);
  }

  function start() {
    scan();
    observeDOM();
    // Повторные проходы — lazy-блоки EPD
    let n = 0;
    const max = 12;
    const id = setInterval(() => {
      if (!settings.epdMacYear) {
        clearInterval(id);
        return;
      }
      scan();
      n += 1;
      if (n >= max) clearInterval(id);
    }, 1500);
  }

  function stop() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    clearTimeout(debounceTimer);
    restoreAll();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const next = changes.settings.newValue || {};
    const was = settings.epdMacYear !== false;
    const now = next.epdMacYear !== false;
    settings = { ...settings, ...next, epdMacYear: now };

    if (was && !now) {
      stop();
    } else if (!was && now) {
      start();
    }
  });

  function init() {
    chrome.storage.local.get(['settings'], (result) => {
      if (chrome.runtime.lastError) {
        console.warn('[2TSL] EPD MAC storage:', chrome.runtime.lastError.message);
        return;
      }
      const s = result.settings || {};
      settings.epdMacYear = s.epdMacYear !== false;

      watchSpaNavigation();

      if (settings.epdMacYear) {
        console.log('[2TSL] EPD MAC OUI tooltips: on');
        start();
      } else {
        console.log('[2TSL] EPD MAC OUI tooltips: off');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
