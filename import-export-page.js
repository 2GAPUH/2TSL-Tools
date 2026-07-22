// import-export-page.js — standalone-страница импорта/экспорта

let pageTemplates = [];
let pageGroups = [];
let pageSettings = {};

const DEFAULT_SETTINGS = {
  omnichatTemplates: true,
  ttmButton: true,
  accountingPanel: true,
  grafanaSSH: true,
  reminder: true,
  ttmOnyma: true,
  ttmSipal: true,
  omnichatTTMLinks: true,
  darkMode: false,
  argusDarkTheme: false,
  axirosDarkTheme: false,
  systemsDarkPalette: 'slate',
  analyticsEnabled: true,
  popupLayoutScale: null,
  popupTabSizes: null,
  popupUnifiedTabSize: false
};

function trackPageEvent(event) {
  try {
    chrome.runtime.sendMessage({ action: 'trackEvent', event });
  } catch (e) { /* service worker недоступен */ }
}

function escapePageHtml(unsafe) {
  return String(unsafe ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generatePageId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function applyDarkModeFromSettings() {
  if (pageSettings.darkMode) {
    document.documentElement.classList.add('dark-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
  }
}

function showPageStatus(message, type = 'success') {
  const el = document.getElementById('ieStatus');
  if (!el) return;
  el.textContent = message;
  el.className = `ie-status ${type}`;
  el.style.display = 'block';
}

function hidePageStatus() {
  const el = document.getElementById('ieStatus');
  if (el) {
    el.style.display = 'none';
    el.textContent = '';
  }
}

function applySettingsPatch(patch) {
  if (!patch || typeof patch !== 'object') return;
  Object.keys(patch).forEach((key) => {
    if (patch[key] !== undefined) pageSettings[key] = patch[key];
  });
  chrome.storage.local.set({ settings: pageSettings });
  applyDarkModeFromSettings();
}

function buildPageApi() {
  return {
    getTemplates: () => pageTemplates,
    getGroups: () => pageGroups,
    getSettings: () => pageSettings,
    setTemplates: (next) => { pageTemplates = next; },
    setGroups: (next) => { pageGroups = next; },
    saveTemplates: () => chrome.storage.local.set({ templates: pageTemplates }),
    saveGroups: () => chrome.storage.local.set({ groups: pageGroups }),
    applySettingsPatch,
    refreshUiAfterImport: () => {},
    showStatus: showPageStatus,
    generateId: generatePageId,
    escapeHtml: escapePageHtml,
    trackEvent: trackPageEvent
  };
}

function switchPageTab(tabName) {
  document.querySelectorAll('.ie-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  document.querySelectorAll('.ie-panel').forEach((p) => {
    p.classList.toggle('active', p.id === `${tabName}Panel`);
  });
  hidePageStatus();
}

function loadPageData(callback) {
  chrome.storage.local.get(['templates', 'groups', 'settings'], (result) => {
    pageTemplates = result.templates || [];
    pageGroups = result.groups || [];
    pageSettings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
    applyDarkModeFromSettings();
    if (callback) callback();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadPageData(() => {
    initImportExportPage(buildPageApi());

    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') === 'import' ? 'import' : 'export';
    switchPageTab(tab);

    document.querySelectorAll('.ie-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchPageTab(btn.dataset.tab);
        if (typeof ieRefreshCloudGates === 'function') ieRefreshCloudGates();
      });
    });
  });
});