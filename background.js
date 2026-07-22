// background.js
// Service worker для Manifest V3

importScripts('analytics.js', 'cloud-sync.js');

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

initAnalyticsAlarms();

const AUTO_RESET_ALARM = 'autoResetShift';

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[2TSL] Расширение установлено:', details.reason);
  await handleInstallAnalytics(details);
  await flushAnalytics(true);
  await refreshAutoResetAlarmFromStorage();
});

chrome.runtime.onStartup.addListener(async () => {
  await restoreReminders();
  await flushAnalytics();
  await refreshAutoResetAlarmFromStorage();
});

// ==================== ОБРАБОТКА СООБЩЕНИЙ ====================

async function createExtensionTab(url, senderTabId) {
  const { settings } = await chrome.storage.local.get(['settings']);
  const openAdjacent = settings?.openTabAdjacent === true;

  const createOptions = { url };
  if (openAdjacent) {
    let tabId = senderTabId;
    if (!tabId) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = activeTab?.id;
    }
    if (tabId) {
      try {
        const sourceTab = await chrome.tabs.get(tabId);
        createOptions.index = sourceTab.index + 1;
      } catch (e) {
        console.warn('[2TSL] Не удалось определить позицию вкладки:', e);
      }
    }
  }

  const tab = await chrome.tabs.create(createOptions);
  console.log('[2TSL] Открыта вкладка:', tab.id, url);
  return tab;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openForm') {
    createExtensionTab(request.url, sender.tab?.id)
      .then((tab) => sendResponse({ success: true, tabId: tab?.id }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Форма ассистента: сначала создаём вкладку, затем пишем ttmFormData с targetTabId.
  // Иначе все уже открытые вкладки формы могут прочитать чужие данные заявки.
  if (request.action === 'openAssistantForm') {
    createExtensionTab(request.url, sender.tab?.id)
      .then(async (tab) => {
        const formData = {
          ...(request.formData || {}),
          targetTabId: tab.id,
          sourceTabId: sender.tab?.id || null,
          timestamp: Date.now()
        };
        await chrome.storage.local.set({ ttmFormData: formData });
        sendResponse({ success: true, tabId: tab.id });
      })
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Omnichat → TTM: одна новая вкладка + search data только для неё (не для всех TTM-вкладок).
  if (request.action === 'openTtmSearch') {
    const searchValue = String(request.searchValue || '').replace(/\s+/g, '');
    if (!searchValue) {
      sendResponse({ success: false, error: 'empty_search' });
      return false;
    }

    createExtensionTab(request.url || 'https://www.ttm.rt.ru/', sender.tab?.id)
      .then(async (tab) => {
        await chrome.storage.local.set({
          ttmSearchData: {
            searchValue,
            targetTabId: tab.id,
            sourceTabId: sender.tab?.id || null,
            timestamp: Date.now()
          }
        });
        sendResponse({ success: true, tabId: tab.id });
      })
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getTabId') {
    sendResponse({ success: true, tabId: sender.tab?.id ?? null });
    return false;
  }

  if (request.action === 'trackEvent') {
    trackEvent(request.event).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'sendFeedback') {
    sendFeedback(request.data).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  if (request.action === 'addReminder') {
    addReminder(request.data).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'removeReminder') {
    removeReminder(request.reminderId).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'updateReminder') {
    updateReminder(request.data).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'getReminders') {
    getReminders().then((reminders) => {
      sendResponse({ success: true, reminders });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'volgaHelpCopied') {
    chrome.storage.local.set({
      volgaHelpPastePending: {
        ticketNumber: request.ticketNumber || '',
        commentEditorQaId: request.commentEditorQaId || '',
        text: request.text || '',
        timestamp: Date.now()
      }
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'cloudCheckEligibility') {
    checkCloudEligibility(request.force).then(sendResponse);
    return true;
  }

  if (request.action === 'cloudExport') {
    cloudExportTemplates(request.templates, request.includeGroups).then(sendResponse);
    return true;
  }

  if (request.action === 'cloudImport') {
    cloudImportByToken(request.token).then(sendResponse);
    return true;
  }

  if (request.action === 'setAutoResetShiftAlarm') {
    setAutoResetShiftAlarm(request.enabled, request.time)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'triggerAutoResetNow') {
    // Ручной тестовый/внутренний вызов сброса
    performAutoShiftReset()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'refreshAutoResetAlarm') {
    refreshAutoResetAlarmFromStorage()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // EPD: lookup OUI (год/месяц + вендор) через maclookup.app
  if (request.action === 'lookupMacOui') {
    lookupMacOui(request.mac || request.oui)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message, data: { found: false } }));
    return true;
  }

  return true;
});

// ==================== MAC OUI LOOKUP (maclookup.app) ====================

const MAC_OUI_CACHE_KEY = 'macOuiCache';
const MAC_OUI_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
const MAC_OUI_FETCH_GAP_MS = 120; // ~8 req/s, лимит API 10/s

/** @type {Map<string, {data: object, savedAt: number}>} */
const macOuiMem = new Map();
/** @type {Map<string, Promise<object>>} */
const macOuiInflight = new Map();
let macOuiLastFetchAt = 0;

function normalizeOuiHex(macOrOui) {
  const hex = String(macOrOui || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  return hex.slice(0, 6);
}

async function loadMacOuiCacheStore() {
  try {
    const res = await chrome.storage.local.get([MAC_OUI_CACHE_KEY]);
    return res[MAC_OUI_CACHE_KEY] && typeof res[MAC_OUI_CACHE_KEY] === 'object'
      ? res[MAC_OUI_CACHE_KEY]
      : {};
  } catch (e) {
    return {};
  }
}

async function saveMacOuiCacheEntry(oui, data) {
  try {
    const store = await loadMacOuiCacheStore();
    store[oui] = { data, savedAt: Date.now() };
    // Ограничим размер кэша (~500 OUI)
    const keys = Object.keys(store);
    if (keys.length > 500) {
      keys
        .map((k) => ({ k, t: store[k]?.savedAt || 0 }))
        .sort((a, b) => a.t - b.t)
        .slice(0, keys.length - 500)
        .forEach(({ k }) => { delete store[k]; });
    }
    await chrome.storage.local.set({ [MAC_OUI_CACHE_KEY]: store });
  } catch (e) {
    console.warn('[2TSL] macOui cache write:', e);
  }
}

async function lookupMacOui(macOrOui) {
  const oui = normalizeOuiHex(macOrOui);
  if (oui.length < 6) {
    return { found: false, error: 'invalid_oui' };
  }

  const mem = macOuiMem.get(oui);
  if (mem && (Date.now() - mem.savedAt) < MAC_OUI_CACHE_TTL_MS) {
    return mem.data;
  }

  const store = await loadMacOuiCacheStore();
  const cached = store[oui];
  if (cached?.data && (Date.now() - (cached.savedAt || 0)) < MAC_OUI_CACHE_TTL_MS) {
    macOuiMem.set(oui, { data: cached.data, savedAt: cached.savedAt });
    return cached.data;
  }

  if (macOuiInflight.has(oui)) {
    return macOuiInflight.get(oui);
  }

  const job = (async () => {
    const wait = MAC_OUI_FETCH_GAP_MS - (Date.now() - macOuiLastFetchAt);
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    macOuiLastFetchAt = Date.now();

    const url = 'https://api.maclookup.app/v2/macs/' + encodeURIComponent(oui);
    const res = await fetch(url, { method: 'GET', credentials: 'omit' });

    if (res.status === 404) {
      const data = { found: false, oui };
      macOuiMem.set(oui, { data, savedAt: Date.now() });
      await saveMacOuiCacheEntry(oui, data);
      return data;
    }

    if (res.status === 429) {
      throw new Error('rate_limited');
    }

    if (!res.ok) {
      throw new Error('http_' + res.status);
    }

    const json = await res.json();
    const data = {
      found: json.found === true,
      oui,
      macPrefix: json.macPrefix || oui,
      company: json.company || '',
      updated: json.updated || '',
      blockType: json.blockType || '',
      isPrivate: !!json.isPrivate,
      isRand: !!json.isRand
    };

    macOuiMem.set(oui, { data, savedAt: Date.now() });
    await saveMacOuiCacheEntry(oui, data);
    return data;
  })();

  macOuiInflight.set(oui, job);
  try {
    return await job;
  } finally {
    macOuiInflight.delete(oui);
  }
}

// ==================== НАПОМИНАЛКА ====================

async function addReminder(data) {
  const { ticketNumber, ticketUrl, minutes, specificTime, description } = data;

  let remindAt;

  if (minutes) {
    remindAt = Date.now() + (minutes * 60 * 1000);
  } else if (specificTime) {
    const [hours, minutesVal] = specificTime.split(':').map(Number);
    const now = new Date();
    const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutesVal);

    if (targetDate.getTime() <= now.getTime()) {
      targetDate.setDate(targetDate.getDate() + 1);
    }

    remindAt = targetDate.getTime();
  } else {
    throw new Error('Не указано время напоминания');
  }

  const reminder = {
    id: `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ticketNumber,
    ticketUrl,
    description: description || '',
    remindAt,
    createdAt: Date.now(),
    notified: false
  };

  const result = await chrome.storage.local.get(['reminders']);
  const reminders = result.reminders || [];
  reminders.push(reminder);
  await chrome.storage.local.set({ reminders });

  const delayMinutes = Math.max(1, (remindAt - Date.now()) / 60000);
  chrome.alarms.create(reminder.id, { delayInMinutes: delayMinutes });

  trackEvent('ttm_reminder_created');
  console.log('[2TSL] Напоминание добавлено:', reminder);

  return reminder;
}

async function removeReminder(reminderId) {
  const result = await chrome.storage.local.get(['reminders']);
  const reminders = result.reminders || [];

  const filtered = reminders.filter(r => r.id !== reminderId);
  await chrome.storage.local.set({ reminders: filtered });

  chrome.alarms.clear(reminderId);
  console.log('[2TSL] Напоминание удалено:', reminderId);
}

async function updateReminder(data) {
  const { id, remindAt, description } = data;

  const result = await chrome.storage.local.get(['reminders']);
  const reminders = result.reminders || [];

  const index = reminders.findIndex(r => r.id === id);
  if (index === -1) {
    throw new Error('Напоминание не найдено');
  }

  if (remindAt) {
    reminders[index].remindAt = remindAt;
    chrome.alarms.clear(id);
    const delayMinutes = Math.max(1, (remindAt - Date.now()) / 60000);
    chrome.alarms.create(id, { delayInMinutes: delayMinutes });
  }

  if (description !== undefined) {
    reminders[index].description = description;
  }

  reminders[index].notified = false;
  await chrome.storage.local.set({ reminders });

  console.log('[2TSL] Напоминание обновлено:', reminders[index]);
}

async function getReminders() {
  const result = await chrome.storage.local.get(['reminders']);
  return result.reminders || [];
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'analyticsFlush') {
    await flushAnalytics(true);
    return;
  }

  if (alarm.name === 'cleanupReminders') {
    await cleanupOldReminders();
    return;
  }

  if (alarm.name === AUTO_RESET_ALARM) {
    console.log('[2TSL] Автосброс статистики (сработал alarm)');
    await performAutoShiftReset();
    // После сброса переустанавливаем будильник на следующий день
    await refreshAutoResetAlarmFromStorage();
    return;
  }

  console.log('[2TSL] Alarm сработал:', alarm.name);

  const result = await chrome.storage.local.get(['reminders']);
  const reminders = result.reminders || [];
  const reminder = reminders.find(r => r.id === alarm.name);

  if (reminder && !reminder.notified) {
    chrome.notifications.create(reminder.id, {
      type: 'basic',
      iconUrl: 'icons/icon.png',
      title: `⏰ Напоминание: Заявка #${reminder.ticketNumber}`,
      message: reminder.description || 'Пора заняться этой заявкой!',
      priority: 2,
      requireInteraction: true
    });

    reminder.notified = true;
    reminder.notifiedAt = Date.now();
    await chrome.storage.local.set({ reminders });

    console.log('[2TSL] Уведомление показано:', reminder);
  }
});

chrome.alarms.create('cleanupReminders', { periodInMinutes: 5 });

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const result = await chrome.storage.local.get(['reminders']);
  const reminders = result.reminders || [];
  const reminder = reminders.find(r => r.id === notificationId);

  if (reminder && reminder.ticketUrl) {
    await createExtensionTab(reminder.ticketUrl);
    chrome.notifications.clear(notificationId);
  }
});

async function cleanupOldReminders() {
  const result = await chrome.storage.local.get(['reminders']);
  const reminders = result.reminders || [];
  const now = Date.now();
  const thirtyMinutesAgo = now - (30 * 60 * 1000);
  const initialCount = reminders.length;

  const filtered = reminders.filter(r => {
    if (!r.notified) return true;
    if (r.notifiedAt && r.notifiedAt > thirtyMinutesAgo) return true;
    return false;
  });

  if (filtered.length !== initialCount) {
    await chrome.storage.local.set({ reminders: filtered });
    console.log(`[2TSL] Очистка: удалено ${initialCount - filtered.length} старых напоминаний`);
  }
}

async function restoreReminders() {
  console.log('[2TSL] Восстановление напоминаний при запуске...');

  const result = await chrome.storage.local.get(['reminders']);
  const reminders = result.reminders || [];
  const now = Date.now();

  for (const reminder of reminders) {
    if (!reminder.notified && reminder.remindAt > now) {
      const delayMinutes = Math.max(1, (reminder.remindAt - now) / 60000);
      chrome.alarms.create(reminder.id, { delayInMinutes: delayMinutes });
      console.log('[2TSL] Восстановлен alarm для:', reminder.id);
    } else if (!reminder.notified && reminder.remindAt <= now) {
      chrome.notifications.create(reminder.id, {
        type: 'basic',
        iconUrl: 'icons/icon.png',
        title: `⏰ Просроченное напоминание: Заявка #${reminder.ticketNumber}`,
        message: reminder.description || 'Пора заняться этой заявкой!',
        priority: 2,
        requireInteraction: true
      });
      reminder.notified = true;
    }
  }

  await chrome.storage.local.set({ reminders });
}

// ==================== АВТОСБРОС СТАТИСТИКИ ====================

function pad2(n) { return String(n).padStart(2, '0'); }
function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Вычисляем ближайший timestamp срабатывания для HH:MM
// (если время уже прошло сегодня — берём на следующий день)
function computeNextResetTimestamp(timeStr) {
  const [h, m] = String(timeStr || '03:00').split(':').map(n => parseInt(n, 10));
  const now = new Date();
  const target = new Date(now);
  target.setHours(isNaN(h) ? 3 : h, isNaN(m) ? 0 : m, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

async function setAutoResetShiftAlarm(enabled, time) {
  await chrome.alarms.clear(AUTO_RESET_ALARM);
  if (!enabled) {
    console.log('[2TSL] Автосброс статистики отключён');
    return;
  }
  const when = computeNextResetTimestamp(time);
  // periodInMinutes = 1440 = сутки; но из-за спячки браузера/сервера используем
  // just when: и повторно переустанавливаем в обработчике после срабатывания.
  await chrome.alarms.create(AUTO_RESET_ALARM, { when });
  const d = new Date(when);
  console.log(`[2TSL] Автосброс статистики запланирован на ${d.toLocaleString('ru-RU')}`);
}

async function refreshAutoResetAlarmFromStorage() {
  try {
    const { settings } = await chrome.storage.local.get(['settings']);
    const enabled = settings?.autoResetShift === true;
    const time = settings?.autoResetShiftTime || '03:00';
    if (!enabled) {
      await chrome.alarms.clear(AUTO_RESET_ALARM);
      console.log('[2TSL] Автосброс статистики отключён');
      return;
    }

    const [h, m] = String(time).split(':').map(n => parseInt(n, 10));
    const setH = isNaN(h) ? 3 : h;
    const setM = isNaN(m) ? 0 : m;
    const now = new Date();
    const todayNowStr = todayStr(now);

    // ✅ Надёжная проверка пропущенного сброса:
    // Сбрасываем ТОЛЬКО если:
    // 1. Текущая рабочая дата в хранилище — это вчера или раньше (смена не сброшена после прошлого автосброса)
    // 2. Текущее время уже перешло за настроенное время сброса (т.е. мы находимся в периоде "после сброса" новых суток)
    // При перезапуске браузера днём того же дня — currentWorkingDate уже сегодняшняя, сброс не произойдёт.
    const { currentWorkingDate } = await chrome.storage.local.get(['currentWorkingDate']);
    const workingDateIsToday = currentWorkingDate === todayNowStr;

    const todayTarget = new Date(now);
    todayTarget.setHours(setH, setM, 0, 0);
    const timeHasComeToday = now.getTime() >= todayTarget.getTime();

    if (!workingDateIsToday && timeHasComeToday) {
      console.log('[2TSL] Пропущено время автосброса (браузер был выключен/перезагружен) — выполняем сейчас');
      await performAutoShiftReset();
    }

    // Устанавливаем alarm на ближайшее будущее время
    await setAutoResetShiftAlarm(true, time);
  } catch (e) {
    console.warn('[2TSL] Не удалось обновить автосброс из storage:', e);
  }
}

// Собственно сброс — аналог функции startNewDay() из popup и newDay() из сайдбара
async function performAutoShiftReset() {
  const today = todayStr();
  const res = await chrome.storage.local.get(['requestsByDate', 'currentWorkingDate']);
  const allData = res.requestsByDate || {};
  allData[today] = { entries: [], hours: 0, minutes: 0 };

  await chrome.storage.local.set({
    requestsByDate: allData,
    currentWorkingDate: today,
    autoResetLastFiredAt: Date.now()
  });

  console.log('[2TSL] Автосброс статистики выполнен на', today);
  try {
    chrome.notifications.create('autoreset_' + Date.now(), {
      type: 'basic',
      iconUrl: 'icons/icon.png',
      title: 'Учет заявок автоматически сброшен',
      message: `Начата новая смена (${today})`,
      priority: 1
    });
  } catch (e) {
    // notifications могут быть отключены — не критично
  }
}

// При изменении настроек в storage — перепланируем alarm без участия popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    const ns = changes.settings.newValue;
    if (ns && ('autoResetShift' in ns || 'autoResetShiftTime' in ns)) {
      setAutoResetShiftAlarm(ns.autoResetShift === true, ns.autoResetShiftTime || '03:00')
        .catch(err => console.warn('[2TSL] setAutoResetShiftAlarm error:', err));
    }
  }
});

console.log('2TSL Toolbox - Background Service Worker загружен');
