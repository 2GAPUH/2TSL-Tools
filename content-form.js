// content-form.js
// Для сайта bzbti.rt.ru/vip/ispolzovanie-assistenta/
// Автозаполнение формы
// Версия 1.3 - заполнение только во вкладке, открытой кнопкой TTM → Форма

// ==================== ПЕРЕМЕННЫЕ ====================
let settings = { omnichatTemplates: true, ttmButton: true };
let savedFormData = { region: '', fio: '' };
let ttmFormData = null;
let isFormFilled = false;
let myTabId = null;
const FORM_DATA_TTL_MS = 30000;
const FORM_DATA_WAIT_MS = 8000;

// ==================== АНАЛИТИКА ====================
function trackEvent(event) {
  try {
    chrome.runtime.sendMessage({ action: 'trackEvent', event });
  } catch (e) { /* service worker недоступен */ }
}

// ==================== УТИЛИТЫ ====================
function safelyExecute(callback, errorMsg = 'Ошибка') {
  try { return callback(); } 
  catch (e) { console.error(errorMsg + ':', e); return null; }
}

function getMyTabId() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ action: 'getTabId' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response?.tabId ?? null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

function isFormDataFresh(data) {
  if (!data) return false;
  if (!data.timestamp) return true;
  return Date.now() - data.timestamp <= FORM_DATA_TTL_MS;
}

/** Данные предназначены именно этой вкладке формы (не чужой уже открытой). */
function isFormDataForThisTab(data, tabId) {
  if (!data || !isFormDataFresh(data)) return false;
  if (data.targetTabId == null) {
    // Старый формат без targetTabId — принимаем один раз (legacy)
    return true;
  }
  if (tabId == null) return false;
  return Number(data.targetTabId) === Number(tabId);
}

async function waitForTargetFormData(tabId) {
  const started = Date.now();
  while (Date.now() - started < FORM_DATA_WAIT_MS) {
    const result = await storageGet(['ttmFormData']);
    const data = result.ttmFormData || null;

    if (isFormDataForThisTab(data, tabId)) {
      return data;
    }

    // Явно чужая вкладка — не ждём и не забираем
    if (data && data.targetTabId != null && tabId != null
        && Number(data.targetTabId) !== Number(tabId)) {
      return null;
    }

    // Данных ещё нет: background пишет сразу после tabs.create — подождём кратко
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

// ==================== ФОРМАТИРОВАНИЕ ДАТЫ ====================
function formatDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

// ==================== ПОЛЯ ФОРМЫ ====================
const FORM_FIELDS = {
  date: 'wpforms-2176-field_2',           // Дата использования Ассистента
  region: 'wpforms-2176-field_3',          // Регион (radio)
  fio: 'wpforms-2176-field_4',             // ФИО сотрудника
  incidentNumber: 'wpforms-2176-field_5',  // № заявки
  technology: 'wpforms-2176-field_11',     // Технология подключения (radio)
  clientRF: 'wpforms-2176-field_8',        // РФ Клиента
  os: 'wpforms-2176-field_12',             // ОС (select)
  proposal: 'wpforms-2176-field_6',        // Предложение (radio)
  connection: 'wpforms-2176-field_9',      // Удачное подключение (radio)
  classifier: 'wpforms-2176-field_10',     // Классификатор (select)
  note: 'wpforms-2176-field_7'             // Примечание (textarea)
};

// ==================== ЗАПОЛНЕНИЕ ПОЛЕЙ ====================
function fillTextField(fieldId, value) {
  return safelyExecute(() => {
    const field = document.getElementById(fieldId);
    if (field && value) {
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`Заполнено поле ${fieldId}: ${value}`);
      return true;
    }
    return false;
  }, `Ошибка заполнения поля ${fieldId}`);
}

function getWpformsFieldNumber(fieldId) {
  const match = fieldId.match(/field_(\d+)$/);
  return match ? match[1] : null;
}

function getRadioInputs(fieldId) {
  const fieldNum = getWpformsFieldNumber(fieldId);
  if (fieldNum) {
    const byName = document.querySelectorAll(
      `input[type="radio"][name="wpforms[fields][${fieldNum}]"]`
    );
    if (byName.length) return Array.from(byName);
  }

  const container = document.getElementById(`${fieldId}-container`) || document.getElementById(fieldId);
  if (container) {
    return Array.from(container.querySelectorAll('input[type="radio"]'));
  }

  return [];
}

function selectRadioElement(radio) {
  if (!radio) return false;

  const label = radio.id ? document.querySelector(`label[for="${radio.id}"]`) : null;
  if (label) {
    label.click();
    return radio.checked;
  }

  radio.click();
  return radio.checked;
}

function fillRadioField(fieldId, value) {
  return safelyExecute(() => {
    if (!value) return false;

    const targetValue = String(value).trim();
    const radios = getRadioInputs(fieldId);

    for (const radio of radios) {
      if (radio.value === targetValue) {
        if (selectRadioElement(radio)) {
          console.log(`Выбран radio ${fieldId}: ${targetValue}`);
          return true;
        }
      }
    }

    console.log(`Radio ${fieldId} со значением "${targetValue}" не найден`);
    return false;
  }, `Ошибка заполнения radio ${fieldId}`);
}

function fillSelectField(fieldId, value) {
  return safelyExecute(() => {
    const select = document.getElementById(fieldId);
    if (select && value) {
      // Для choices.js нужно найти option и выбрать его
      const options = select.querySelectorAll('option');
      for (const opt of options) {
        if (opt.value === value) {
          select.value = value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`Выбран select ${fieldId}: ${value}`);
          return true;
        }
      }
    }
    return false;
  }, `Ошибка заполнения select ${fieldId}`);
}

function fillTextarea(fieldId, value) {
  return safelyExecute(() => {
    const textarea = document.getElementById(fieldId);
    if (textarea && value) {
      textarea.value = value;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(`Заполнен textarea ${fieldId}`);
      return true;
    }
    return false;
  }, `Ошибка заполнения textarea ${fieldId}`);
}

// ==================== СОХРАНЕНИЕ ДАННЫХ ====================
function saveFormData() {
  safelyExecute(() => {
    const newRegion = '';
    const newFio = '';
    
    // Сохраняем регион
    const regionRadios = getRadioInputs(FORM_FIELDS.region);
    for (const radio of regionRadios) {
      if (radio.checked) {
        savedFormData.region = radio.value;
        console.log('Сохранён регион:', radio.value);
        break;
      }
    }
    
    // Сохраняем ФИО
    const fioField = document.getElementById(FORM_FIELDS.fio);
    if (fioField?.value) {
      savedFormData.fio = fioField.value;
      console.log('Сохранено ФИО:', fioField.value);
    }
    
    // Записываем в хранилище
    chrome.storage.local.set({ savedFormData }, () => {
      console.log('Данные формы сохранены в storage:', savedFormData);
    });
  }, 'Ошибка сохранения данных формы');
}

// Сохранение региона при изменении
function setupRegionChangeListener() {
  const regionRadios = getRadioInputs(FORM_FIELDS.region);
  regionRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        savedFormData.region = radio.value;
        chrome.storage.local.set({ savedFormData }, () => {
          console.log('Регион изменён и сохранён:', radio.value);
        });
      }
    });
  });
}

// Сохранение ФИО при потере фокуса
function setupFioChangeListener() {
  const fioField = document.getElementById(FORM_FIELDS.fio);
  if (fioField) {
    fioField.addEventListener('blur', () => {
      if (fioField.value) {
        savedFormData.fio = fioField.value;
        chrome.storage.local.set({ savedFormData }, () => {
          console.log('ФИО сохранено:', fioField.value);
        });
      }
    });
  }
}

// ==================== ОСНОВНАЯ ФУНКЦИЯ ЗАПОЛНЕНИЯ ====================
function fillForm() {
  if (isFormFilled) return;
  
  safelyExecute(() => {
    console.log('Заполнение формы...');
    console.log('savedFormData:', savedFormData);
    console.log('ttmFormData:', ttmFormData);
    console.log('myTabId:', myTabId);
    
    // 1. Дата - текущая дата
    fillTextField(FORM_FIELDS.date, formatDate());
    
    // 2. Регион - из сохраненных данных
    if (savedFormData.region) {
      fillRadioField(FORM_FIELDS.region, savedFormData.region);
    }
    
    // 3. ФИО - из сохраненных данных
    if (savedFormData.fio) {
      fillTextField(FORM_FIELDS.fio, savedFormData.fio);
    }
    
    // 4. Данные из TTM — только если предназначены этой вкладке
    if (ttmFormData && isFormDataForThisTab(ttmFormData, myTabId)) {
      if (ttmFormData.incidentNumber) {
        fillTextField(FORM_FIELDS.incidentNumber, ttmFormData.incidentNumber);
      }
      
      if (ttmFormData.serviceName) {
        console.log('Технология из TTM:', ttmFormData.serviceName);
        fillRadioField(FORM_FIELDS.technology, ttmFormData.serviceName);
      }
      
      if (ttmFormData.clientRF) {
        console.log('РФ клиента из TTM:', ttmFormData.clientRF);
        fillTextField(FORM_FIELDS.clientRF, ttmFormData.clientRF);
      }

      // Снимаем данные только целевая вкладка, чтобы не мешать другим
      chrome.storage.local.remove('ttmFormData');
      trackEvent('form_autofill');
    } else if (ttmFormData) {
      console.log('[Form] ttmFormData для другой вкладки — поля заявки не заполняем');
      ttmFormData = null;
    }
    
    isFormFilled = true;
    console.log('Форма заполнена');
    
    setupRegionChangeListener();
    setupFioChangeListener();
    
    const form = document.getElementById('wpforms-form-2176');
    if (form) {
      form.addEventListener('submit', () => {
        saveFormData();
      });
    }
  }, 'Ошибка заполнения формы');
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
async function init() {
  console.log('Form Autofill v1.3');

  const result = await storageGet(['settings', 'savedFormData']);
  settings = result.settings || { omnichatTemplates: true, ttmButton: true };
  savedFormData = result.savedFormData || { region: '', fio: '' };
  myTabId = await getMyTabId();

  // Ждём данные, привязанные к этой вкладке (background пишет после tabs.create)
  ttmFormData = await waitForTargetFormData(myTabId);

  console.log('Загружены данные:', { savedFormData, ttmFormData, myTabId });

  setTimeout(tryFillForm, 500);
}

function isFormReady() {
  const form = document.getElementById('wpforms-form-2176');
  const dateField = document.getElementById(FORM_FIELDS.date);
  const techRadios = getRadioInputs(FORM_FIELDS.technology);
  return !!(form && dateField && techRadios.length > 0);
}

function tryFillForm() {
  if (isFormFilled) return;

  if (isFormReady()) {
    fillForm();
  } else {
    setTimeout(tryFillForm, 500);
  }
}

// Observer для динамической загрузки
const observer = new MutationObserver(() => {
  if (!isFormFilled) {
    const form = document.getElementById('wpforms-form-2176');
    if (form) {
      tryFillForm();
    }
  }
});

// ==================== ЗАПУСК ====================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { init(); });
} else {
  init();
}

observer.observe(document.body, { childList: true, subtree: true });
