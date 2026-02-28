// content-onyma.js
// Для сайта onymaweb.south.rt.ru
// Автоматическая вставка лицевого счёта и запуск поиска
// Версия 1.4

function fillAndSearch() {
  chrome.storage.local.get(['onymaSearchData'], (result) => {
    if (!result.onymaSearchData) {
      return;
    }
    
    const { ilsAccount, timestamp } = result.onymaSearchData;
    
    if (Date.now() - timestamp > 30000) {
      chrome.storage.local.remove(['onymaSearchData']);
      return;
    }
    
    console.log('[Onyma] ИЛС:', ilsAccount);
    chrome.storage.local.remove(['onymaSearchData']);
    
    // Вставляем ИЛС
    const valueInput = document.getElementById('addattrv1');
    if (valueInput) {
      valueInput.value = ilsAccount;
    }
    
    // Нажимаем поиск
    setTimeout(() => {
      document.getElementById('search')?.click();
    }, 200);
  });
}

function init() {
  if (document.readyState === 'complete') {
    fillAndSearch();
  } else {
    window.addEventListener('load', fillAndSearch);
  }
  setTimeout(fillAndSearch, 500);
}

init();
