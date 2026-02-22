// content-ttm.js
// Для сайта ttm.rt.ru
// Добавляет кнопку для перехода на форму Ассистента
// Версия 1.3 - исправлено получение технологии и РФ подключения

// ==================== ПЕРЕМЕННЫЕ ====================
let settings = { omnichatTemplates: true, ttmButton: true, accountingPanel: true };
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
    
    if (document.querySelector('[data-qa-id="assistant-form-btn"]')) {
      return true;
    }
    
    const button = createAssistantButton();
    toolbar.appendChild(button);
    
    console.log('Кнопка Ассистента добавлена');
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

// ==================== ДОБАВЛЕНИЕ КНОПКИ ====================
function tryAddButton() {
  if (!settings.ttmButton || !settingsLoaded) return;
  
  // Проверяем, существует ли кнопка в DOM прямо сейчас
  const existingButton = document.querySelector('[data-qa-id="assistant-form-btn"]');
  if (existingButton) {
    isButtonAdded = true;
    return;
  }
  
  // Сбрасываем флаг, так как кнопки нет в DOM
  isButtonAdded = false;
  
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
  console.log('TTM Extension v1.3');
  
  // Загружаем настройки и сразу пытаемся добавить кнопку
  chrome.storage.local.get(['settings'], (result) => {
    settings = result.settings || { omnichatTemplates: true, ttmButton: true, accountingPanel: true };
    settingsLoaded = true;
    
    if (settings.ttmButton) {
      // Пробуем сразу
      tryAddButton();
      // И через задержку
      setTimeout(tryAddButton, 1000);
      setTimeout(tryAddButton, 3000);
    }
  });
}

// Слушатель изменений настроек
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    settings = changes.settings.newValue;
    // Если настройка включена и кнопка ещё не добавлена
    if (settings.ttmButton && !isButtonAdded) {
      tryAddButton();
    }
  }
});

// Observer для динамического добавления
const observer = new MutationObserver(() => {
  // Проверяем что настройки загружены
  if (settingsLoaded && !isButtonAdded && settings.ttmButton) {
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
