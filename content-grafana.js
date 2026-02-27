// content-grafana.js
// Content script для Grafana - делает IP кликабельным для перехода на SSH

(function() {
  'use strict';

  // Маппинг регионов на SSH серверы
  const SSH_SERVERS = {
    'волга': 'http://10.77.19.50/stb_ssh/',
    'юг': 'http://10.144.39.131/stb_ssh/',
    'сз': 'http://10.160.191.178/stb_ssh/'
  };

  // Функция для определения SSH сервера по региону
  function getSShServer(regionText) {
    if (!regionText) return null;
    
    const lowerRegion = regionText.toLowerCase();
    
    for (const [region, url] of Object.entries(SSH_SERVERS)) {
      if (lowerRegion.includes(region)) {
        return url;
      }
    }
    
    return null;
  }

  // Функция для извлечения внешнего IP из текста
  function extractExternalIP(ipText) {
    if (!ipText) return null;
    
    // Формат: "10.181.178.246 / 10.181.178.246" (внутренний / внешний)
    const parts = ipText.split('/');
    if (parts.length >= 2) {
      return parts[1].trim();
    }
    
    // Если нет разделителя, возвращаем весь текст
    return ipText.trim();
  }

  // Функция для создания кликабельного IP
  function makeIPClickable(ipElement, externalIP, sshUrl) {
    // Проверяем, что ещё не сделали кликабельным
    if (ipElement.dataset.sshClickable === 'true') return;
    
    // Помечаем как обработанный
    ipElement.dataset.sshClickable = 'true';
    
    // Сохраняем оригинальный текст
    const originalText = ipElement.textContent;
    
    // Применяем стили - синий цвет, pointer курсор, без рамок
    ipElement.style.cssText = `
      color: #3b82f6;
      cursor: pointer;
      transition: color 0.2s ease;
    `;
    
    // Подсказка при наведении
    ipElement.title = `Кликните для перехода на SSH\nIP: ${externalIP}`;
    
    // Эффект при наведении - делаем чуть темнее
    ipElement.addEventListener('mouseenter', () => {
      ipElement.style.color = '#2563eb';
      ipElement.style.textDecoration = 'underline';
    });
    ipElement.addEventListener('mouseleave', () => {
      ipElement.style.color = '#3b82f6';
      ipElement.style.textDecoration = 'none';
    });
    
    // Обработчик клика
    ipElement.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Сохраняем IP в chrome.storage для передачи на SSH сайт
      const transferData = {
        ip: externalIP,
        timestamp: Date.now()
      };
      
      chrome.storage.local.set({ sshTransferData: transferData }, () => {
        // Открываем SSH в новой вкладке
        window.open(sshUrl, '_blank');
      });
    });
    
    console.log('[2TSL] IP сделан кликабельным:', externalIP, '→', sshUrl);
  }

  // Основная функция поиска IP и региона
  function processGrafanaTable() {
    let ipCell = null;
    let regionCell = null;
    
    // Ищем ячейки по содержимому
    document.querySelectorAll('[role="cell"]').forEach(cell => {
      const text = cell.textContent?.trim() || '';
      
      // Ищем ячейку с IP адресом (содержит "/" и IP формат)
      if (text.includes('/') && /\d+\.\d+\.\d+\.\d+/.test(text) && !ipCell) {
        // Проверяем, что это именно IP ячейка (не более 50 символов)
        if (text.length < 50) {
          ipCell = cell;
        }
      }
      
      // Ищем ячейку с регионом
      if ((text.toLowerCase().includes('волга') || 
           text.toLowerCase().includes('юг') || 
           text.toLowerCase().includes('сз')) && 
          text.includes('/') && !regionCell) {
        regionCell = cell;
      }
    });

    // Если нашли IP ячейку
    if (ipCell) {
      // Ищем элемент с текстом внутри ячейки
      const ipElement = ipCell.querySelector('.css-1w5pd0q') || ipCell;
      
      // Проверяем, что ещё не обработали
      if (ipElement.dataset.sshClickable === 'true') return;
      
      const ipText = ipElement.textContent;
      const externalIP = extractExternalIP(ipText);
      
      if (externalIP) {
        // Определяем регион для выбора SSH сервера
        let regionText = '';
        if (regionCell) {
          const regionElement = regionCell.querySelector('.css-1w5pd0q') || regionCell;
          regionText = regionElement.textContent;
        }
        
        // Также проверяем URL параметр var-vDataSource
        const urlParams = new URLSearchParams(window.location.search);
        const dataSource = urlParams.get('var-vDataSource') || '';
        
        // Определяем SSH сервер
        let sshUrl = getSShServer(regionText);
        
        // Если регион не найден в ячейке, пробуем определить по dataSource
        if (!sshUrl && dataSource) {
          if (dataSource.toLowerCase().includes('vlg')) {
            sshUrl = SSH_SERVERS['волга'];
          } else if (dataSource.toLowerCase().includes('ug') || dataSource.toLowerCase().includes('yug')) {
            sshUrl = SSH_SERVERS['юг'];
          } else if (dataSource.toLowerCase().includes('sz')) {
            sshUrl = SSH_SERVERS['сз'];
          }
        }
        
        // Если всё ещё не нашли, используем Волгу по умолчанию
        if (!sshUrl) {
          sshUrl = SSH_SERVERS['волга'];
        }
        
        // Делаем IP кликабельным
        makeIPClickable(ipElement, externalIP, sshUrl);
      }
    }
  }

  // Функция для отслеживания изменений в DOM
  function observeDOM() {
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.querySelector?.('[role="cell"]') || node.matches?.('[role="cell"]')) {
                shouldCheck = true;
              }
            }
          });
        }
      });
      
      if (shouldCheck) {
        // Проверяем настройку перед обработкой
        chrome.storage.local.get(['settings'], (result) => {
          const settings = result.settings || { grafanaSSH: true };
          if (settings.grafanaSSH) {
            processGrafanaTable();
          }
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Инициализация
  function init() {
    console.log('[2TSL] Grafana content script загружен');
    
    // Проверяем настройку перед запуском
    chrome.storage.local.get(['settings'], (result) => {
      const settings = result.settings || { grafanaSSH: true };
      
      if (settings.grafanaSSH) {
        // Первичная попытка
        setTimeout(processGrafanaTable, 1000);
        
        // Повторные попытки с интервалом
        let attempts = 0;
        const maxAttempts = 10;
        const interval = setInterval(() => {
          processGrafanaTable();
          attempts++;
          if (attempts >= maxAttempts) {
            clearInterval(interval);
          }
        }, 2000);
        
        // Отслеживаем изменения в DOM
        observeDOM();
      } else {
        console.log('[2TSL] Функция Grafana → SSH отключена в настройках');
      }
    });
  }

  // Запускаем при загрузке страницы
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
