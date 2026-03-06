// content-sipal.js
// Для сайта sipal.sz.rt.ru
// Автоматическая вставка лицевого счёта и запуск поиска
// Версия 1.0

function fillAndSearch() {
  chrome.storage.local.get(['sipalSearchData'], (result) => {
    if (!result.sipalSearchData) {
      return;
    }
    
    const { ilsAccount, timestamp } = result.sipalSearchData;
    
    // Проверяем, не устарели ли данные (30 секунд)
    if (Date.now() - timestamp > 30000) {
      chrome.storage.local.remove(['sipalSearchData']);
      return;
    }
    
    console.log('[SIPAL] ИЛС:', ilsAccount);
    chrome.storage.local.remove(['sipalSearchData']);
    
    // Ищем поле НЛС разными способами
    let nlsInput = null;
    
    // Способ 1: через Webix API (если доступен)
    if (typeof webix !== 'undefined' && webix.$$) {
      const nlsWidget = webix.$$('nls');
      if (nlsWidget) {
        nlsInput = nlsWidget.getInputNode ? nlsWidget.getInputNode() : null;
        if (nlsInput) {
          // Устанавливаем значение через Webix API
          nlsWidget.setValue(ilsAccount);
        }
      }
    }
    
    // Способ 2: по placeholder
    if (!nlsInput) {
      nlsInput = document.querySelector('input[placeholder="Номер лицевого счета"]');
      if (nlsInput) {
        nlsInput.value = ilsAccount;
        
        // Триггерим события для Webix
        nlsInput.dispatchEvent(new Event('input', { bubbles: true }));
        nlsInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    
    // Способ 3: по label "НЛС"
    if (!nlsInput) {
      const labels = document.querySelectorAll('.webix_inp_label');
      for (const label of labels) {
        if (label.textContent.trim() === 'НЛС') {
          const container = label.closest('.webix_el_box');
          if (container) {
            nlsInput = container.querySelector('input[type="text"]');
            if (nlsInput) {
              nlsInput.value = ilsAccount;
              nlsInput.dispatchEvent(new Event('input', { bubbles: true }));
              nlsInput.dispatchEvent(new Event('change', { bubbles: true }));
              break;
            }
          }
        }
      }
    }
    
    // Способ 4: по name="nls"
    if (!nlsInput) {
      nlsInput = document.querySelector('input[name="nls"]');
      if (nlsInput) {
        nlsInput.value = ilsAccount;
        nlsInput.dispatchEvent(new Event('input', { bubbles: true }));
        nlsInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    
    if (!nlsInput) {
      console.warn('[SIPAL] Поле НЛС не найдено');
      return;
    }
    
    // Фокусируемся на поле и симулируем нажатие Enter для запуска поиска
    setTimeout(() => {
      nlsInput.focus();
      
      // Создаём и отправляем событие keydown с кодом Enter
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      nlsInput.dispatchEvent(enterEvent);
      
      // Также отправляем keypress и keyup для полной совместимости
      const keypressEvent = new KeyboardEvent('keypress', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      nlsInput.dispatchEvent(keypressEvent);
      
      const keyupEvent = new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      nlsInput.dispatchEvent(keyupEvent);
      
      console.log('[SIPAL] Поиск активирован');
    }, 300);
  });
}

function init() {
  // Запускаем с задержкой, чтобы страница успела загрузиться
  if (document.readyState === 'complete') {
    setTimeout(fillAndSearch, 500);
  } else {
    window.addEventListener('load', () => {
      setTimeout(fillAndSearch, 500);
    });
  }
  // Дополнительная попытка через 1 секунду
  setTimeout(fillAndSearch, 1000);
}

init();
