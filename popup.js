// ==================== АНАЛИТИКА ====================
function trackEvent(event) {
  try {
    chrome.runtime.sendMessage({ action: 'trackEvent', event });
  } catch (e) { /* service worker недоступен */ }
}

const POPUP_TAB_EVENTS = {
  templates: 'popup_tab_templates',
  tickets: 'popup_tab_tickets',
  reminders: 'popup_tab_reminders',
  settings: 'popup_tab_settings'
};

const POPUP_TABS = ['templates', 'tickets', 'reminders', 'settings'];

const BASE_LAYOUT = {
  width: 450,
  height: 450,
  fontSize: 14,
  padding: 16
};

const RESIZE_SNAP = 8;
const MAX_HEIGHT_BUFFER = 45;
const MAX_WIDTH_BUFFER = 45;

const DEFAULT_TAB_SIZE = { width: BASE_LAYOUT.width, height: BASE_LAYOUT.height };
const TAB_SIZE_MIN = { width: 240, height: 300 };
const TAB_SIZE_MAX = { width: 800, height: 600 };

let cachedMinPopupWidth = 0;
let cachedMaxPopupWidth = 0;
let cachedMaxPopupHeight = 0;
let lastAppliedTabSize = { width: 0, height: 0 };

const DEFAULT_POPUP_LAYOUT_SCALE = {
  fontSize: 100,
  padding: 100
};

const LAYOUT_SCALE_STEP = 10;
const LAYOUT_SCALE_MIN = 50;
const LAYOUT_SCALE_MAX = 200;

const LAYOUT_SCALE_CONTROLS = [
  { key: 'fontSize', valId: 'valScaleFontSize' },
  { key: 'padding', valId: 'valScalePadding' }
];

const POPUP_PRESETS = {
  compact: { fontSize: 93, padding: 75 },
  normal:  { ...DEFAULT_POPUP_LAYOUT_SCALE },
  large:   { fontSize: 107, padding: 113 }
};

// ==================== ИКОНКИ ====================
function getIconUrl(iconName) {
  const isDark = settings.darkMode;
  const suffix = isDark ? '_white' : '';
  return chrome.runtime.getURL(`icons/${iconName}${suffix}.png`);
}

function updateIcons() {
  const icons = document.querySelectorAll('[data-icon]');
  
  icons.forEach(icon => {
    const iconName = icon.dataset.icon;
    icon.src = getIconUrl(iconName);
  });
}

// ==================== ХЕЛПЕРЫ ====================
const pad2 = (n) => String(n).padStart(2, "0");
const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const getTimeStr = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

// ==================== ХРАНИЛИЩЕ ====================
let templates = [];
let groups = [];
let settings = {
  omnichatTemplates: true,
  ttmButton: true,
  accountingPanel: true,
  grafanaSSH: true,
  reminder: true,
  ttmOnyma: true,
  ttmSipal: true,
  ttmCommentBuilder: true,
  omnichatTTMLinks: true,
  openTabAdjacent: false,
  darkMode: false,
  analyticsEnabled: true,
  popupLayoutScale: null,
  popupTabSizes: null,
  popupUnifiedTabSize: false,
  templateReorderMode: 'buttons'
};
let savedFormData = {
  region: '',
  fio: ''
};
let currentFilter = "";
let lastActiveTab = "templates";
let activeWorkingDate = getTodayStr();

// ==================== ЭЛЕМЕНТЫ DOM ====================
const templatesList = document.getElementById('templatesList');
const addTemplateBtn = document.getElementById('addTemplateBtn');
const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const templateForm = document.getElementById('templateForm');
const templateId = document.getElementById('templateId');
const templateName = document.getElementById('templateName');
const templateGroup = document.getElementById('templateGroup');
const templateText = document.getElementById('templateText');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelBtn = document.getElementById('cancelBtn');
const groupFilter = document.getElementById('groupFilter');
const groupsModalOverlay = document.getElementById('groupsModalOverlay');
const closeGroupsModalBtn = document.getElementById('closeGroupsModalBtn');
const closeGroupsModalBtn2 = document.getElementById('closeGroupsModalBtn2');
const groupsList = document.getElementById('groupsList');
const newGroupName = document.getElementById('newGroupName');
const addGroupBtn = document.getElementById('addGroupBtn');

// Настройки
const settingOmnichatTemplates = document.getElementById('settingOmnichatTemplates');
const settingOmnichatTTMLinks = document.getElementById('settingOmnichatTTMLinks');
const settingOpenTabAdjacent = document.getElementById('settingOpenTabAdjacent');
const settingTTMButton = document.getElementById('settingTTMButton');
const settingAccountingPanel = document.getElementById('settingAccountingPanel');
const settingGrafanaSSH = document.getElementById('settingGrafanaSSH');
const settingReminder = document.getElementById('settingReminder');
const settingTTMOnyma = document.getElementById('settingTTMOnyma');
const settingTTMSipal = document.getElementById('settingTTMSipal');
const settingTTMCommentBuilder = document.getElementById('settingTTMCommentBuilder');
const settingDarkMode = document.getElementById('settingDarkMode');
const settingPopupPreset = document.getElementById('settingPopupPreset');
const resetPopupLayoutBtn = document.getElementById('resetPopupLayout');
const toggleLayoutAdvancedBtn = document.getElementById('toggleLayoutAdvanced');
const layoutAdvancedEl = document.getElementById('layoutAdvanced');
const settingPopupUnifiedTabSize = document.getElementById('settingPopupUnifiedTabSize');
const settingTemplateReorderMode = document.getElementById('settingTemplateReorderMode');
const layoutSizeHintEl = document.getElementById('layoutSizeHint');
const popupResizeHandle = document.getElementById('popupResizeHandle');
const popupResizeGhost = document.getElementById('popupResizeGhost');
const settingAnalytics = document.getElementById('settingAnalytics');
const savedRegion = document.getElementById('savedRegion');
const savedFIO = document.getElementById('savedFIO');
const clearSavedDataBtn = document.getElementById('clearSavedData');

// Напоминалка
const remindersList = document.getElementById('remindersList');

// Учёт заявок
const ticketEls = {
  currentDate: document.getElementById("currentDate"),
  ticketNumber: document.getElementById("ticketNumber"),
  ticketComment: document.getElementById("ticketComment"),
  workHours: document.getElementById("workHours"),
  workMinutes: document.getElementById("workMinutes"),
  addClosed: document.getElementById("addClosed"),
  addField: document.getElementById("addField"),
  removeLast: document.getElementById("removeLast"),
  countClosed: document.getElementById("countClosed"),
  countField: document.getElementById("countField"),
  countTotal: document.getElementById("countTotal"),
  entries: document.getElementById("entries"),
  finishDay: document.getElementById("finishDay"),
  startNewDay: document.getElementById("startNewDay"),
  performance: document.getElementById("performance"),
  closurePercent: document.getElementById("closurePercent")
};

// ==================== ОФОРМЛЕНИЕ POPUP ====================
function clampScale(value) {
  return Math.min(LAYOUT_SCALE_MAX, Math.max(LAYOUT_SCALE_MIN, value));
}

function migratePopupLayout() {
  if (!settings.popupLayoutScale || typeof settings.popupLayoutScale !== 'object') {
    if (settings.popupLayout && typeof settings.popupLayout === 'object') {
      const legacy = settings.popupLayout;
      settings.popupLayoutScale = {
        fontSize: clampScale(Math.round((legacy.fontSize / BASE_LAYOUT.fontSize) * 100)),
        padding: clampScale(Math.round((legacy.padding / BASE_LAYOUT.padding) * 100))
      };
      migrateLegacyTabSizes(legacy.width, legacy.minHeight);
      delete settings.popupLayout;
    } else if (settings.popupSize && POPUP_PRESETS[settings.popupSize]) {
      settings.popupLayoutScale = { ...POPUP_PRESETS[settings.popupSize] };
      delete settings.popupSize;
    } else {
      settings.popupLayoutScale = { ...DEFAULT_POPUP_LAYOUT_SCALE };
    }
  }

  const scale = settings.popupLayoutScale;
  if (scale.width !== undefined || scale.minHeight !== undefined || scale.autoHeight !== undefined) {
    migrateLegacyTabSizes(
      scale.width !== undefined ? scaleToPx(BASE_LAYOUT.width, scale.width) : undefined,
      scale.minHeight !== undefined ? scaleToPx(BASE_LAYOUT.height, scale.minHeight) : undefined
    );
    delete scale.width;
    delete scale.minHeight;
    delete scale.autoHeight;
  }

  delete scale.templatesMaxHeight;
  delete scale.templatesMinHeight;
  delete scale.listMaxHeight;
  delete scale.remindersMaxHeight;
}

function migrateLegacyTabSizes(widthPx, heightPx) {
  ensurePopupTabSizes();
  const size = {
    width: widthPx || DEFAULT_TAB_SIZE.width,
    height: heightPx || DEFAULT_TAB_SIZE.height
  };
  POPUP_TABS.forEach((tab) => {
    if (!settings.popupTabSizes[tab]) {
      settings.popupTabSizes[tab] = { ...size };
    }
  });
}

function ensurePopupTabSizes() {
  if (!settings.popupTabSizes || typeof settings.popupTabSizes !== 'object') {
    settings.popupTabSizes = {};
  }
  POPUP_TABS.forEach((tab) => {
    if (!settings.popupTabSizes[tab]) {
      settings.popupTabSizes[tab] = { ...DEFAULT_TAB_SIZE };
    }
  });
}

function migrateCrushedTabSizes() {
  const crushedThreshold = TAB_SIZE_MIN.width + 16;
  let changed = false;
  ensurePopupTabSizes();
  POPUP_TABS.forEach((tab) => {
    const size = settings.popupTabSizes[tab];
    if (size.width <= crushedThreshold) {
      size.width = DEFAULT_TAB_SIZE.width;
      if (size.height < DEFAULT_TAB_SIZE.height) {
        size.height = DEFAULT_TAB_SIZE.height;
      }
      changed = true;
    }
  });
  if (changed) saveSettings();
}

function clampTabDimension(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function measureMinPopupWidth() {
  const bar = document.querySelector('.tabs');
  if (!bar) return TAB_SIZE_MIN.width;

  const tabs = [...bar.querySelectorAll('.tab')];
  const layout = getPopupLayout();
  const padding = layout.padding * 2;
  const prevWidth = bar.style.width;

  bar.classList.add('tabs--measure-nowrap');
  const nowrapWidth = bar.scrollWidth + padding + 4;
  bar.classList.remove('tabs--measure-nowrap');

  let low = TAB_SIZE_MIN.width;
  let high = Math.min(Math.max(nowrapWidth, TAB_SIZE_MIN.width), TAB_SIZE_MAX.width);
  let best = high;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    bar.style.width = `${mid - padding}px`;
    void bar.offsetHeight;
    const tabsFit = tabs.every((tab) => tab.scrollWidth <= tab.clientWidth + 1);
    if (tabsFit) {
      best = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  bar.style.width = prevWidth;
  return Math.max(TAB_SIZE_MIN.width, best);
}

function refreshMinPopupWidth() {
  cachedMinPopupWidth = measureMinPopupWidth();
  return cachedMinPopupWidth;
}

function getMinPopupWidth() {
  if (!cachedMinPopupWidth) return refreshMinPopupWidth();
  return cachedMinPopupWidth;
}

function setProbeWindowSize(width, height) {
  const root = document.documentElement;
  const w = `${width}px`;
  const h = `${height}px`;
  root.style.setProperty('--popup-width', w);
  root.style.setProperty('--popup-height', h);
  root.style.width = w;
  root.style.height = h;
  root.style.overflow = 'hidden';
}

function detectMaxPopupHeight() {
  const root = document.documentElement;
  const prevW = root.style.getPropertyValue('--popup-width');
  const prevH = root.style.getPropertyValue('--popup-height');
  const prevInlineW = root.style.width;
  const prevInlineH = root.style.height;
  const width = root.clientWidth || DEFAULT_TAB_SIZE.width;
  let maxH = TAB_SIZE_MIN.height;

  hideResizeGhost();

  for (let h = TAB_SIZE_MIN.height; h <= TAB_SIZE_MAX.height + 50; h += 8) {
    setProbeWindowSize(width, h);
    void root.offsetHeight;
    if (root.clientHeight >= h - 2) {
      maxH = h;
    } else {
      break;
    }
  }

  if (prevW) root.style.setProperty('--popup-width', prevW);
  else root.style.removeProperty('--popup-width');
  if (prevH) root.style.setProperty('--popup-height', prevH);
  else root.style.removeProperty('--popup-height');
  root.style.width = prevInlineW;
  root.style.height = prevInlineH;
  cachedMaxPopupHeight = Math.max(TAB_SIZE_MIN.height, maxH - MAX_HEIGHT_BUFFER);
  return cachedMaxPopupHeight;
}

function detectMaxPopupWidth() {
  const root = document.documentElement;
  const prevW = root.style.getPropertyValue('--popup-width');
  const prevH = root.style.getPropertyValue('--popup-height');
  const prevInlineW = root.style.width;
  const prevInlineH = root.style.height;
  const height = cachedMaxPopupHeight || root.clientHeight || DEFAULT_TAB_SIZE.height;
  let maxW = TAB_SIZE_MIN.width;

  hideResizeGhost();

  for (let w = TAB_SIZE_MIN.width; w <= TAB_SIZE_MAX.width + 50; w += 8) {
    setProbeWindowSize(w, height);
    void root.offsetHeight;
    if (root.clientWidth >= w - 2) {
      maxW = w;
    } else {
      break;
    }
  }

  if (prevW) root.style.setProperty('--popup-width', prevW);
  else root.style.removeProperty('--popup-width');
  if (prevH) root.style.setProperty('--popup-height', prevH);
  else root.style.removeProperty('--popup-height');
  root.style.width = prevInlineW;
  root.style.height = prevInlineH;

  const buffered = maxW - MAX_WIDTH_BUFFER;
  cachedMaxPopupWidth = clampTabDimension(
    buffered,
    getMinPopupWidth(),
    TAB_SIZE_MAX.width - MAX_WIDTH_BUFFER
  );
  return cachedMaxPopupWidth;
}

function getMaxPopupWidth() {
  if (!cachedMaxPopupWidth) return detectMaxPopupWidth();
  return cachedMaxPopupWidth;
}

function getMaxPopupHeight() {
  if (!cachedMaxPopupHeight) return detectMaxPopupHeight();
  return cachedMaxPopupHeight;
}

function refreshPopupDimensionLimits() {
  refreshMinPopupWidth();
  detectMaxPopupHeight();
  detectMaxPopupWidth();
  enforceDimensionLimitsOnAllTabs();
}

function normalizeTabWidth(width) {
  return clampTabDimension(Math.round(width), getMinPopupWidth(), getMaxPopupWidth());
}

function snapResizeDimension(value) {
  return Math.round(value / RESIZE_SNAP) * RESIZE_SNAP;
}

function normalizeTabSize(size, { snap = false } = {}) {
  let width = size.width;
  let height = size.height;
  if (snap) {
    width = snapResizeDimension(width);
    height = snapResizeDimension(height);
  }
  return {
    width: normalizeTabWidth(width),
    height: clampTabDimension(Math.round(height), TAB_SIZE_MIN.height, getMaxPopupHeight())
  };
}

function getPopupTabSize(tabName) {
  ensurePopupTabSizes();
  const tab = POPUP_TABS.includes(tabName) ? tabName : 'templates';
  return { ...DEFAULT_TAB_SIZE, ...settings.popupTabSizes[tab] };
}

function isPopupUnifiedTabSize() {
  return settings.popupUnifiedTabSize === true;
}

function setAllPopupTabSizes(size, persist = true) {
  ensurePopupTabSizes();
  const normalized = normalizeTabSize(size);
  POPUP_TABS.forEach((tab) => {
    settings.popupTabSizes[tab] = { ...normalized };
  });
  if (persist) saveSettings();
}

function setPopupTabSize(tabName, size, persist = true) {
  if (isPopupUnifiedTabSize()) {
    setAllPopupTabSizes(size, persist);
    return;
  }
  ensurePopupTabSizes();
  const tab = POPUP_TABS.includes(tabName) ? tabName : 'templates';
  settings.popupTabSizes[tab] = normalizeTabSize(size);
  if (persist) saveSettings();
}

function getPopupLayoutScale() {
  migratePopupLayout();
  return { ...DEFAULT_POPUP_LAYOUT_SCALE, ...settings.popupLayoutScale };
}

function scaleToPx(base, percent) {
  return Math.round(base * percent / 100);
}

function getPopupLayout() {
  const scale = getPopupLayoutScale();
  return {
    fontSize: scaleToPx(BASE_LAYOUT.fontSize, scale.fontSize),
    padding: scaleToPx(BASE_LAYOUT.padding, scale.padding),
    fontScale: scale.fontSize / 100
  };
}

function applyPopupLayout() {
  const layout = getPopupLayout();
  const root = document.documentElement;

  root.style.setProperty('--font-scale', String(layout.fontScale));
  root.style.setProperty('--popup-font-size', `${layout.fontSize}px`);
  root.style.setProperty('--popup-padding', `${layout.padding}px`);

  migrateCrushedTabSizes();
  cachedMaxPopupWidth = 0;
  cachedMaxPopupHeight = 0;
  refreshPopupDimensionLimits();
  lastAppliedTabSize = { width: 0, height: 0 };
  applyTabSize(lastActiveTab);
}

function applyTabSize(tabName, sizeOverride = null) {
  const raw = sizeOverride || getPopupTabSize(tabName);
  const size = normalizeTabSize(raw);
  if (size.width === lastAppliedTabSize.width && size.height === lastAppliedTabSize.height) return;

  lastAppliedTabSize = { ...size };
  const root = document.documentElement;
  const w = `${size.width}px`;
  const h = `${size.height}px`;

  hideResizeGhost();
  root.style.setProperty('--popup-width', w);
  root.style.setProperty('--popup-height', h);
  root.style.width = w;
  root.style.height = h;
  root.style.overflow = 'hidden';
}

function showResizeGhost(size) {
  if (!popupResizeGhost) return;
  popupResizeGhost.style.top = '0';
  popupResizeGhost.style.right = '0';
  popupResizeGhost.style.left = 'auto';
  popupResizeGhost.style.bottom = 'auto';
  popupResizeGhost.style.width = `${size.width}px`;
  popupResizeGhost.style.height = `${size.height}px`;
  popupResizeGhost.classList.add('visible');
  popupResizeGhost.setAttribute('aria-hidden', 'false');
}

function hideResizeGhost() {
  if (!popupResizeGhost) return;
  popupResizeGhost.classList.remove('visible');
  popupResizeGhost.style.top = '';
  popupResizeGhost.style.right = '';
  popupResizeGhost.style.left = '';
  popupResizeGhost.style.bottom = '';
  popupResizeGhost.style.width = '';
  popupResizeGhost.style.height = '';
  popupResizeGhost.setAttribute('aria-hidden', 'true');
}

function enforceDimensionLimitsOnAllTabs() {
  const minW = getMinPopupWidth();
  const maxW = getMaxPopupWidth();
  const maxH = getMaxPopupHeight();
  let changed = false;
  ensurePopupTabSizes();
  POPUP_TABS.forEach((tab) => {
    const size = settings.popupTabSizes[tab];
    const clampedW = clampTabDimension(size.width, minW, maxW);
    const clampedH = clampTabDimension(size.height, TAB_SIZE_MIN.height, maxH);
    if (size.width !== clampedW) {
      size.width = clampedW;
      changed = true;
    }
    if (size.height !== clampedH) {
      size.height = clampedH;
      changed = true;
    }
  });
  if (changed) saveSettings();
}

function applyPreviewWindowSize(size, frozenWidth) {
  const root = document.documentElement;
  const w = `${frozenWidth}px`;
  const h = `${size.height}px`;
  root.style.setProperty('--popup-width', w);
  root.style.setProperty('--popup-height', h);
  root.style.width = w;
  root.style.height = h;
  root.style.overflow = 'hidden';
}

function syncLayoutControlsToUI() {
  const scale = getPopupLayoutScale();
  LAYOUT_SCALE_CONTROLS.forEach(({ key, valId }) => {
    const label = document.getElementById(valId);
    if (label) label.textContent = `${scale[key]}%`;
  });

  document.querySelectorAll('.layout-stepper').forEach((stepper) => {
    const key = stepper.dataset.scaleKey;
    const value = scale[key];
    const minus = stepper.querySelector('[data-dir="-1"]');
    const plus = stepper.querySelector('[data-dir="1"]');
    if (minus) minus.disabled = value <= LAYOUT_SCALE_MIN;
    if (plus) plus.disabled = value >= LAYOUT_SCALE_MAX;
  });

  if (settingPopupUnifiedTabSize) {
    settingPopupUnifiedTabSize.checked = isPopupUnifiedTabSize();
  }
  if (layoutSizeHintEl) {
    layoutSizeHintEl.textContent = isPopupUnifiedTabSize()
      ? 'Размер окна — потяните за уголок внизу слева. Один размер для всех вкладок.'
      : 'Размер окна — потяните за уголок внизу слева. Для каждой вкладки сохраняется отдельно.';
  }
}

function applyPopupUnifiedTabSize(enabled) {
  settings.popupUnifiedTabSize = enabled;
  if (enabled) {
    setAllPopupTabSizes(getPopupTabSize(lastActiveTab), false);
  }
  saveSettings();
  syncLayoutControlsToUI();
  trackEvent(enabled ? 'settings_change_popupUnifiedTabSize_on' : 'settings_change_popupUnifiedTabSize_off');
}

function updatePopupLayoutScale(key, delta, fromPreset = false) {
  migratePopupLayout();
  const current = getPopupLayoutScale();
  const next = clampScale(current[key] + delta);
  if (next === current[key]) return;

  settings.popupLayoutScale = { ...current, [key]: next };
  if (!fromPreset && settingPopupPreset) settingPopupPreset.value = 'custom';
  saveSettings();
  applyPopupLayout();
  syncLayoutControlsToUI();
}

function applyPopupPreset(presetKey) {
  if (presetKey === 'custom' || !POPUP_PRESETS[presetKey]) return;
  settings.popupLayoutScale = { ...POPUP_PRESETS[presetKey] };
  saveSettings();
  applyPopupLayout();
  syncLayoutControlsToUI();
  trackEvent(`settings_change_popupPreset_${presetKey}`);
}

function resetPopupLayout() {
  settings.popupLayoutScale = { ...DEFAULT_POPUP_LAYOUT_SCALE };
  if (settingPopupPreset) settingPopupPreset.value = 'normal';
  saveSettings();
  applyPopupLayout();
  syncLayoutControlsToUI();
  trackEvent('settings_change_popupLayout_reset');
}

function toggleLayoutAdvanced() {
  if (!layoutAdvancedEl || !toggleLayoutAdvancedBtn) return;
  const isOpen = layoutAdvancedEl.classList.toggle('open');
  toggleLayoutAdvancedBtn.textContent = isOpen ? 'Скрыть настройки ▲' : 'Больше настроек ▼';
}

function initPopupLayoutControls() {
  document.querySelectorAll('.layout-stepper').forEach((stepper) => {
    const key = stepper.dataset.scaleKey;
    stepper.querySelectorAll('.layout-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = parseInt(btn.dataset.dir, 10);
        updatePopupLayoutScale(key, dir * LAYOUT_SCALE_STEP);
      });
    });
  });

  settingPopupPreset?.addEventListener('change', (e) => applyPopupPreset(e.target.value));
  resetPopupLayoutBtn?.addEventListener('click', resetPopupLayout);
  toggleLayoutAdvancedBtn?.addEventListener('click', toggleLayoutAdvanced);
  settingPopupUnifiedTabSize?.addEventListener('change', (e) => applyPopupUnifiedTabSize(e.target.checked));
}

function calcResizeSize(startW, startH, startX, startY, clientX, clientY, snap = false) {
  return normalizeTabSize({
    width: startW - (clientX - startX),
    height: startH + (clientY - startY)
  }, { snap });
}

function initPopupResizeHandle() {
  if (!popupResizeHandle) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startW = 0;
  let startH = 0;
  let previewSize = null;

  popupResizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    const size = getPopupTabSize(lastActiveTab);
    startX = e.clientX;
    startY = e.clientY;
    startW = size.width;
    startH = size.height;
    previewSize = { ...size };
    document.body.style.setProperty('--resize-frozen-w', `${startW}px`);
    document.body.style.setProperty('--resize-frozen-h', `${startH}px`);
    document.body.classList.add('popup-resizing');
    document.body.style.userSelect = 'none';
    popupResizeHandle.classList.add('dragging');
    showResizeGhost(previewSize);
    applyPreviewWindowSize(previewSize, startW);
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    previewSize = calcResizeSize(startW, startH, startX, startY, e.clientX, e.clientY, true);
    showResizeGhost(previewSize);
    applyPreviewWindowSize(previewSize, startW);
  });

  const stopDrag = (e) => {
    if (!dragging) return;
    dragging = false;

    if (e && e.clientX !== undefined) {
      previewSize = calcResizeSize(startW, startH, startX, startY, e.clientX, e.clientY);
    }

    hideResizeGhost();
    document.body.classList.remove('popup-resizing');
    document.body.style.removeProperty('--resize-frozen-w');
    document.body.style.removeProperty('--resize-frozen-h');
    document.body.style.userSelect = '';
    popupResizeHandle.classList.remove('dragging');

    if (previewSize) {
      lastAppliedTabSize = { width: 0, height: 0 };
      setPopupTabSize(lastActiveTab, previewSize, false);
      applyTabSize(lastActiveTab, previewSize);
      previewSize = null;
      saveSettings();
      trackEvent('popup_resize_handle');
    }
  };

  document.addEventListener('mouseup', stopDrag);
  window.addEventListener('blur', () => stopDrag());
}

// ==================== ТАБЫ ====================

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + '-tab').classList.add('active');
    
    // Сохраняем последнюю активную вкладку
    lastActiveTab = tab.dataset.tab;
    chrome.storage.local.set({ lastActiveTab });

    const tabEvent = POPUP_TAB_EVENTS[tab.dataset.tab];
    if (tabEvent) trackEvent(tabEvent);
    
    if (tab.dataset.tab === 'settings') {
      loadSavedFormData();
    }

    applyTabSize(lastActiveTab);
  });
});

// ==================== ЗАГРУЗКА ДАННЫХ ====================
function loadAllData() {
  chrome.storage.local.get(['templates', 'groups', 'settings', 'savedFormData', 'lastActiveTab', 'currentWorkingDate', 'requestsByDate', 'reminders'], (result) => {
    templates = result.templates || [];
    groups = result.groups || [];
    settings = result.settings || { omnichatTemplates: true, ttmButton: true, accountingPanel: true, grafanaSSH: true, reminder: true, ttmOnyma: true, ttmSipal: true, ttmCommentBuilder: true, omnichatTTMLinks: true, darkMode: false, analyticsEnabled: true };
    const hadLegacyLayout = Boolean(
      result.settings?.popupSize ||
      result.settings?.popupLayout ||
      result.settings?.popupLayoutScale?.width !== undefined ||
      result.settings?.popupLayoutScale?.minHeight !== undefined
    );
    migratePopupLayout();
    ensurePopupTabSizes();
    if (hadLegacyLayout || !result.settings?.popupTabSizes) saveSettings();
    if (result.settings && result.settings.analyticsEnabled === undefined) {
      settings.analyticsEnabled = true;
    }
    savedFormData = result.savedFormData || { region: '', fio: '' };
    lastActiveTab = result.lastActiveTab || 'templates';
    activeWorkingDate = result.currentWorkingDate || getTodayStr();
    reminders = result.reminders || [];
    
    // Если переменной еще нет в памяти - создаем
    if (!result.currentWorkingDate) {
      chrome.storage.local.set({ currentWorkingDate: activeWorkingDate });
    }
    
    // Инициализируем данные для текущей даты
    const allData = result.requestsByDate || {};
    if (!allData[activeWorkingDate]) {
      allData[activeWorkingDate] = { entries: [], hours: 0, minutes: 0 };
      chrome.storage.local.set({ requestsByDate: allData });
    }
    
    // Восстанавливаем последнюю активную вкладку
    switchToTab(lastActiveTab);
    
    renderTemplates();
    renderGroupFilter();
    renderTemplateGroupSelect();
    renderGroupsList();
    applySettings();
    applyPopupLayout();
    syncLayoutControlsToUI();
    updateTicketsUI(activeWorkingDate, allData[activeWorkingDate]);
    renderReminders();
  });
}

// Переключение на вкладку
function switchToTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  const tabContent = document.getElementById(tabName + '-tab');
  
  if (tab && tabContent) {
    tab.classList.add('active');
    tabContent.classList.add('active');
    
    if (tabName === 'settings') {
      loadSavedFormData();
    }

    applyTabSize(tabName);
  }
}

function saveTemplates() {
  chrome.storage.local.set({ templates });
}

function saveGroups() {
  chrome.storage.local.set({ groups });
}

function saveSettings() {
  chrome.storage.local.set({ settings });
}

function saveFormData() {
  chrome.storage.local.set({ savedFormData });
}

// ==================== СИНХРОНИЗАЦИЯ ====================
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    // Если дата сменилась в другом месте (например, в content-accounting.js)
    if (changes.currentWorkingDate) {
      activeWorkingDate = changes.currentWorkingDate.newValue;
      chrome.storage.local.get(['requestsByDate'], (res) => {
        updateTicketsUI(activeWorkingDate, res.requestsByDate?.[activeWorkingDate]);
      });
    }
    // Если обновились данные заявок
    if (changes.requestsByDate) {
      updateTicketsUI(activeWorkingDate, changes.requestsByDate.newValue?.[activeWorkingDate]);
    }
    // Проверяем изменение настроек
    if (changes.settings) {
      settings = changes.settings.newValue;
      applySettings();
      applyPopupLayout();
      applyTabSize(lastActiveTab);
      syncLayoutControlsToUI();
      renderTemplates();
    }
    if (changes.templates || changes.groups) {
      chrome.storage.local.get(['templates', 'groups'], (res) => {
        templates = res.templates || [];
        groups = res.groups || [];
        renderTemplates();
        renderGroupFilter();
        renderTemplateGroupSelect();
        renderGroupsList();
      });
    }
  }
});

// ==================== НАСТРОЙКИ ====================
function applySettings() {
  settingOmnichatTemplates.checked = settings.omnichatTemplates;
  settingOmnichatTTMLinks.checked = settings.omnichatTTMLinks !== false; // true по умолчанию
  if (settingOpenTabAdjacent) settingOpenTabAdjacent.checked = settings.openTabAdjacent === true;
  settingTTMButton.checked = settings.ttmButton;
  settingAccountingPanel.checked = settings.accountingPanel;
  settingGrafanaSSH.checked = settings.grafanaSSH;
  settingReminder.checked = settings.reminder;
  settingTTMOnyma.checked = settings.ttmOnyma;
  settingTTMSipal.checked = settings.ttmSipal;
  settingTTMCommentBuilder.checked = settings.ttmCommentBuilder !== false;
  settingDarkMode.checked = settings.darkMode;
  settingAnalytics.checked = settings.analyticsEnabled !== false;
  if (settingTemplateReorderMode) {
    settingTemplateReorderMode.value = getTemplateReorderMode();
  }
  applyDarkMode();
}

function applyDarkMode() {
  if (settings.darkMode) {
    document.documentElement.classList.add('dark-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
  }
  updateIcons();
}

function loadSavedFormData() {
  savedRegion.textContent = savedFormData.region || '-';
  savedFIO.textContent = savedFormData.fio || '-';
}

function bindSettingToggle(element, key) {
  element.addEventListener('change', (e) => {
    settings[key] = e.target.checked;
    saveSettings();
    trackEvent(`settings_change_${key}`);
    if (key === 'darkMode') applyDarkMode();
  });
}

bindSettingToggle(settingOmnichatTemplates, 'omnichatTemplates');
bindSettingToggle(settingOmnichatTTMLinks, 'omnichatTTMLinks');
bindSettingToggle(settingOpenTabAdjacent, 'openTabAdjacent');
bindSettingToggle(settingTTMButton, 'ttmButton');
bindSettingToggle(settingAccountingPanel, 'accountingPanel');
bindSettingToggle(settingGrafanaSSH, 'grafanaSSH');
bindSettingToggle(settingReminder, 'reminder');
bindSettingToggle(settingTTMOnyma, 'ttmOnyma');
bindSettingToggle(settingTTMSipal, 'ttmSipal');
bindSettingToggle(settingTTMCommentBuilder, 'ttmCommentBuilder');
bindSettingToggle(settingDarkMode, 'darkMode');

settingTemplateReorderMode?.addEventListener('change', (e) => {
  settings.templateReorderMode = e.target.value === 'drag' ? 'drag' : 'buttons';
  saveSettings();
  renderTemplates();
  trackEvent(`settings_change_templateReorderMode_${settings.templateReorderMode}`);
});

initPopupLayoutControls();
initPopupResizeHandle();

settingAnalytics.addEventListener('change', (e) => {
  if (!e.target.checked) {
    const confirmed = confirm(
      'Данная информация помогает расширению развиваться. Вы уверены, что хотите отключить сбор метрик?'
    );
    if (!confirmed) {
      e.target.checked = true;
      return;
    }
  }
  settings.analyticsEnabled = e.target.checked;
  saveSettings();
  if (e.target.checked) {
    trackEvent('settings_change_analyticsEnabled');
  }
});

clearSavedDataBtn.addEventListener('click', () => {
  if (confirm('Вы уверены, что хотите очистить сохраненные данные?')) {
    savedFormData = { region: '', fio: '' };
    saveFormData();
    loadSavedFormData();
  }
});

// ==================== УЧЁТ ЗАЯВОК ====================
function updateTicketsUI(date, data) {
  if (!data) data = { entries: [], hours: 0, minutes: 0 };
  ticketEls.currentDate.textContent = date;
  
  const entries = data.entries || [];
  ticketEls.entries.innerHTML = entries.length ? entries.map(e => `
    <li>[${e.time}] ${e.type==='closed'?'Закрыто':'Выезд'} ${e.number||''} ${e.comment||''}</li>
  `).join('') : '<li>Записей нет</li>';
  
  const closed = entries.filter(e => e.type === 'closed').length;
  ticketEls.countClosed.textContent = closed;
  ticketEls.countField.textContent = entries.filter(e => e.type === 'field').length;
  ticketEls.countTotal.textContent = entries.length;
  
  if (document.activeElement !== ticketEls.workHours) ticketEls.workHours.value = data.hours || 0;
  if (document.activeElement !== ticketEls.workMinutes) ticketEls.workMinutes.value = data.minutes || 0;
  
  const h = parseInt(data.hours || 0);
  const m = parseInt(data.minutes || 0);
  const totalH = h + (m / 60);
  
  if (totalH > 0) {
    const lunch = totalH >= 12 ? 1.75 : 0.75;
    const work = totalH - lunch;
    const perf = work > 0 ? (entries.length / work).toFixed(2) : 0;
    ticketEls.performance.textContent = `Производительность: ${perf}`;
  } else {
    ticketEls.performance.textContent = 'Производительность: —';
  }
  
  const perc = entries.length > 0 ? ((closed / entries.length) * 100).toFixed(2) : 0;
  ticketEls.closurePercent.textContent = `Процент закрытия: ${perc}%`;
}

async function addTicketEntry(type) {
  const num = ticketEls.ticketNumber.value.trim();
  const com = ticketEls.ticketComment.value.trim();
  if (!num && !com) return alert('Введите номер заявки или комментарий');
  
  const today = activeWorkingDate;
  const res = await chrome.storage.local.get(['requestsByDate']);
  const allData = res.requestsByDate || {};
  if (!allData[today]) allData[today] = { entries: [], hours: 0, minutes: 0 };
  
  const exists = allData[today].entries.some(e => 
    (num && e.number === num && e.type === type) || 
    (!num && com && e.comment === com && e.type === type)
  );
  
  if (exists) return alert('Уже добавлено');
  
  allData[today].entries.push({ time: getTimeStr(), type, number: num, comment: com });
  trackEvent(type === 'closed' ? 'accounting_entry_closed' : 'accounting_entry_field');
  await chrome.storage.local.set({ requestsByDate: allData });
  ticketEls.ticketNumber.value = '';
  ticketEls.ticketComment.value = '';
}

async function removeLastTicketEntry() {
  const today = activeWorkingDate;
  const res = await chrome.storage.local.get(['requestsByDate']);
  const allData = res.requestsByDate || {};
  if (allData[today]?.entries?.length) {
    allData[today].entries.pop();
    await chrome.storage.local.set({ requestsByDate: allData });
  }
}

async function saveTicketTime() {
  const today = activeWorkingDate;
  const res = await chrome.storage.local.get(['requestsByDate']);
  const allData = res.requestsByDate || {};
  if (!allData[today]) allData[today] = { entries: [] };
  
  allData[today].hours = parseInt(ticketEls.workHours.value) || 0;
  allData[today].minutes = parseInt(ticketEls.workMinutes.value) || 0;
  await chrome.storage.local.set({ requestsByDate: allData });
}

async function startNewDay() {
  if (!confirm('Начать новый день?')) return;
  
  const realToday = getTodayStr();
  activeWorkingDate = realToday;
  
  const res = await chrome.storage.local.get(['requestsByDate']);
  const allData = res.requestsByDate || {};
  allData[realToday] = { entries: [], hours: 0, minutes: 0 };
  
  await chrome.storage.local.set({ 
    requestsByDate: allData,
    currentWorkingDate: realToday
  });
  
  ticketEls.ticketNumber.value = '';
  ticketEls.ticketComment.value = '';
  ticketEls.workHours.value = 0;
  ticketEls.workMinutes.value = 0;
}

async function finishDay() {
  const today = activeWorkingDate;
  const res = await chrome.storage.local.get(['requestsByDate']);
  const dayData = res.requestsByDate?.[today];
  if (!dayData || !dayData.entries.length) return alert('Нет данных для выгрузки');

  trackEvent('accounting_csv_export');

  let csv = '\uFEFFДата;Время;Тип;Номер;Комментарий\n';
  dayData.entries.forEach(e => {
    csv += `${today};${e.time};${e.type==='closed'?'Закрыто':'Выезд'};${e.number || ''};${e.comment || ''}\n`;
  });
  
  const perfText = ticketEls.performance.textContent;
  csv += `\n;;ИТОГО;;\n;;Всего;${dayData.entries.length};\n;;Отработано;${ticketEls.workHours.value}ч ${ticketEls.workMinutes.value}м;\n;;${perfText};;`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Otchet_${today}.csv`;
  link.click();
}

// Инициализация обработчиков для вкладки "Учёт заявок"
ticketEls.addClosed.onclick = () => addTicketEntry('closed');
ticketEls.addField.onclick = () => addTicketEntry('field');
ticketEls.removeLast.onclick = removeLastTicketEntry;
ticketEls.startNewDay.onclick = startNewDay;
ticketEls.finishDay.onclick = finishDay;
ticketEls.workHours.oninput = saveTicketTime;
ticketEls.workMinutes.oninput = saveTicketTime;

// ==================== ШАБЛОНЫ ====================
function getTemplateReorderMode() {
  return settings.templateReorderMode === 'drag' ? 'drag' : 'buttons';
}

function isTemplateDragReorder() {
  return getTemplateReorderMode() === 'drag';
}

function buildTemplateActionsHtml(template, index, total) {
  const reorderButtons = isTemplateDragReorder() ? '' : `
          <div class="template-reorder">
            <button type="button" class="reorder-btn move-up-btn" data-id="${template.id}" title="Выше" ${index === 0 ? 'disabled' : ''}>▲</button>
            <button type="button" class="reorder-btn move-down-btn" data-id="${template.id}" title="Ниже" ${index === total - 1 ? 'disabled' : ''}>▼</button>
          </div>`;

  return `
        <div class="template-actions">
          ${reorderButtons}
          <button class="action-btn copy-btn" data-id="${template.id}" title="Копировать">
            <img src="${getIconUrl('copy')}" alt="Копировать">
          </button>
          <button class="action-btn paste-btn" data-id="${template.id}" title="Вставить в сообщение">
            <img src="${getIconUrl('paste')}" alt="Вставить">
          </button>
          <button class="action-btn edit-btn" data-id="${template.id}" title="Редактировать">
            <img src="${getIconUrl('edit')}" alt="Редактировать">
          </button>
          <button class="action-btn delete-btn" data-id="${template.id}" title="Удалить">
            <img src="${getIconUrl('delete')}" alt="Удалить">
          </button>
        </div>`;
}

function buildTemplateBodyHtml(template, index, total) {
  return `
      <div class="template-header">
        <div style="flex: 1;">
          <h3 class="template-title">${escapeHtml(template.name)}</h3>
          ${template.group ? `<div class="template-group">${escapeHtml(template.group)}</div>` : ''}
        </div>
        ${buildTemplateActionsHtml(template, index, total)}
      </div>
      <p class="template-body">${escapeHtml(template.body)}</p>`;
}

function buildTemplateItemHtml(template, index, total) {
  const dragClass = isTemplateDragReorder() ? ' template-item--drag' : '';
  const body = buildTemplateBodyHtml(template, index, total);

  if (isTemplateDragReorder()) {
    return `
    <div class="template-item${dragClass}" data-id="${template.id}">
      <div class="template-drag-handle" draggable="true" title="Перетащите для изменения порядка" aria-label="Перетащите для изменения порядка">
        <span class="template-drag-grip" aria-hidden="true"></span>
      </div>
      <div class="template-item-content">${body}</div>
    </div>`;
  }

  return `
    <div class="template-item${dragClass}" data-id="${template.id}">
      ${body}
    </div>`;
}

function renderTemplates() {
  const selectedGroup = groupFilter.value;
  const filteredTemplates = selectedGroup ? 
    templates.filter(t => t.group === selectedGroup) : 
    templates;

  if (filteredTemplates.length === 0) {
    templatesList.innerHTML = `
      <div class="empty-state">
        <p>Шаблонов пока нет</p>
        <p>Нажмите "Добавить", чтобы создать первый шаблон</p>
      </div>
    `;
    return;
  }

  templatesList.innerHTML = filteredTemplates
    .map((template, index) => buildTemplateItemHtml(template, index, filteredTemplates.length))
    .join('');

  addEventListenersToButtons();
  if (isTemplateDragReorder()) initTemplateDragDrop();
}

function getVisibleTemplates() {
  const selectedGroup = groupFilter.value;
  return selectedGroup
    ? templates.filter((t) => t.group === selectedGroup)
    : [...templates];
}

function applyTemplateReorder(visible) {
  const selectedGroup = groupFilter.value;
  if (!selectedGroup) {
    templates = visible;
  } else {
    let groupIdx = 0;
    templates = templates.map((t) => {
      if (t.group === selectedGroup) return visible[groupIdx++];
      return t;
    });
  }
  saveTemplates();
  renderTemplates();
  trackEvent('popup_template_reorder');
}

function moveTemplate(id, direction) {
  const visible = getVisibleTemplates();
  const idx = visible.findIndex((t) => t.id === id);
  const targetIdx = idx + direction;
  if (idx === -1 || targetIdx < 0 || targetIdx >= visible.length) return;
  [visible[idx], visible[targetIdx]] = [visible[targetIdx], visible[idx]];
  applyTemplateReorder(visible);
}

let draggedTemplateId = null;

function reorderTemplatesByDrag(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const visible = getVisibleTemplates();
  const sourceIdx = visible.findIndex((t) => t.id === sourceId);
  const targetIdx = visible.findIndex((t) => t.id === targetId);
  if (sourceIdx === -1 || targetIdx === -1) return;
  const [moved] = visible.splice(sourceIdx, 1);
  visible.splice(targetIdx, 0, moved);
  applyTemplateReorder(visible);
}

function initTemplateDragDrop() {
  const items = templatesList.querySelectorAll('.template-item--drag');
  if (!items.length) return;

  items.forEach((item) => {
    const handle = item.querySelector('.template-drag-handle');
    if (!handle) return;

    handle.addEventListener('dragstart', (e) => {
      draggedTemplateId = item.dataset.id;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedTemplateId);
    });

    handle.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      templatesList.querySelectorAll('.template-item').forEach((el) => {
        el.classList.remove('drag-over');
      });
      draggedTemplateId = null;
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      templatesList.querySelectorAll('.template-item').forEach((el) => {
        el.classList.toggle('drag-over', el === item && el.dataset.id !== draggedTemplateId);
      });
    });

    item.addEventListener('dragleave', (e) => {
      if (!item.contains(e.relatedTarget)) {
        item.classList.remove('drag-over');
      }
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      reorderTemplatesByDrag(e.dataTransfer.getData('text/plain') || draggedTemplateId, item.dataset.id);
    });
  });
}

function renderGroupFilter() {
  const currentValue = groupFilter.value;
  
  groupFilter.innerHTML = '<option value="">Все группы</option>' +
    groups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('') +
    '<option value="manage_groups" class="manage-groups-option">Управление группами</option>';

  if (currentValue && groups.includes(currentValue)) {
    groupFilter.value = currentValue;
  } else if (currentValue === "manage_groups") {
    openGroupsModal();
    groupFilter.value = "";
  }
}

function renderTemplateGroupSelect() {
  templateGroup.innerHTML = '<option value="">Без группы</option>' +
    groups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
}

function renderGroupsList() {
  if (groups.length === 0) {
    groupsList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Групп пока нет</p>';
    return;
  }

  groupsList.innerHTML = groups.map(g => `
    <div class="group-item">
      <span>${escapeHtml(g)}</span>
      <div class="group-actions">
        <button class="action-btn delete-btn" data-group="${escapeHtml(g)}" title="Удалить">
          <img src="${getIconUrl('delete')}" alt="Удалить">
        </button>
      </div>
    </div>
  `).join('');

  addGroupDeleteListeners();
}

// ==================== ОБРАБОТЧИКИ ====================
function addEventListenersToButtons() {
  templatesList.removeEventListener('click', handleTemplateActions);
  templatesList.addEventListener('click', handleTemplateActions);
}

function handleTemplateActions(e) {
  const button = e.target.closest('.action-btn, .reorder-btn');
  if (!button || button.disabled) return;

  const id = button.dataset.id;

  if (button.classList.contains('move-up-btn')) {
    moveTemplate(id, -1);
  } else if (button.classList.contains('move-down-btn')) {
    moveTemplate(id, 1);
  } else if (button.classList.contains('copy-btn')) {
    copyTemplateToClipboard(id);
  } else if (button.classList.contains('paste-btn')) {
    pasteTemplateToMessage(id);
  } else if (button.classList.contains('edit-btn')) {
    editTemplate(id);
  } else if (button.classList.contains('delete-btn')) {
    deleteTemplate(id);
  }
}

function addGroupDeleteListeners() {
  groupsList.removeEventListener('click', handleGroupDelete);
  groupsList.addEventListener('click', handleGroupDelete);
}

function handleGroupDelete(e) {
  const btn = e.target.closest('.delete-btn');
  if (btn) {
    deleteGroup(btn.dataset.group);
  }
}

// ==================== ДЕЙСТВИЯ С ШАБЛОНАМИ ====================
function copyTemplateToClipboard(id) {
  const template = templates.find(t => t.id === id);
  if (!template) return;

  trackEvent('popup_template_copy');
  navigator.clipboard.writeText(template.body).catch(err => {
    const textArea = document.createElement('textarea');
    textArea.value = template.body;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  });
}

function pasteTemplateToMessage(id) {
  const template = templates.find(t => t.id === id);
  if (!template) return;

  trackEvent('popup_template_paste');
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'insertTemplate',
        text: template.body
      }, (response) => {
        if (response?.success) {
          window.close();
        }
      });
    }
  });
}

function editTemplate(id) {
  const template = templates.find(t => t.id === id);
  if (!template) return;

  modalTitle.textContent = 'Редактировать шаблон';
  templateId.value = template.id;
  templateName.value = template.name;
  templateGroup.value = template.group || '';
  templateText.value = template.body;
  modalOverlay.style.display = 'flex';
  templateName.focus();
}

function deleteTemplate(id) {
  if (confirm('Удалить этот шаблон?')) {
    templates = templates.filter(t => t.id !== id);
    saveTemplates();
    renderTemplates();
  }
}

function addGroup() {
  const groupName = newGroupName.value.trim();
  if (!groupName) {
    alert('Введите название группы');
    return;
  }
  if (groups.includes(groupName)) {
    alert('Группа уже существует');
    return;
  }

  groups.push(groupName);
  saveGroups();
  renderGroupFilter();
  renderTemplateGroupSelect();
  renderGroupsList();
  newGroupName.value = '';
}

function deleteGroup(groupName) {
  if (!confirm(`Удалить группу "${groupName}"?`)) return;

  groups = groups.filter(g => g !== groupName);
  templates.forEach(t => {
    if (t.group === groupName) t.group = '';
  });

  saveGroups();
  saveTemplates();
  renderGroupFilter();
  renderTemplateGroupSelect();
  renderGroupsList();
  renderTemplates();
}

// ==================== УТИЛИТЫ ====================
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ==================== МОДАЛЬНЫЕ ОКНА ====================
function openAddModal() {
  modalTitle.textContent = 'Добавить шаблон';
  templateId.value = '';
  templateName.value = '';
  templateGroup.value = '';
  templateText.value = '';
  modalOverlay.style.display = 'flex';
  templateName.focus();
}

function closeModal() {
  modalOverlay.style.display = 'none';
  templateForm.reset();
}

function openGroupsModal() {
  groupsModalOverlay.style.display = 'flex';
  newGroupName.focus();
}

function closeGroupsModal() {
  groupsModalOverlay.style.display = 'none';
  newGroupName.value = '';
  groupFilter.value = "";
  renderTemplates();
}

// ==================== СОБЫТИЯ ====================
addTemplateBtn.addEventListener('click', openAddModal);
closeModalBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);

groupFilter.addEventListener('change', function() {
  if (this.value === "manage_groups") {
    openGroupsModal();
    this.value = "";
  } else {
    renderTemplates();
  }
});

closeGroupsModalBtn.addEventListener('click', closeGroupsModal);
closeGroupsModalBtn2.addEventListener('click', closeGroupsModal);
addGroupBtn.addEventListener('click', addGroup);

newGroupName.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addGroup();
  }
});

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

groupsModalOverlay.addEventListener('click', (e) => {
  if (e.target === groupsModalOverlay) closeGroupsModal();
});

templateForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const id = templateId.value || generateId();
  const name = templateName.value.trim();
  const group = templateGroup.value;
  const body = templateText.value.trim();

  if (!name || !body) {
    alert('Заполните все обязательные поля');
    return;
  }

  if (group && !groups.includes(group)) {
    groups.push(group);
    saveGroups();
    renderGroupFilter();
    renderTemplateGroupSelect();
    renderGroupsList();
  }

  const existingIndex = templates.findIndex(t => t.id === id);
  if (existingIndex !== -1) {
    templates[existingIndex] = { id, name, group, body };
  } else {
    templates.push({ id, name, group, body });
  }

  saveTemplates();
  renderTemplates();
  closeModal();
});

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('DOMContentLoaded', () => {
  initImportExportPopup();
  trackEvent('popup_open');
  loadAllData();
});

// ==================== НАПОМИНАЛКА ====================
let reminders = [];

function formatReminderTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) {
    return `Сегодня ${timeStr}`;
  } else {
    const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return `${dateStr} ${timeStr}`;
  }
}

function getTimeStatus(reminder) {
  const now = Date.now();
  const diff = reminder.remindAt - now;
  
  if (reminder.notified) {
    return 'notified'; // Уведомление уже показано
  } else if (diff < 0) {
    return 'overdue'; // Просрочено
  } else if (diff < 60000) {
    return 'soon'; // Меньше минуты
  }
  return 'pending'; // Ожидает
}

function renderReminders() {
  if (reminders.length === 0) {
    remindersList.innerHTML = `
      <div class="reminder-empty">
        <p>Нет активных напоминаний</p>
        <p>Нажмите кнопку таймера в TTM, чтобы создать напоминание</p>
      </div>
    `;
    return;
  }
  
  // Сортируем по времени (ближайшие сначала)
  const sorted = [...reminders].sort((a, b) => a.remindAt - b.remindAt);
  
  remindersList.innerHTML = sorted.map(reminder => {
    const status = getTimeStatus(reminder);
    const statusClass = status === 'notified' ? 'notified' : status === 'overdue' ? 'overdue' : '';
    const statusText = status === 'notified' ? 'Выполнено' : 
                       status === 'overdue' ? 'Просрочено' : 
                       formatReminderTime(reminder.remindAt);
    
    return `
      <div class="reminder-item" data-id="${reminder.id}">
        <div class="reminder-header">
          <a class="reminder-ticket" href="${reminder.ticketUrl}" target="_blank" title="Открыть заявку">
            #${reminder.ticketNumber}
          </a>
          <span class="reminder-time ${statusClass}">${statusText}</span>
        </div>
        ${reminder.description ? `<div class="reminder-description">${escapeHtml(reminder.description)}</div>` : ''}
        <div class="reminder-actions">
          ${status !== 'notified' ? `<button class="reminder-btn reminder-btn-edit" data-id="${reminder.id}">
            Изменить время
          </button>` : ''}
          <button class="reminder-btn reminder-btn-delete" data-id="${reminder.id}">
            Удалить
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  // Добавляем обработчики
  remindersList.querySelectorAll('.reminder-btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteReminder(btn.dataset.id));
  });
  
  remindersList.querySelectorAll('.reminder-btn-edit').forEach(btn => {
    btn.addEventListener('click', () => editReminderTime(btn.dataset.id));
  });
}

async function loadReminders() {
  const result = await chrome.storage.local.get(['reminders']);
  reminders = result.reminders || [];
  renderReminders();
}

async function deleteReminder(id) {
  if (!confirm('Удалить это напоминание?')) return;
  
  await chrome.runtime.sendMessage({ action: 'removeReminder', reminderId: id });
  reminders = reminders.filter(r => r.id !== id);
  renderReminders();
}

function editReminderTime(id) {
  const reminder = reminders.find(r => r.id === id);
  if (!reminder) return;
  
  // Создаём модальное окно редактирования
  const existingModal = document.getElementById('edit-reminder-modal');
  if (existingModal) existingModal.remove();
  
  // Находим элемент напоминания, под которым нужно показать форму
  const reminderItem = document.querySelector(`.reminder-item[data-id="${id}"]`);
  
  // Определяем цвета в зависимости от темы
  const isDark = settings.darkMode;
  const bgColor = isDark ? '#16213e' : 'white';
  const textColor = isDark ? '#eaeaea' : '#333';
  const mutedColor = isDark ? '#888' : '#666';
  const borderColor = isDark ? '#2a3f5f' : '#c0d3e2';
  const inputBg = isDark ? '#1a1a2e' : 'white';
  
  const modal = document.createElement('div');
  modal.id = 'edit-reminder-modal';
  modal.innerHTML = `
    <div class="reminder-edit-content" style="
      position: relative;
      background: ${bgColor};
      border-radius: 8px;
      width: 100%;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      border: 1px solid ${borderColor};
      margin-top: 10px;
    ">
        <div class="tsl-modal-header" style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid ${borderColor};
        ">
          <h3 style="margin: 0; font-size: 14px; color: ${textColor};">Изменить время для #${reminder.ticketNumber}</h3>
          <button class="tsl-modal-close" style="background: none; border: none; font-size: 20px; cursor: pointer; color: ${mutedColor};">&times;</button>
        </div>
        <div class="tsl-modal-body" style="padding: 12px 16px;">
          <div class="tsl-form-group" style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 500; color: ${textColor};">Тип времени</label>
            <div style="display: flex; flex-wrap: wrap; gap: 12px;">
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; white-space: nowrap; color: ${textColor};">
                <input type="radio" name="editTimerType" value="minutes" checked>
                <span>Через N минут</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; white-space: nowrap; color: ${textColor};">
                <input type="radio" name="editTimerType" value="time">
                <span>В указанное время</span>
              </label>
            </div>
          </div>
          
          <div class="tsl-form-group tsl-minutes-group" style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500; color: ${textColor};">Минуты</label>
            <input type="number" id="editTimerMinutes" placeholder="Например: 30" min="1" max="1440" style="
              width: 100%;
              padding: 8px 10px;
              border: 1px solid ${borderColor};
              border-radius: 4px;
              font-size: 13px;
              box-sizing: border-box;
              background: ${inputBg};
              color: ${textColor};
            ">
          </div>
          
          <div class="tsl-form-group tsl-time-group" style="display: none; margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500; color: ${textColor};">Время (ЧЧ:ММ)</label>
            <input type="time" id="editTimerTime" style="
              width: 100%;
              padding: 8px 10px;
              border: 1px solid ${borderColor};
              border-radius: 4px;
              font-size: 13px;
              box-sizing: border-box;
              background: ${inputBg};
              color: ${textColor};
            ">
          </div>
          
          <div class="tsl-form-group" style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500; color: ${textColor};">Описание</label>
            <textarea id="editTimerDescription" placeholder="Описание напоминания" rows="2" style="
              width: 100%;
              padding: 8px 10px;
              border: 1px solid ${borderColor};
              border-radius: 4px;
              font-size: 13px;
              box-sizing: border-box;
              resize: vertical;
              background: ${inputBg};
              color: ${textColor};
            ">${reminder.description || ''}</textarea>
          </div>
        </div>
        <div class="tsl-modal-footer" style="
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 10px 16px;
          border-top: 1px solid ${borderColor};
        ">
          <button class="tsl-btn tsl-btn-secondary" id="editCancelBtn" style="
            padding: 6px 14px;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            background: #6c757d;
            color: white;
          ">Отмена</button>
          <button class="tsl-btn tsl-btn-primary" id="editSaveBtn" style="
            padding: 6px 14px;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            background: #007bff;
            color: white;
          ">Сохранить</button>
        </div>
      </div>
  `;
  
  // Добавляем модальное окно после конкретного элемента напоминания
  if (reminderItem) {
    reminderItem.parentNode.insertBefore(modal, reminderItem.nextSibling);
  } else {
    // Fallback - добавляем в конец списка
    remindersList.parentNode.insertBefore(modal, remindersList.nextSibling);
  }
  
  // Функция для закрытия
  const closeModal = () => {
    modal.remove();
  };
  
  // Обработчики
  const closeBtn = modal.querySelector('.tsl-modal-close');
  const cancelBtn = modal.querySelector('#editCancelBtn');
  const saveBtn = modal.querySelector('#editSaveBtn');
  const radioButtons = modal.querySelectorAll('input[name="editTimerType"]');
  const minutesGroup = modal.querySelector('.tsl-minutes-group');
  const timeGroup = modal.querySelector('.tsl-time-group');
  
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  
  // Переключение типа
  radioButtons.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'minutes') {
        minutesGroup.style.display = 'block';
        timeGroup.style.display = 'none';
      } else {
        minutesGroup.style.display = 'none';
        timeGroup.style.display = 'block';
      }
    });
  });
  
  // Сохранение
  saveBtn.addEventListener('click', () => {
    const timerType = modal.querySelector('input[name="editTimerType"]:checked').value;
    const minutes = modal.querySelector('#editTimerMinutes').value;
    const specificTime = modal.querySelector('#editTimerTime').value;
    const description = modal.querySelector('#editTimerDescription').value.trim();
    
    let newRemindAt = null;
    
    if (timerType === 'minutes') {
      if (!minutes) {
        alert('Укажите количество минут');
        return;
      }
      newRemindAt = Date.now() + (parseInt(minutes) * 60 * 1000);
    } else {
      if (!specificTime) {
        alert('Укажите время напоминания');
        return;
      }
      
      const [hours, mins] = specificTime.split(':').map(Number);
      const now = new Date();
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, mins);
      
      if (targetDate.getTime() <= now.getTime()) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
      
      newRemindAt = targetDate.getTime();
    }
    
    chrome.runtime.sendMessage({
      action: 'updateReminder',
      data: { id, remindAt: newRemindAt, description }
    }, (response) => {
      if (response?.success) {
        reminder.remindAt = newRemindAt;
        reminder.description = description;
        reminder.notified = false;
        renderReminders();
        closeModal();
      } else {
        alert('Ошибка при обновлении напоминания');
      }
    });
  });
}

// Слушаем изменения в storage для напоминаний
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.reminders) {
    reminders = changes.reminders.newValue || [];
    renderReminders();
  }
});

// ==================== ОБРАТНАЯ СВЯЗЬ ====================
const feedbackModalOverlay = document.getElementById('feedbackModalOverlay');
const feedbackForm = document.getElementById('feedbackForm');
const openFeedbackBtn = document.getElementById('openFeedbackBtn');
const closeFeedbackModalBtn = document.getElementById('closeFeedbackModalBtn');
const cancelFeedbackBtn = document.getElementById('cancelFeedbackBtn');

// Открытие модального окна
openFeedbackBtn.addEventListener('click', () => {
  feedbackModalOverlay.style.display = 'flex';
});

// Закрытие модального окна
function closeFeedbackModal() {
  feedbackModalOverlay.style.display = 'none';
  feedbackForm.reset();
}

closeFeedbackModalBtn.addEventListener('click', closeFeedbackModal);
cancelFeedbackBtn.addEventListener('click', closeFeedbackModal);

feedbackModalOverlay.addEventListener('click', (e) => {
  if (e.target === feedbackModalOverlay) {
    closeFeedbackModal();
  }
});

// Отправка отзыва
feedbackForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const type = document.getElementById('feedbackType').value;
  const message = document.getElementById('feedbackMessage').value.trim();
  const email = document.getElementById('feedbackEmail').value.trim();
  
  if (!message) {
    alert('Введите сообщение');
    return;
  }
  
  const submitBtn = document.getElementById('submitFeedbackBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Отправка...';
  
  try {
    const data = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'sendFeedback',
        data: { type, message, email: email || null }
      }, resolve);
    });

    if (data?.success) {
      trackEvent('feedback_sent');
      alert('Спасибо за ваш отзыв!');
      closeFeedbackModal();
    } else {
      alert('Ошибка: ' + (data.error || 'Не удалось отправить'));
    }
  } catch (error) {
    console.error('Failed to send feedback:', error);
    alert('Не удалось отправить отзыв. Проверьте подключение к интернету.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Отправить';
  }
});
