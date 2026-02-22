// content-form.js
// Для сайта bzbti.rt.ru/vip/ispolzovanie-assistenta/
// Автозаполнение формы
// Версия 1.1 - исправлено сохранение региона и РФ клиента

// ==================== ПЕРЕМЕННЫЕ ====================
let settings = { omnichatTemplates: true, ttmButton: true };
let savedFormData = { region: '', fio: '' };
let ttmFormData = null;
let isFormFilled = false;

// ==================== УТИЛИТЫ ====================
function safelyExecute(callback, errorMsg = 'Ошибка') {
  try { return callback(); } 
  catch (e) { console.error(errorMsg + ':', e); return null; }
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

// Регионы
const REGIONS = ['Юг', 'СЗ', 'Урал', 'Волга', 'Сибирь', 'ДВ', 'МиМО', 'Центр (16 филиалов)'];

// Технологии
const TECHNOLOGIES = ['xDSL', 'FTTx', 'xPON', 'DOCSIS'];

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

function fillRadioField(fieldId, value) {
  return safelyExecute(() => {
    if (!value) return false;
    
    // Ищем radio с нужным значением
    const radios = document.querySelectorAll(`input[name*="${fieldId}"]`);
    for (const radio of radios) {
      if (radio.value === value) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`Выбран radio ${fieldId}: ${value}`);
        return true;
      }
    }
    
    // Альтернативный поиск по ID
    const radio = document.getElementById(`${fieldId}_${getValueIndex(fieldId, value)}`);
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    
    console.log(`Radio ${fieldId} со значением "${value}" не найден`);
    return false;
  }, `Ошибка заполнения radio ${fieldId}`);
}

function getValueIndex(fieldId, value) {
  // Определяем индекс для radio кнопок
  if (fieldId === FORM_FIELDS.region) {
    const idx = REGIONS.indexOf(value);
    return idx >= 0 ? idx + 1 : 1;
  }
  if (fieldId === FORM_FIELDS.technology) {
    const idx = TECHNOLOGIES.indexOf(value);
    return idx >= 0 ? idx + 1 : 1;
  }
  return 1;
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
    const regionRadios = document.querySelectorAll(`input[name*="${FORM_FIELDS.region}"]`);
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
  const regionRadios = document.querySelectorAll(`input[name*="${FORM_FIELDS.region}"]`);
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
    
    // 4. Данные из TTM (если есть)
    if (ttmFormData) {
      // Номер заявки
      if (ttmFormData.incidentNumber) {
        fillTextField(FORM_FIELDS.incidentNumber, ttmFormData.incidentNumber);
      }
      
      // Технология подключения (парсится из наименования услуги)
      if (ttmFormData.serviceName) {
        console.log('Технология из TTM:', ttmFormData.serviceName);
        fillRadioField(FORM_FIELDS.technology, ttmFormData.serviceName);
      }
      
      // РФ Клиента (из поля "РФ подключения" в ТТМ)
      if (ttmFormData.clientRF) {
        console.log('РФ клиента из TTM:', ttmFormData.clientRF);
        fillTextField(FORM_FIELDS.clientRF, ttmFormData.clientRF);
      }
    }
    
    isFormFilled = true;
    console.log('Форма заполнена');
    
    // Устанавливаем слушатели изменений для сохранения региона и ФИО
    setupRegionChangeListener();
    setupFioChangeListener();
    
    // Добавляем обработчик на отправку формы для сохранения данных
    const form = document.getElementById('wpforms-form-2176');
    if (form) {
      form.addEventListener('submit', () => {
        saveFormData();
      });
    }
    
    // Очищаем временные данные TTM
    chrome.storage.local.remove('ttmFormData');
  }, 'Ошибка заполнения формы');
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function init() {
  console.log('Form Autofill v1.1');
  
  // Загружаем настройки и сохраненные данные
  chrome.storage.local.get(['settings', 'savedFormData', 'ttmFormData'], (result) => {
    settings = result.settings || { omnichatTemplates: true, ttmButton: true };
    savedFormData = result.savedFormData || { region: '', fio: '' };
    ttmFormData = result.ttmFormData || null;
    
    console.log('Загружены данные:', { savedFormData, ttmFormData });
    
    // Ждем загрузки формы
    setTimeout(tryFillForm, 1500);
  });
}

function tryFillForm() {
  const form = document.getElementById('wpforms-form-2176');
  if (form && !isFormFilled) {
    fillForm();
  } else if (!isFormFilled) {
    setTimeout(tryFillForm, 2000);
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
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

observer.observe(document.body, { childList: true, subtree: true });
