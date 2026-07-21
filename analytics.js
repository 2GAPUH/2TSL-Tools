// analytics.js — модуль аналитики (подключается через importScripts в background.js)
// После развёртывания Google Apps Script вставьте URL и SECRET ниже.

const SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbz2hq7kv3n96k2KKvagBHnaLFjrKUGT-14JEkEGOzLLvZHSOhgeXLrX26hVJcIXsAA4/exec';
const API_SECRET = '168CD5F539391087A7614476086B7F5B7A9D4A7AAA10A892189AFB1978251B1D';
const FLUSH_INTERVAL_MINUTES = 30;
const MAX_EVENT_TYPES = 50;

// ==================== ИДЕНТИФИКАЦИЯ ====================

async function getInstallId() {
  const result = await chrome.storage.local.get(['installId']);
  if (result.installId) return result.installId;

  const installId = 'inst_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  await chrome.storage.local.set({ installId });
  return installId;
}

async function getProfileId() {
  const cached = await chrome.storage.local.get(['profileId']);
  if (cached.profileId) return cached.profileId;

  if (!chrome.identity?.getProfileUserInfo) return null;

  const info = await new Promise((resolve) => {
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (result) => {
      if (chrome.runtime.lastError) {
        console.warn('[2TSL Analytics] identity:', chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      resolve(result);
    });
  });

  if (info?.id) {
    await chrome.storage.local.set({ profileId: info.id });
    return info.id;
  }

  return null;
}

// ==================== ОЧЕРЕДЬ ====================

async function getAnalyticsQueue() {
  const result = await chrome.storage.local.get(['analyticsQueue']);
  const queue = result.analyticsQueue || {};
  return {
    pending: queue.pending || {},
    periodStart: queue.periodStart || Date.now(),
    lastFlush: queue.lastFlush || 0,
    settingsSnapshot: queue.settingsSnapshot || null
  };
}

async function saveAnalyticsQueue(queue) {
  await chrome.storage.local.set({ analyticsQueue: queue });
}

async function isAnalyticsEnabled() {
  const result = await chrome.storage.local.get(['settings']);
  return result.settings?.analyticsEnabled !== false;
}

function isApiConfigured() {
  return Boolean(SHEETS_API_URL && API_SECRET);
}

// ==================== СНИМОК НАСТРОЕК ====================

async function updateSettingsSnapshot() {
  const result = await chrome.storage.local.get(['settings', 'templates']);
  const settings = result.settings || {};
  const templatesCount = (result.templates || []).length;

  const snapshot = {
    omnichatTemplates: settings.omnichatTemplates !== false,
    omnichatTTMLinks: settings.omnichatTTMLinks !== false,
    ttmButton: settings.ttmButton !== false,
    accountingPanel: settings.accountingPanel !== false,
    grafanaSSH: settings.grafanaSSH !== false,
    reminder: settings.reminder !== false,
    ttmOnyma: settings.ttmOnyma !== false,
    ttmSipal: settings.ttmSipal !== false,
    ttmCommentBuilder: settings.ttmCommentBuilder !== false,
    darkMode: !!settings.darkMode,
    argusDarkTheme: !!settings.argusDarkTheme,
    argusDarkPalette: settings.argusDarkPalette || 'slate',
    templatesCount
  };

  const queue = await getAnalyticsQueue();
  queue.settingsSnapshot = snapshot;
  await saveAnalyticsQueue(queue);
  return snapshot;
}

// ==================== ТРЕКИНГ ====================

async function trackEvent(eventName) {
  if (!eventName || !(await isAnalyticsEnabled())) return;

  const queue = await getAnalyticsQueue();
  const now = Date.now();

  if (!queue.periodStart) queue.periodStart = now;

  if (!queue.pending[eventName]) {
    if (Object.keys(queue.pending).length >= MAX_EVENT_TYPES) return;
    queue.pending[eventName] = { count: 0, lastAt: now };
  }

  queue.pending[eventName].count += 1;
  queue.pending[eventName].lastAt = now;

  await saveAnalyticsQueue(queue);
}

// ==================== ОТПРАВКА ====================

async function buildFlushPayload() {
  const [profileId, installId, queue] = await Promise.all([
    getProfileId(),
    getInstallId(),
    getAnalyticsQueue()
  ]);

  if (!queue.settingsSnapshot) {
    await updateSettingsSnapshot();
  }

  const refreshedQueue = await getAnalyticsQueue();
  const manifest = chrome.runtime.getManifest();
  const platformInfo = await new Promise((resolve) => chrome.runtime.getPlatformInfo(resolve));
  const now = Date.now();

  const events = {};
  for (const [name, data] of Object.entries(refreshedQueue.pending || {})) {
    events[name] = data.count;
  }

  return {
    secret: API_SECRET,
    action: 'flush',
    profileId: profileId || '',
    installId,
    version: manifest.version,
    platform: platformInfo.os,
    settings: refreshedQueue.settingsSnapshot || {},
    events,
    periodStart: new Date(refreshedQueue.periodStart || now).toISOString(),
    periodEnd: new Date(now).toISOString()
  };
}

async function flushAnalytics(force = false) {
  if (!isApiConfigured()) {
    return { success: false, skipped: true, reason: 'not_configured' };
  }

  if (!(await isAnalyticsEnabled())) {
    return { success: false, skipped: true, reason: 'disabled' };
  }

  const queue = await getAnalyticsQueue();
  const hasEvents = Object.keys(queue.pending || {}).length > 0;
  const timeSinceFlush = Date.now() - (queue.lastFlush || 0);
  const intervalMs = FLUSH_INTERVAL_MINUTES * 60 * 1000;

  if (!force && !hasEvents && timeSinceFlush < intervalMs) {
    return { success: false, skipped: true, reason: 'too_early' };
  }

  const payload = await buildFlushPayload();

  try {
    const response = await fetch(SHEETS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { success: false, error: 'Invalid response' };
    }

    if (data.success) {
      await saveAnalyticsQueue({
        pending: {},
        periodStart: Date.now(),
        lastFlush: Date.now(),
        settingsSnapshot: payload.settings
      });
      if (typeof recordSuccessfulFlush === 'function') {
        await recordSuccessfulFlush();
      }
      console.log('[2TSL Analytics] Данные отправлены');
      return { success: true, successfulFlushCount: data.successfulFlushCount };
    }

    console.error('[2TSL Analytics] Ошибка сервера:', data.error);
    return { success: false, error: data.error };
  } catch (error) {
    console.error('[2TSL Analytics] Ошибка сети:', error);
    return { success: false, error: error.message };
  }
}

async function sendFeedback(data) {
  if (!isApiConfigured()) {
    return { success: false, error: 'API не настроен. Укажите URL и SECRET в analytics.js' };
  }

  const [profileId, installId] = await Promise.all([getProfileId(), getInstallId()]);
  const manifest = chrome.runtime.getManifest();

  try {
    const response = await fetch(SHEETS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        secret: API_SECRET,
        action: 'feedback',
        profileId: profileId || '',
        installId,
        type: data.type,
        message: data.message,
        email: data.email || '',
        version: manifest.version
      })
    });

    const text = await response.text();
    return JSON.parse(text);
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

function initAnalyticsAlarms() {
  chrome.alarms.create('analyticsFlush', { periodInMinutes: FLUSH_INTERVAL_MINUTES });
}

async function handleInstallAnalytics(details) {
  if (details.reason === 'install') {
    await trackEvent('extension_installed');
  } else if (details.reason === 'update') {
    await trackEvent('extension_updated');
  }
  await updateSettingsSnapshot();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    updateSettingsSnapshot();
  }
});