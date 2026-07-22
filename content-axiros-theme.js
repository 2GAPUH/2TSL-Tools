// content-axiros-theme.js
// Тёмная тема Axiros (СЗ / Юг / Волга). CSS-first, Bootstrap 3 overrides.

(function () {
  'use strict';

  const STYLE_ID = 'tsl-axiros-dark-style';
  const THEME_ATTR = 'data-tsl-axiros-theme';
  const PALETTE_ATTR = 'data-tsl-axiros-palette';
  const DEFAULT_PALETTE = 'slate';
  const VALID_PALETTES = new Set(['slate', 'black', 'navy']);

  let cssText = null;
  let cssLoadPromise = null;
  let enabled = false;
  let palette = DEFAULT_PALETTE;

  function trackEvent(event) {
    try {
      chrome.runtime.sendMessage({ action: 'trackEvent', event });
    } catch (e) { /* service worker недоступен */ }
  }

  function normalizePalette(value) {
    if (typeof value === 'string' && VALID_PALETTES.has(value)) return value;
    return DEFAULT_PALETTE;
  }

  /** Общая палитра: systemsDarkPalette, fallback argusDarkPalette (legacy). */
  function readPalette(settings) {
    const s = settings || {};
    return normalizePalette(s.systemsDarkPalette || s.argusDarkPalette);
  }

  function getRoot() {
    return document.documentElement;
  }

  function loadCss() {
    if (cssText) return Promise.resolve(cssText);
    if (cssLoadPromise) return cssLoadPromise;

    cssLoadPromise = fetch(chrome.runtime.getURL('axiros-dark.css'))
      .then((res) => {
        if (!res.ok) throw new Error('axiros-dark.css HTTP ' + res.status);
        return res.text();
      })
      .then((text) => {
        cssText = text;
        return cssText;
      })
      .catch((err) => {
        console.warn('[2TSL] Не удалось загрузить axiros-dark.css:', err);
        cssLoadPromise = null;
        return null;
      });

    return cssLoadPromise;
  }

  function ensureStyleElement(text) {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      el.setAttribute('data-tsl', 'axiros-dark');
      const root = getRoot();
      if (root.firstChild) {
        root.insertBefore(el, root.firstChild);
      } else {
        root.appendChild(el);
      }
    }
    if (el.textContent !== text) {
      el.textContent = text;
    }
    return el;
  }

  function removeStyleElement() {
    const el = document.getElementById(STYLE_ID);
    if (el) el.remove();
  }

  function applyDomMarkers(on, paletteName) {
    const root = getRoot();
    if (on) {
      root.setAttribute(THEME_ATTR, 'on');
      root.setAttribute(PALETTE_ATTR, paletteName);
    } else {
      root.removeAttribute(THEME_ATTR);
      root.removeAttribute(PALETTE_ATTR);
    }
  }

  async function applyTheme(nextEnabled, nextPalette) {
    enabled = !!nextEnabled;
    palette = normalizePalette(nextPalette);

    if (!enabled) {
      applyDomMarkers(false, palette);
      removeStyleElement();
      return;
    }

    applyDomMarkers(true, palette);

    const text = await loadCss();
    if (!text) return;

    if (!enabled) {
      applyDomMarkers(false, palette);
      removeStyleElement();
      return;
    }

    ensureStyleElement(text);
    applyDomMarkers(true, palette);
  }

  function readFromSettings(settings) {
    const s = settings || {};
    return {
      enabled: s.axirosDarkTheme === true,
      palette: readPalette(s)
    };
  }

  function initFromStorage() {
    chrome.storage.local.get(['settings'], (result) => {
      if (chrome.runtime.lastError) {
        console.warn('[2TSL] Axiros theme storage:', chrome.runtime.lastError.message);
        return;
      }
      const { enabled: on, palette: pal } = readFromSettings(result.settings);
      applyTheme(on, pal);
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const { enabled: on, palette: pal } = readFromSettings(changes.settings.newValue);
    const wasEnabled = enabled;
    const prevPalette = palette;
    applyTheme(on, pal).then(() => {
      if (on && !wasEnabled) trackEvent('axiros_dark_theme_on');
      if (!on && wasEnabled) trackEvent('axiros_dark_theme_off');
      if (on && wasEnabled && pal !== prevPalette) trackEvent('axiros_dark_palette_change');
    });
  });

  // document_start: применяем как можно раньше
  initFromStorage();
})();
