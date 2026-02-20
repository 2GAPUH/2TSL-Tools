// content-userinfo.js
// Для сайта lb.volga.rt.ru/userinfo.php
// Автозаполнение MAC адреса

// ==================== ПЕРЕМЕННЫЕ ====================
let isFormFilled = false;

// ==================== УТИЛИТЫ ====================
function safelyExecute(callback, errorMsg = 'Ошибка') {
  try { return callback(); } 
  catch (e) { console.error(errorMsg + ':', e); return null; }
}

// ==================== ЗАПОЛНЕНИЕ ФОРМЫ ====================
function fillMacField(macAddress) {
  return safelyExecute(() => {
    const macField = document.querySelector('input[name="mac_address"]');
    if (macField && macAddress) {
      macField.value = macAddress;
      macField.dispatchEvent(new Event('input', { bubbles: true }));
      macField.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('MAC адрес заполнен:', macAddress);
      return true;
    }
    return false;
  }, 'Ошибка заполнения MAC');
}

function fillForm() {
  if (isFormFilled) return;
  
  safelyExecute(() => {
    // Проверяем URL параметры
    const urlParams = new URLSearchParams(window.location.search);
    const macFromUrl = urlParams.get('mac');
    
    if (macFromUrl) {
      fillMacField(macFromUrl);
      isFormFilled = true;
      return;
    }
    
    // Если нет в URL, пробуем из хранилища
    chrome.storage.local.get(['epdMacAddress', 'epdTimestamp'], (result) => {
      if (result.epdMacAddress) {
        // Проверяем что данные не старше 5 минут
        const age = Date.now() - (result.epdTimestamp || 0);
        if (age < 5 * 60 * 1000) {
          fillMacField(result.epdMacAddress);
          isFormFilled = true;
          
          // Очищаем после использования
          chrome.storage.local.remove(['epdMacAddress', 'epdTimestamp']);
        }
      }
    });
  }, 'Ошибка заполнения формы');
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function init() {
  console.log('Userinfo Autofill v1.0');
  
  // Ждем загрузки формы
  setTimeout(tryFillForm, 500);
}

function tryFillForm() {
  const macField = document.querySelector('input[name="mac_address"]');
  if (macField && !isFormFilled) {
    fillForm();
  } else if (!isFormFilled) {
    setTimeout(tryFillForm, 1000);
  }
}

// ==================== ЗАПУСК ====================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
