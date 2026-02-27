// content-ttm.js
// Для сайта ttm.rt.ru
// Добавляет кнопку для перехода на форму Ассистента и кнопку таймера
// Версия 1.4 - добавлена напоминалка

// ==================== ПЕРЕМЕННЫЕ ====================
let settings = { omnichatTemplates: true, ttmButton: true, accountingPanel: true, grafanaSSH: true, reminder: true };
let isButtonAdded = false;
let settingsLoaded = false;
let lastUrl = window.location.href; // Отслеживание URL для SPA навигации

// ==================== УТИЛИТЫ ====================
function safelyExecute(callback, errorMsg = 'Ошибка') {
  try { return callback(); } 
  catch (e) { console.error(errorMsg + ':', e); return null; }
}

// ==================== ПОЛУЧЕНИЕ ДАННЫХ ИЗ TTM ====================
function getIncidentNumber() {
  return safelyExecute(() => {
    // Ищем по data-qa-id содержащему ticket-id
    const ticketIdEl = document.querySelector('[data-qa-id*="ticket-id"]');
    if (ticketIdEl) {
      const text = ticketIdEl.textContent?.trim();
      if (text) {
        const match = text.match(/\d+/);
        if (match) return match[0];
      }
    }
    
    // Альтернативные селекторы
    const selectors = [
      '[data-qa-id*="incident"]',
      '[data-qa-id*="number"]',
      '.ticket-number',
      '[class*="incident-number"]',
      '[class*="ticket-id"]'
    ];
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.textContent) {
        const text = el.textContent.trim();
        const match = text.match(/\d+/);
        if (match) return match[0];
      }
    }
    
    const urlMatch = window.location.href.match(/id=(\d+)/);
    if (urlMatch) return urlMatch[1];
    
    const titleMatch = document.title.match(/#(\d+)/);
    if (titleMatch) return titleMatch[1];
    
    return '';
  }, 'Ошибка получения номера инцидента');
}

// Парсинг технологии из наименования услуги
// Формат: "ТНГ_РТ_Аист_100_890 переход (FTTx)" -> "FTTx"
function parseTechnologyFromServiceName(serviceName) {
  if (!serviceName) return '';
  
  const text = serviceName.toLowerCase();
  
  // Ищем технологию в скобках: (FTTx), (xDSL), (xPON), (DOCSIS)
  const bracketMatch = serviceName.match(/\((fttx|xdsl|xpon|docsis)\)/i);
  if (bracketMatch) {
    const tech = bracketMatch[1].toUpperCase();
    // Нормализуем название
    if (tech === 'FTTX') return 'FTTx';
    if (tech === 'XDSL') return 'xDSL';
    if (tech === 'XPON') return 'xPON';
    if (tech === 'DOCSIS') return 'DOCSIS';
    return tech;
  }
  
  // Если нет скобок, ищем в тексте
  if (text.includes('fttx') || text.includes('fttb')) return 'FTTx';
  if (text.includes('xdsl') || text.includes('adsl') || text.includes('vdsl')) return 'xDSL';
  if (text.includes('xpon') || text.includes('gpon') || text.includes('pon')) return 'xPON';
  if (text.includes('docsis')) return 'DOCSIS';
  
  return '';
}

function getServiceName() {
  return safelyExecute(() => {
    // Ищем поле "Наименование услуги" по data-qa-id
    const serviceNameEl = document.querySelector('[data-qa-id*="service-name"]');
    if (serviceNameEl) {
      // Ищем значение внутри элемента (обычно в <span> или <p>)
      const valueEl = serviceNameEl.querySelector('span, p') || serviceNameEl;
      const serviceName = valueEl?.textContent?.trim();
      if (serviceName) {
        return parseTechnologyFromServiceName(serviceName);
      }
    }
    
    // Альтернативный поиск по label
    const listItems = document.querySelectorAll('mat-list-item');
    for (const item of listItems) {
      const smallEl = item.querySelector('small.mat-line');
      if (smallEl && smallEl.textContent?.includes('Наименование услуги')) {
        const pEl = item.querySelector('p.mat-line');
        if (pEl?.textContent) {
          return parseTechnologyFromServiceName(pEl.textContent.trim());
        }
      }
    }
    
    return '';
  }, 'Ошибка получения наименования услуги');
}

function getClientRF() {
  return safelyExecute(() => {
    // Ищем поле "РФ подключения" по data-qa-id
    const rfEl = document.querySelector('[data-qa-id*="selected-rf"]');
    if (rfEl) {
      // Ищем значение внутри элемента
      const valueEl = rfEl.querySelector('p.mat-line') || rfEl;
      const rfText = valueEl?.textContent?.trim();
      if (rfText) {
        // Очищаем от лишних пробелов
        return rfText.replace(/\s+/g, ' ').trim();
      }
    }
    
    // Альтернативный поиск по label в списке
    const listItems = document.querySelectorAll('mat-list-item');
    for (const item of listItems) {
      const smallEl = item.querySelector('small.mat-line');
      if (smallEl && smallEl.textContent?.includes('РФ подключения')) {
        const pEl = item.querySelector('p.mat-line');
        if (pEl?.textContent) {
          return pEl.textContent.trim().replace(/\s+/g, ' ');
        }
      }
    }
    
    return '';
  }, 'Ошибка получения РФ клиента');
}

// ==================== КНОПКА ====================
function createAssistantButton() {
  const button = document.createElement('button');
  button.setAttribute('mat-icon-button', '');
  button.className = 'mat-focus-indicator mat-tooltip-trigger mat-icon-button mat-button-base mat-primary';
  button.setAttribute('data-qa-id', 'assistant-form-btn');
  button.style.cssText = 'margin-left: 8px;';
  button.title = 'Открыть форму Ассистента';
  
  button.innerHTML = `
    <span class="mat-button-wrapper">
      <mat-icon role="img" class="mat-icon notranslate material-icons mat-icon-no-color" aria-hidden="true" data-mat-icon-type="font">support_agent</mat-icon>
    </span>
    <span matripple="" class="mat-ripple mat-button-ripple mat-button-ripple-round"></span>
    <span class="mat-button-focus-overlay"></span>
  `;
  
  button.addEventListener('click', () => {
    openAssistantForm();
  });
  
  return button;
}

function addButtonToToolbar() {
  return safelyExecute(() => {
    const toolbar = document.querySelector('.tasks-toolbar');
    if (!toolbar) {
      return false;
    }
    
    // Добавляем кнопку Ассистента
    if (!document.querySelector('[data-qa-id="assistant-form-btn"]')) {
      const assistantButton = createAssistantButton();
      toolbar.appendChild(assistantButton);
      console.log('Кнопка Ассистента добавлена');
    }
    
    // Добавляем кнопку Таймера (если включена настройка)
    if (settings.reminder && !document.querySelector('[data-qa-id="timer-btn"]')) {
      const timerButton = createTimerButton();
      toolbar.appendChild(timerButton);
      console.log('Кнопка Таймера добавлена');
    }
    
    return true;
  }, 'Ошибка добавления кнопки');
}

// ==================== ОТКРЫТИЕ ФОРМЫ ====================
function openAssistantForm() {
  safelyExecute(() => {
    const incidentNumber = getIncidentNumber();
    const serviceName = getServiceName();
    const clientRF = getClientRF();
    
    console.log('Данные из TTM:', { incidentNumber, serviceName, clientRF });
    
    const formData = {
      incidentNumber,
      serviceName,
      clientRF,
      timestamp: Date.now()
    };
    
    chrome.storage.local.set({ ttmFormData: formData }, () => {
      console.log('Данные TTM сохранены:', formData);
      
      chrome.runtime.sendMessage({
        action: 'openForm',
        url: 'https://bzbti.rt.ru/vip/ispolzovanie-assistenta/'
      });
    });
  }, 'Ошибка при открытии формы');
}

// ==================== ТАЙМЕР / НАПОМИНАЛКА ====================
function createTimerButton() {
  const button = document.createElement('button');
  button.setAttribute('mat-icon-button', '');
  button.className = 'mat-focus-indicator mat-tooltip-trigger mat-icon-button mat-button-base mat-primary';
  button.setAttribute('data-qa-id', 'timer-btn');
  button.style.cssText = 'margin-left: 8px;';
  button.title = 'Поставить напоминание';
  
  button.innerHTML = `
    <span class="mat-button-wrapper">
      <mat-icon role="img" class="mat-icon notranslate material-icons mat-icon-no-color" aria-hidden="true" data-mat-icon-type="font">timer</mat-icon>
    </span>
    <span matripple="" class="mat-ripple mat-button-ripple mat-button-ripple-round"></span>
    <span class="mat-button-focus-overlay"></span>
  `;
  
  button.addEventListener('click', () => {
    openTimerModal();
  });
  
  return button;
}

function openTimerModal() {
  // Удаляем существующее модальное окно если есть
  const existingModal = document.getElementById('tsl-timer-modal');
  if (existingModal) {
    existingModal.remove();
    return;
  }
  
  const incidentNumber = getIncidentNumber();
  const ticketUrl = window.location.href;
  
  const modal = document.createElement('div');
  modal.id = 'tsl-timer-modal';
  modal.innerHTML = `
    <div class="tsl-modal-overlay">
      <div class="tsl-modal-content">
        <div class="tsl-modal-header">
          <h3>⏰ Напоминание для заявки #${incidentNumber}</h3>
          <button class="tsl-modal-close">&times;</button>
        </div>
        <div class="tsl-modal-body">
          <div class="tsl-form-group">
            <label>Тип напоминания</label>
            <div class="tsl-radio-group">
              <label class="tsl-radio">
                <input type="radio" name="timerType" value="minutes" checked>
                <span>Через N минут</span>
              </label>
              <label class="tsl-radio">
                <input type="radio" name="timerType" value="time">
                <span>В указанное время</span>
              </label>
            </div>
          </div>
          
          <div class="tsl-form-group tsl-minutes-group">
            <label for="timerMinutes">Минуты</label>
            <input type="number" id="timerMinutes" placeholder="Например: 30" min="1" max="1440">
          </div>
          
          <div class="tsl-form-group tsl-time-group" style="display: none;">
            <label for="timerTime">Время (ЧЧ:ММ)</label>
            <input type="time" id="timerTime">
          </div>
          
          <div class="tsl-form-group">
            <label for="timerDescription">Описание (необязательно)</label>
            <textarea id="timerDescription" placeholder="Например: Перезвонить клиенту" rows="2"></textarea>
          </div>
        </div>
        <div class="tsl-modal-footer">
          <button class="tsl-btn tsl-btn-secondary" id="tslCancelTimer">Отмена</button>
          <button class="tsl-btn tsl-btn-primary" id="tslSaveTimer">Сохранить</button>
        </div>
      </div>
    </div>
  `;
  
  // Стили для модального окна
  const style = document.createElement('style');
  style.textContent = `
    #tsl-timer-modal .tsl-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 999999;
    }
    
    #tsl-timer-modal .tsl-modal-content {
      background: white;
      border-radius: 8px;
      width: 360px;
      max-width: 90vw;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }
    
    #tsl-timer-modal .tsl-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid #e0e0e0;
    }
    
    #tsl-timer-modal .tsl-modal-header h3 {
      margin: 0;
      font-size: 16px;
      color: #333;
    }
    
    #tsl-timer-modal .tsl-modal-close {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #666;
      padding: 0;
      line-height: 1;
    }
    
    #tsl-timer-modal .tsl-modal-body {
      padding: 16px;
    }
    
    #tsl-timer-modal .tsl-form-group {
      margin-bottom: 16px;
    }
    
    #tsl-timer-modal .tsl-form-group label {
      display: block;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 500;
      color: #333;
    }
    
    #tsl-timer-modal .tsl-form-group input[type="number"],
    #tsl-timer-modal .tsl-form-group input[type="time"],
    #tsl-timer-modal .tsl-form-group textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;
      box-sizing: border-box;
    }
    
    #tsl-timer-modal .tsl-form-group textarea {
      resize: vertical;
    }
    
    #tsl-timer-modal .tsl-radio-group {
      display: flex;
      gap: 16px;
    }
    
    #tsl-timer-modal .tsl-radio {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    
    #tsl-timer-modal .tsl-radio input[type="radio"] {
      margin: 0;
    }
    
    #tsl-timer-modal .tsl-modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid #e0e0e0;
    }
    
    #tsl-timer-modal .tsl-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    #tsl-timer-modal .tsl-btn-primary {
      background: #007bff;
      color: white;
    }
    
    #tsl-timer-modal .tsl-btn-primary:hover {
      background: #0056b3;
    }
    
    #tsl-timer-modal .tsl-btn-secondary {
      background: #6c757d;
      color: white;
    }
    
    #tsl-timer-modal .tsl-btn-secondary:hover {
      background: #5a6268;
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(modal);
  
  // Обработчики событий
  const closeBtn = modal.querySelector('.tsl-modal-close');
  const cancelBtn = modal.querySelector('#tslCancelTimer');
  const saveBtn = modal.querySelector('#tslSaveTimer');
  const radioButtons = modal.querySelectorAll('input[name="timerType"]');
  const minutesGroup = modal.querySelector('.tsl-minutes-group');
  const timeGroup = modal.querySelector('.tsl-time-group');
  
  closeBtn.addEventListener('click', () => modal.remove());
  cancelBtn.addEventListener('click', () => modal.remove());
  
  // Переключение типа напоминания
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
    const timerType = modal.querySelector('input[name="timerType"]:checked').value;
    const minutes = modal.querySelector('#timerMinutes').value;
    const specificTime = modal.querySelector('#timerTime').value;
    const description = modal.querySelector('#timerDescription').value.trim();
    
    if (timerType === 'minutes' && !minutes) {
      alert('Укажите количество минут');
      return;
    }
    
    if (timerType === 'time' && !specificTime) {
      alert('Укажите время напоминания');
      return;
    }
    
    const reminderData = {
      ticketNumber: incidentNumber,
      ticketUrl: ticketUrl,
      description: description,
      minutes: timerType === 'minutes' ? parseInt(minutes) : null,
      specificTime: timerType === 'time' ? specificTime : null
    };
    
    chrome.runtime.sendMessage({
      action: 'addReminder',
      data: reminderData
    }, (response) => {
      if (response && response.success) {
        modal.remove();
        // Показываем краткое уведомление об успехе
        showSuccessToast('Напоминание сохранено!');
      } else {
        alert('Ошибка при сохранении напоминания');
      }
    });
  });
  
  // Закрытие по клику на overlay
  modal.querySelector('.tsl-modal-overlay').addEventListener('click', (e) => {
    if (e.target.classList.contains('tsl-modal-overlay')) {
      modal.remove();
    }
  });
}

function showSuccessToast(message) {
  const toast = document.createElement('div');
  toast.className = 'tsl-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #28a745;
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    z-index: 999999;
    font-size: 14px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ==================== ДОБАВЛЕНИЕ КНОПКИ ====================
function tryAddButton() {
  if (!settingsLoaded) return;
  
  // Проверяем, существует ли кнопка в DOM прямо сейчас
  const existingAssistantBtn = document.querySelector('[data-qa-id="assistant-form-btn"]');
  const existingTimerBtn = document.querySelector('[data-qa-id="timer-btn"]');
  
  // Сбрасываем флаг если кнопок нет
  if (!existingAssistantBtn && !existingTimerBtn) {
    isButtonAdded = false;
  }
  
  if (addButtonToToolbar()) {
    isButtonAdded = true;
  }
}

// ==================== ОТСЛЕЖИВАНИЕ SPA НАВИГАЦИИ ====================
function checkUrlChange() {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    console.log('URL изменился:', lastUrl, '->', currentUrl);
    lastUrl = currentUrl;
    // Сбрасываем флаг при смене URL
    isButtonAdded = false;
    // Пробуем добавить кнопку на новой странице
    setTimeout(tryAddButton, 500);
    setTimeout(tryAddButton, 1500);
    setTimeout(tryAddButton, 3000);
  }
}

// Периодическая проверка изменения URL (для SPA)
setInterval(checkUrlChange, 500);

// Также слушаем события history API
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
  originalPushState.apply(history, args);
  checkUrlChange();
};

history.replaceState = function(...args) {
  originalReplaceState.apply(history, args);
  checkUrlChange();
};

window.addEventListener('popstate', checkUrlChange);
window.addEventListener('hashchange', checkUrlChange);

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function init() {
  console.log('TTM Extension v1.4');
  
  // Загружаем настройки и сразу пытаемся добавить кнопки
  chrome.storage.local.get(['settings'], (result) => {
    settings = result.settings || { omnichatTemplates: true, ttmButton: true, accountingPanel: true, grafanaSSH: true, reminder: true };
    settingsLoaded = true;
    
    // Пробуем сразу
    tryAddButton();
    // И через задержку
    setTimeout(tryAddButton, 1000);
    setTimeout(tryAddButton, 3000);
  });
}

// Слушатель изменений настроек
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    const oldSettings = settings;
    settings = changes.settings.newValue;
    
    // Удаляем кнопку таймера если настройка отключена
    if (oldSettings.reminder && !settings.reminder) {
      const timerBtn = document.querySelector('[data-qa-id="timer-btn"]');
      if (timerBtn) timerBtn.remove();
    }
    
    // Добавляем кнопку таймера если настройка включена
    if (!oldSettings.reminder && settings.reminder) {
      tryAddButton();
    }
  }
});

// Observer для динамического добавления
const observer = new MutationObserver(() => {
  // Проверяем что настройки загружены
  if (settingsLoaded && !isButtonAdded) {
    if (document.querySelector('.tasks-toolbar')) {
      tryAddButton();
    }
  }
});

// ==================== ЗАПУСК ====================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Запускаем observer сразу, но он будет ждать settingsLoaded
observer.observe(document.body, { childList: true, subtree: true });
