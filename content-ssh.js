// content-ssh.js
// Content script для SSH сайтов - автоматически подставляет IP из Grafana

(function() {
  'use strict';

  // Функция для заполнения поля IP
  function fillIPField(ip) {
    if (!ip) return false;
    
    // Ищем поле ввода IP
    const ipInput = document.querySelector('input[name="ip"]');
    
    if (ipInput) {
      ipInput.value = ip;
      ipInput.focus();
      
      // Триггерим события для reactive форм
      ipInput.dispatchEvent(new Event('input', { bubbles: true }));
      ipInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      console.log('[2TSL] IP автоматически заполнен:', ip);
      return true;
    }
    
    return false;
  }

  // Функция для проверки и заполнения IP из хранилища
  function checkAndFillIP() {
    chrome.storage.local.get(['sshTransferData'], (result) => {
      if (result.sshTransferData) {
        const { ip, timestamp } = result.sshTransferData;
        
        // Проверяем, что данные не старше 30 секунд
        const isRecent = (Date.now() - timestamp) < 30000;
        
        if (ip && isRecent) {
          // Небольшая задержка для полной загрузки страницы
          setTimeout(() => {
            if (fillIPField(ip)) {
              // Очищаем данные после использования
              chrome.storage.local.remove(['sshTransferData']);
            }
          }, 500);
        }
      }
    });
  }

  // Инициализация
  function init() {
    console.log('[2TSL] SSH content script загружен');
    
    // Проверяем URL параметры
    const urlParams = new URLSearchParams(window.location.search);
    const ipFromUrl = urlParams.get('ip');
    
    if (ipFromUrl) {
      // Если IP передан в URL
      setTimeout(() => fillIPField(ipFromUrl), 500);
    } else {
      // Проверяем хранилище
      checkAndFillIP();
    }
  }

  // Запускаем при загрузке страницы
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
