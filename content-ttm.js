// content-ttm.js
// Для сайта ttm.rt.ru
// Добавляет кнопку для перехода на форму Ассистента
// Версия 1.2 - исправлена проблема с SPA навигацией

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

function getServiceName() {
  return safelyExecute(() => {
    const selectors = [
      '[data-qa-id*="service"]',
      '[data-qa-id*="product"]',
      '[class*="service-name"]',
      '[class*="product-name"]'
    ];
    
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el?.textContent) {
          const text = el.textContent.toLowerCase();
          if (text.includes('xdsl') || text.includes('adsl') || text.includes('vdsl')) return 'xDSL';
          if (text.includes('fttx') || text.includes('fttb')) return 'FTTx';
          if (text.includes('xpon') || text.includes('gpon') || text.includes('pon')) return 'xPON';
          if (text.includes('docsis')) return 'DOCSIS';
          return el.textContent.trim();
        }
      } catch (e) {}
    }
    
    const labels = document.querySelectorAll('label, .label, .field-label');
    for (const label of labels) {
      const labelText = label.textContent?.toLowerCase() || '';
      if (labelText.includes('услуг') || labelText.includes('сервис') || labelText.includes('продукт')) {
        const valueEl = label.nextElementSibling || label.parentElement?.querySelector('.value, .field-value, [class*="value"]');
        if (valueEl?.textContent) {
          const text = valueEl.textContent.toLowerCase();
          if (text.includes('xdsl') || text.includes('adsl')) return 'xDSL';
          if (text.includes('fttx') || text.includes('fttb')) return 'FTTx';
          if (text.includes('pon')) return 'xPON';
          if (text.includes('docsis')) return 'DOCSIS';
        }
      }
    }
    
    return '';
  }, 'Ошибка получения наименования услуги');
}

function getClientRF() {
  return safelyExecute(() => {
    const selectors = [
      '[data-qa-id*="address"]',
      '[data-qa-id*="client"]',
      '[class*="address"]',
      '[class*="location"]'
    ];
    
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el?.textContent) {
        const text = el.textContent.trim();
        const parts = text.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          const region = parts[1];
          if (region && region.length > 0) {
            return region;
          }
        }
        
        const rfMatch = text.match(/([А-Я][а-я]+(?:ский|ая|ое|ие)\s*(?:филиал)?)/i);
        if (rfMatch) return rfMatch[1];
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
  console.log('TTM Extension v1.2 - SPA Navigation Fix');
  
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
