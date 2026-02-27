// background.js
// Service worker для Manifest V3

// Обработка сообщений от content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openForm') {
    chrome.tabs.create({ url: request.url }, (tab) => {
      console.log('Открыта форма в новой вкладке:', tab.id);
    });
    sendResponse({ success: true });
  }
  
  if (request.action === 'addReminder') {
    addReminder(request.data).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Для асинхронного ответа
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
  
  return true;
});

// ==================== НАПОМИНАЛКА ====================

// Добавление напоминания
async function addReminder(data) {
  const { ticketNumber, ticketUrl, minutes, specificTime, description } = data;
  
  let remindAt;
  
  if (minutes) {
    // Таймер в минутах
    remindAt = Date.now() + (minutes * 60 * 1000);
  } else if (specificTime) {
    // Конкретное время (формат HH:MM)
    const [hours, minutesVal] = specificTime.split(':').map(Number);
    const now = new Date();
    const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutesVal);
    
    // Если время уже прошло сегодня, ставим на завтра
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
  
  // Получаем текущие напоминания
  const result = await chrome.storage.local.get(['reminders']);
  const reminders = result.reminders || [];
  
  // Добавляем новое
  reminders.push(reminder);
  
  // Сохраняем
  await chrome.storage.local.set({ reminders });
  
  // Создаём alarm
  const delayMinutes = Math.max(1, (remindAt - Date.now()) / 60000);
  chrome.alarms.create(reminder.id, { delayInMinutes: delayMinutes });
  
  console.log('[2TSL] Напоминание добавлено:', reminder);
  
  return reminder;
}

// Удаление напоминания
async function removeReminder(reminderId) {
  const result = await chrome.storage.local.get(['reminders']);
  const reminders = result.reminders || [];
  
  const filtered = reminders.filter(r => r.id !== reminderId);
  await chrome.storage.local.set({ reminders: filtered });
  
  // Удаляем alarm
  chrome.alarms.clear(reminderId);
  
  console.log('[2TSL] Напоминание удалено:', reminderId);
}

// Обновление напоминания
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
    
    // Обновляем alarm
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

// Получение всех напоминаний
async function getReminders() {
  const result = await chrome.storage.local.get(['reminders']);
  return result.reminders || [];
}

// Обработка alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('[2TSL] Alarm сработал:', alarm.name);
  
  const result = await chrome.storage.local.get(['reminders']);
  const reminders = result.reminders || [];
  
  const reminder = reminders.find(r => r.id === alarm.name);
  
  if (reminder && !reminder.notified) {
    // Показываем уведомление
    chrome.notifications.create(reminder.id, {
      type: 'basic',
      iconUrl: 'icons/icon.png',
      title: `⏰ Напоминание: Заявка #${reminder.ticketNumber}`,
      message: reminder.description || 'Пора заняться этой заявкой!',
      priority: 2,
      requireInteraction: true
    });
    
    // Отмечаем как уведомлённое и записываем время уведомления
    reminder.notified = true;
    reminder.notifiedAt = Date.now();
    await chrome.storage.local.set({ reminders });
    
    console.log('[2TSL] Уведомление показано:', reminder);
  }
});

// Периодическая очистка старых уведомлений (каждые 5 минут)
chrome.alarms.create('cleanupReminders', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanupReminders') {
    await cleanupOldReminders();
  }
});

// Удаление напоминаний, которые были выполнены более 30 минут назад
async function cleanupOldReminders() {
  const result = await chrome.storage.local.get(['reminders']);
  const reminders = result.reminders || [];
  const now = Date.now();
  const thirtyMinutesAgo = now - (30 * 60 * 1000);
  
  const initialCount = reminders.length;
  
  // Фильтруем напоминания, оставляя только:
  // - те, что ещё не были уведомлены
  // - те, что были уведомлены менее 30 минут назад
  const filtered = reminders.filter(r => {
    if (!r.notified) return true; // Ещё не выполнено - оставляем
    if (r.notifiedAt && r.notifiedAt > thirtyMinutesAgo) return true; // Выполнено менее 30 мин назад - оставляем
    return false; // Выполнено более 30 мин назад - удаляем
  });
  
  if (filtered.length !== initialCount) {
    await chrome.storage.local.set({ reminders: filtered });
    console.log(`[2TSL] Очистка: удалено ${initialCount - filtered.length} старых напоминаний`);
  }
}

// Клик по уведомлению - открываем заявку
chrome.notifications.onClicked.addListener(async (notificationId) => {
  const result = await chrome.storage.local.get(['reminders']);
  const reminders = result.reminders || [];
  
  const reminder = reminders.find(r => r.id === notificationId);
  
  if (reminder && reminder.ticketUrl) {
    chrome.tabs.create({ url: reminder.ticketUrl });
    chrome.notifications.clear(notificationId);
  }
});

// При запуске - восстанавливаем alarms для активных напоминаний
chrome.runtime.onStartup.addListener(async () => {
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
      // Время уже прошло - показываем уведомление сразу
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
});

console.log('2TSL Toolbox - Background Service Worker загружен');
