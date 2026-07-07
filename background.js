// background.js
// Service worker для Manifest V3

importScripts('analytics.js', 'cloud-sync.js');

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

initAnalyticsAlarms();

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[2TSL] Расширение установлено:', details.reason);
  await handleInstallAnalytics(details);
  await flushAnalytics(true);
});

chrome.runtime.onStartup.addListener(async () => {
  await restoreReminders();
  await flushAnalytics();
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
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
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

  return true;
});

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

console.log('2TSL Toolbox - Background Service Worker загружен');