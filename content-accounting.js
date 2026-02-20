// content-accounting.js
// Боковая панель "Учёт заявок" для сайта omnichat.rt.ru
// Версия 2.0 - улучшенные стили

(() => {
  'use strict';

  if (!location.hostname.includes('omnichat.rt.ru')) return;

  // ==================== ХЕЛПЕРЫ ====================
  const $ = (id) => document.getElementById(id);
  const pad2 = (n) => String(n).padStart(2, "0");
  
  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };
  
  const getTimeStr = () => {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  };

  // ==================== ПЕРЕМЕННЫЕ ====================
  let settings = { omnichatTemplates: true, ttmButton: true, accountingPanel: true };
  let isDarkTheme = false;
  let isInitialized = false;
  let activeWorkingDate = getTodayStr();

  // ==================== ОПРЕДЕЛЕНИЕ ТЕМЫ ====================
  const getColorBrightness = (colorStr) => {
    if (!colorStr || colorStr === 'transparent') return null;
    const rgbaMatch = colorStr.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (rgbaMatch) {
      const alpha = parseFloat(rgbaMatch[4]);
      if (alpha === 0) return null;
      const [, r, g, b] = rgbaMatch.map(Number);
      return (r + g + b) / 3;
    }
    const rgbMatch = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch.map(Number);
      return (r + g + b) / 3;
    }
    return null;
  };

  const detectTheme = () => {
    // 1. Проверяем style attribute на body
    const bodyStyle = document.body.getAttribute('style') || '';
    if (bodyStyle.includes('color-scheme: dark')) return true;
    if (bodyStyle.includes('color-scheme: light')) return false;

    // 2. Проверяем известные классы темной темы
    const darkClasses = ['huKXZo', 'boAFNW', 'gTOzCX', 'bBfYSh'];
    for (const cls of darkClasses) {
      if (document.querySelector(`[class*="${cls}"]`)) return true;
    }

    // 3. Проверяем цвет ТЕКСТА на body 
    const bodyColor = getComputedStyle(document.body).color;
    const textBrightness = getColorBrightness(bodyColor);
    if (textBrightness !== null && textBrightness > 200) return true;

    // 4. Проверяем цвет ФОНА
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const bgBrightness = getColorBrightness(bodyBg);
    if (bgBrightness !== null && bgBrightness < 50) return true;

    // 5. Фоллбэк: ищем большие темные блоки
    const allDivs = document.querySelectorAll('div');
    
    for (let i = 0; i < Math.min(allDivs.length, 50); i++) {
      const div = allDivs[i];
      if (div.closest('.tickets-sidebar') || div.closest('.tickets-toggle-btn')) continue;
      
      const rect = div.getBoundingClientRect();
      if (rect.width < 300 || rect.height < 300) continue; 
      
      const bg = getComputedStyle(div).backgroundColor;
      const b = getColorBrightness(bg);
      
      if (b !== null && b < 60) return true; 
    }
    
    return false;
  };

  const applyTheme = (dark) => {
    const sidebar = document.querySelector('.tickets-sidebar');
    const toggleBtn = document.querySelector('.tickets-toggle-btn');
    if (sidebar) sidebar.classList.toggle('dark-theme', dark);
    if (toggleBtn) toggleBtn.classList.toggle('dark-mode', dark);
    isDarkTheme = dark;
  };

  const checkAndApplyTheme = () => {
    const dark = detectTheme();
    applyTheme(dark);
  };

  // ==================== СТИЛИ ====================
  const injectStyles = () => {
    if (document.getElementById('accounting-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'accounting-styles';
    style.textContent = `
      /* ==========================================================================
         1. КНОПКА ОТКРЫТИЯ/ЗАКРЫТИЯ ПАНЕЛИ
         ========================================================================== */
      .tickets-toggle-btn {
        position: fixed !important;
        left: 10px !important;
        top: 390px !important;
        z-index: 100000 !important;
        background: #2563eb !important;
        color: white !important;
        border: none !important;
        border-radius: 10px !important;
        height: 40px !important;
        width: 40px !important;
        padding: 0 !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-shadow: 0 3px 10px rgba(37, 99, 235, 0.3) !important;
        transition: left 0.3s ease, width 0.3s ease, background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease, border-radius 0.3s ease !important;
        overflow: hidden !important;
      }

      .tickets-toggle-btn:hover {
        width: 100px !important;
        background: #1d4ed8 !important;
        transform: translateY(-2px) !important;
        box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4) !important;
      }

      .tickets-toggle-btn.active {
        left: 290px !important;
        background: #2563eb !important;
        box-shadow: none !important;
        border-top-left-radius: 0 !important;
        border-bottom-left-radius: 0 !important;
        width: 40px !important; 
      }

      .tickets-toggle-btn.active:hover {
        width: 100px !important;
        transform: translateY(0) !important; 
      }

      .tickets-toggle-btn::before {
        content: "📊";
        font-size: 18px;
        position: absolute;
        left: 20px !important;
        top: 50%;
        transform: translate(-50%, -50%);
        flex-shrink: 0;
      }

      .tickets-toggle-btn .btn-text {
        opacity: 0;
        transition: opacity 0.3s ease 0.1s;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.3px;
        margin-left: 38px !important;
      }

      .tickets-toggle-btn:hover .btn-text,
      .tickets-toggle-btn.active:hover .btn-text {
        opacity: 1;
      }

      .tickets-toggle-btn.dark-mode {
        background: #3b82f6 !important;
      }
      .tickets-toggle-btn.dark-mode:hover {
        background: #2563eb !important;
      }

      /* ==========================================================================
         2. БОКОВАЯ ПАНЕЛЬ (КОМПАКТНАЯ)
         ========================================================================== */
      .tickets-sidebar {
        position: fixed;
        top: 0;
        left: 0;
        width: 290px;
        height: 100vh;
        background: #ffffff;
        z-index: 9999;
        box-shadow: 3px 0 20px rgba(0,0,0,0.08);
        border-right: 1px solid #c0c0c0;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 12px !important;
        color: #1f2937;
        
        clip-path: inset(0 100% 0 0);
        transition: clip-path 0.3s ease;
      }

      .tickets-sidebar.open {
        clip-path: inset(0 0 0 0);
      }

      /* Все дочерние элементы без собственных transition */
      .tickets-sidebar * {
        transition: none !important;
      }

      /* Восстанавливаем transition только для интерактивных элементов */
      .tickets-sidebar button {
        transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.1s ease !important;
      }

      .tickets-sidebar input:focus,
      .tickets-sidebar textarea:focus {
        transition: border-color 0.2s ease, background-color 0.2s ease !important;
      }

      /* Элементы формы */
      .tickets-sidebar input,
      .tickets-sidebar textarea,
      .tickets-sidebar select {
        width: 100%;
        padding: 8px 10px !important;
        font-size: 12px !important;
        border-radius: 5px;
        margin-bottom: 8px;
        border: 1px solid #e5e7eb;
        background: #f9fafb;
        color: #111827;
      }

      .tickets-sidebar input:focus,
      .tickets-sidebar textarea:focus {
        background: #fff;
        border-color: #6b7280;
        outline: none;
      }

      .tickets-sidebar textarea {
        height: 50px !important;
        resize: none;
      }

      .tickets-sidebar .time-inputs {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }

      .tickets-sidebar .time-group { flex: 1; }

      .tickets-sidebar .time-group label {
        font-size: 10px !important;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        margin-bottom: 4px !important;
        color: #6b7280;
        display: block;
      }

      /* ==========================================================================
         3. КНОПКИ ПАНЕЛИ
         ========================================================================== */
      .tickets-sidebar .buttons {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin: 12px 0;
      }

      .tickets-sidebar .buttons button {
        width: 100%;
        padding: 10px 8px !important;
        font-size: 12px !important;
        font-weight: 600;
        border-radius: 6px;
        cursor: pointer;
        border: none !important;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .tickets-sidebar button:active {
        transform: scale(0.98);
      }

      /* Закрыто (Primary) */
      .tickets-sidebar button.primary {
        background-color: #ffffff !important;
        color: #1f2937 !important;
        border: 1px solid #d1d5db !important;
      }
      .tickets-sidebar button.primary:hover {
        background-color: #f3f4f6 !important;
        border-color: #9ca3af !important;
      }

      /* На выезд (Warning) */
      .tickets-sidebar button.warning {
        background-color: #ffffff !important;
        color: #d97706 !important;
        border: 1px solid #fcd34d !important;
      }
      .tickets-sidebar button.warning:hover {
        background-color: #fffbeb !important;
        border-color: #d97706 !important;
      }

      /* Удалить (Danger) */
      .tickets-sidebar button.danger {
        background-color: transparent !important;
        color: #ef4444 !important;
        border: 1px solid #fee2e2 !important;
      }
      .tickets-sidebar button.danger:hover {
        background-color: #fef2f2 !important;
        border-color: #ef4444 !important;
      }

      /* Кнопки футера */
      .tickets-sidebar .footer-buttons {
        display: flex;
        gap: 8px;
        margin-top: 16px;
      }

      .tickets-sidebar .footer-buttons button {
        padding: 8px 10px !important;
        font-size: 11px !important;
        font-weight: 600;
        border-radius: 5px;
        flex: 1;
      }

      /* Новый день (Success) */
      .tickets-sidebar button.success {
        background-color: #10b981 !important;
        color: white !important;
      }
      .tickets-sidebar button.success:hover {
        background-color: #059669 !important;
        box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
      }

      /* Скачать отчет (Accent) */
      .tickets-sidebar button.accent {
        background-color: #f3f4f6 !important;
        color: #4b5563 !important;
      }
      .tickets-sidebar button.accent:hover {
        background-color: #e5e7eb !important;
        color: #111827 !important;
      }

      /* ==========================================================================
         4. КОМПОНЕНТЫ ИНТЕРФЕЙСА
         ========================================================================== */
      .tickets-sidebar .tickets-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }
      .tickets-sidebar .tickets-header h3 {
        font-size: 15px !important;
        font-weight: 700;
        color: #111827;
        margin: 0;
      }

      .tickets-sidebar .tickets-close-btn {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #9ca3af;
        padding: 0 !important;
        width: auto !important;
      }
      .tickets-sidebar .tickets-close-btn:hover { color: #4b5563; }

      .tickets-sidebar .date-row {
        display: flex;
        justify-content: space-between;
        padding: 8px 0 !important;
        border-bottom: 1px solid #e5e7eb;
        margin-bottom: 12px;
        font-weight: 500;
        font-size: 12px !important;
        color: #6b7280;
      }
      .tickets-sidebar .date-row strong { color: #111827; }

      .tickets-sidebar .stats {
        display: flex;
        justify-content: space-between;
        margin: 12px 0;
        font-size: 11px !important;
        color: #6b7280;
      }
      .tickets-sidebar .stats strong { color: #111827; font-size: 13px; }

      .tickets-sidebar .performance,
      .tickets-sidebar .closure-percent {
        margin: 6px 0;
        padding: 8px 10px;
        background: #f9fafb;
        border: 1px solid #f3f4f6;
        border-radius: 5px;
        font-size: 11px !important;
        font-weight: 500;
        color: #374151;
      }

      .tickets-sidebar .list h4 {
        font-size: 11px !important;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        margin: 16px 0 8px 0;
        color: #9ca3af;
      }

      .tickets-sidebar .list ul {
        max-height: 180px !important;
        overflow-y: auto;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        padding: 0;
        margin: 0;
        list-style: none;
      }

      .tickets-sidebar .list li {
        padding: 8px 10px !important;
        font-size: 11px !important;
        border-bottom: 1px solid #f3f4f6;
        color: #4b5563;
      }
      .tickets-sidebar .list li:last-child { border-bottom: none; }

      /* ==========================================================================
         5. ТЕМНАЯ ТЕМА
         ========================================================================== */
      .tickets-sidebar.dark-theme {
        background: #1a1a1a !important;
        color: #e5e7eb !important;
        border-right: 1px solid #444 !important;
      }

      .tickets-sidebar.dark-theme .tickets-header h3 { 
        color: #fff !important; 
      }

      .tickets-sidebar.dark-theme .date-row {
        border-color: #333 !important;
        color: #9ca3af !important;
      }

      .tickets-sidebar.dark-theme .date-row strong { 
        color: #fff !important; 
      }

      .tickets-sidebar.dark-theme input,
      .tickets-sidebar.dark-theme textarea,
      .tickets-sidebar.dark-theme select {
        background: #2a2a2a !important;
        border-color: #444 !important;
        color: #fff !important;
      }

      .tickets-sidebar.dark-theme input::placeholder,
      .tickets-sidebar.dark-theme textarea::placeholder { 
        color: #888 !important; 
      }

      .tickets-sidebar.dark-theme .time-group label {
        color: #9ca3af !important;
      }

      .tickets-sidebar.dark-theme .performance,
      .tickets-sidebar.dark-theme .closure-percent {
        background: #2a2a2a !important;
        border-color: #333 !important;
        color: #d1d5db !important;
      }

      .tickets-sidebar.dark-theme .stats {
        color: #9ca3af !important;
      }

      .tickets-sidebar.dark-theme .stats strong {
        color: #fff !important;
      }

      .tickets-sidebar.dark-theme .list h4 {
        color: #6b7280 !important;
      }

      .tickets-sidebar.dark-theme .list ul { 
        border-color: #333 !important; 
        background: #222 !important;
      }

      .tickets-sidebar.dark-theme .list li { 
        border-color: #333 !important; 
        color: #d1d5db !important; 
      }

      /* Кнопки в темной теме */
      .tickets-sidebar.dark-theme button.primary { 
        background-color: transparent !important; 
        border: 1px solid #10b981 !important; 
        color: #10b981 !important; 
      }
      .tickets-sidebar.dark-theme button.primary:hover { 
        background-color: rgba(16, 185, 129, 0.15) !important;
      }

      .tickets-sidebar.dark-theme button.warning { 
        background-color: transparent !important; 
        border: 1px solid #fbbf24 !important; 
        color: #fbbf24 !important; 
      }
      .tickets-sidebar.dark-theme button.warning:hover { 
        background-color: rgba(251, 191, 36, 0.1) !important; 
      }

      .tickets-sidebar.dark-theme button.danger { 
        border: 1px solid #f87171 !important; 
        color: #f87171 !important; 
      }
      .tickets-sidebar.dark-theme button.danger:hover { 
        background-color: rgba(248, 113, 113, 0.1) !important; 
      }

      .tickets-sidebar.dark-theme button.success {
        background-color: #10b981 !important;
        color: white !important;
      }
      .tickets-sidebar.dark-theme button.success:hover { 
        background-color: #059669 !important; 
      }

      .tickets-sidebar.dark-theme button.accent {
        background-color: #333 !important;
        color: #e5e7eb !important;
      }
      .tickets-sidebar.dark-theme button.accent:hover {
        background-color: #444 !important;
        color: #fff !important;
      }

      .tickets-sidebar.dark-theme .tickets-close-btn {
        color: #6b7280 !important;
      }
      .tickets-sidebar.dark-theme .tickets-close-btn:hover {
        color: #fff !important;
      }

      /* ==========================================================================
         6. СКРОЛЛБАР
         ========================================================================== */
      .tickets-sidebar::-webkit-scrollbar {
        width: 6px;
      }

      .tickets-sidebar::-webkit-scrollbar-track {
        background: transparent;
      }

      .tickets-sidebar::-webkit-scrollbar-thumb {
        background: #d1d5db;
        border-radius: 3px;
      }

      .tickets-sidebar.dark-theme::-webkit-scrollbar-thumb {
        background: #4b5563;
      }

      .tickets-sidebar .list ul::-webkit-scrollbar {
        width: 4px;
      }

      .tickets-sidebar .list ul::-webkit-scrollbar-thumb {
        background: #d1d5db;
        border-radius: 2px;
      }

      .tickets-sidebar.dark-theme .list ul::-webkit-scrollbar-thumb {
        background: #4b5563;
      }
    `;
    document.head.appendChild(style);
  };

  // ==================== UI ПАНЕЛИ ====================
  const updateSidebarUI = (dayData) => {
    const els = {
      list: $('sidebar-entries'),
      closed: $('sidebar-countClosed'),
      field: $('sidebar-countField'),
      total: $('sidebar-countTotal'),
      perf: $('sidebar-performance'),
      perc: $('sidebar-closurePercent'),
      h: $('sidebar-workHours'),
      m: $('sidebar-workMinutes'),
      date: $('sidebar-currentDate')
    };

    if (!els.list) return;

    if (!dayData) dayData = { entries: [], hours: 0, minutes: 0 };
    const { entries = [], hours = 0, minutes = 0 } = dayData;

    if (els.date) els.date.textContent = activeWorkingDate;

    els.list.innerHTML = entries.map(e => `
      <li>
        <strong>${e.time}</strong> ${e.type === 'closed' ? '✅' : '🚗'} 
        ${e.number ? `№${e.number}` : ''} ${e.comment ? `— ${e.comment}` : ''}
      </li>
    `).join('') || '<li>Заявок пока нет</li>';
    els.list.scrollTop = els.list.scrollHeight;

    const closedCount = entries.filter(e => e.type === 'closed').length;
    const totalCount = entries.length;
    els.closed.textContent = closedCount;
    els.field.textContent = entries.filter(e => e.type === 'field').length;
    els.total.textContent = totalCount;

    if (document.activeElement !== els.h) els.h.value = hours;
    if (document.activeElement !== els.m) els.m.value = minutes;

    const totalH = hours + (minutes / 60);
    if (totalH > 0) {
      const lunch = totalH >= 12 ? 1.75 : 0.75;
      const workTime = totalH - lunch;
      const perf = workTime > 0 ? (totalCount / workTime).toFixed(2) : 0;
      els.perf.textContent = `Производительность: ${perf}`;
    } else {
      els.perf.textContent = 'Производительность: —';
    }

    const perc = totalCount > 0 ? ((closedCount / totalCount) * 100).toFixed(2) : 0;
    els.perc.textContent = `Процент закрытия: ${perc}%`;
  };

  // ==================== ЛОГИКА ====================
  const Logic = {
    init: async () => {
      const res = await chrome.storage.local.get(['requestsByDate', 'currentWorkingDate']);
      activeWorkingDate = res.currentWorkingDate || getTodayStr();
      
      if (!res.currentWorkingDate) {
        chrome.storage.local.set({ currentWorkingDate: activeWorkingDate });
      }

      const allData = res.requestsByDate || {};
      if (!allData[activeWorkingDate]) {
        allData[activeWorkingDate] = { entries: [], hours: 0, minutes: 0 };
        chrome.storage.local.set({ requestsByDate: allData });
      }
      updateSidebarUI(allData[activeWorkingDate]);
    },

    add: async (type) => {
      const num = $('sidebar-ticketNumber').value.trim();
      const com = $('sidebar-ticketComment').value.trim();
      if (!num && !com) return alert('Введите данные');

      const today = activeWorkingDate;
      const res = await chrome.storage.local.get(['requestsByDate']);
      const allData = res.requestsByDate || {};
      if (!allData[today]) allData[today] = { entries: [], hours: 0, minutes: 0 };

      const exists = allData[today].entries.some(e => 
        (num && e.number === num && e.type === type) || (!num && com && e.comment === com && e.type === type)
      );
      if (exists) return alert('Уже добавлено');

      allData[today].entries.push({ time: getTimeStr(), type, number: num, comment: com });
      await chrome.storage.local.set({ requestsByDate: allData });
      
      $('sidebar-ticketNumber').value = '';
      $('sidebar-ticketComment').value = '';
    },

    removeLast: async () => {
      const today = activeWorkingDate;
      const res = await chrome.storage.local.get(['requestsByDate']);
      const allData = res.requestsByDate || {};
      if (allData[today]?.entries?.length) {
        allData[today].entries.pop();
        await chrome.storage.local.set({ requestsByDate: allData });
      }
    },

    saveTime: async () => {
      const h = parseInt($('sidebar-workHours').value) || 0;
      const m = parseInt($('sidebar-workMinutes').value) || 0;
      const today = activeWorkingDate;
      const res = await chrome.storage.local.get(['requestsByDate']);
      const allData = res.requestsByDate || {};
      if (!allData[today]) allData[today] = { entries: [] };
      allData[today].hours = h;
      allData[today].minutes = m;
      await chrome.storage.local.set({ requestsByDate: allData });
    },

    newDay: async () => {
      if(!confirm('Начать новый день?')) return;
      
      const realToday = getTodayStr();
      activeWorkingDate = realToday;
      
      const res = await chrome.storage.local.get(['requestsByDate']);
      const allData = res.requestsByDate || {};
      allData[realToday] = { entries: [], hours: 0, minutes: 0 };
      
      await chrome.storage.local.set({ 
          requestsByDate: allData,
          currentWorkingDate: realToday
      });
      
      $('sidebar-ticketNumber').value = ''; $('sidebar-ticketComment').value = '';
      $('sidebar-workHours').value = 0; $('sidebar-workMinutes').value = 0;
    },

    exportCSV: async () => {
      const today = activeWorkingDate;
      const res = await chrome.storage.local.get(['requestsByDate']);
      const dayData = res.requestsByDate?.[today];
      if (!dayData || !dayData.entries.length) return alert('Нет данных');

      let csv = '\uFEFFДата;Время;Тип;Номер;Комментарий\n';
      dayData.entries.forEach(e => {
        csv += `${today};${e.time};${e.type==='closed'?'Закрыто':'Выезд'};${e.number};${e.comment}\n`;
      });
      const perfText = $('sidebar-performance').textContent;
      csv += `\n;;ИТОГО;;\n;;Всего;${dayData.entries.length};\n;;Отработано;${$('sidebar-workHours').value}ч ${$('sidebar-workMinutes').value}м;\n;;${perfText};`;

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Otchet_${today}.csv`;
      link.click();
    }
  };

  // ==================== СЛУШАТЕЛЬ STORAGE ====================
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      // Проверяем изменение настроек
      if (changes.settings) {
        const newSettings = changes.settings.newValue;
        settings = newSettings;
        
        // Если панель отключена - удаляем её
        if (!newSettings.accountingPanel && isInitialized) {
          removeSidebar();
        }
        // Если панель включена - создаём
        if (newSettings.accountingPanel && !isInitialized) {
          createSidebar();
        }
      }
      
      if (changes.currentWorkingDate) {
          activeWorkingDate = changes.currentWorkingDate.newValue;
          chrome.storage.local.get(['requestsByDate'], (res) => {
             updateSidebarUI(res.requestsByDate?.[activeWorkingDate]);
          });
      } else if (changes.requestsByDate) {
          updateSidebarUI(changes.requestsByDate.newValue?.[activeWorkingDate]);
      }
    }
  });

  // ==================== УДАЛЕНИЕ ПАНЕЛИ ====================
  const removeSidebar = () => {
    const sidebar = document.querySelector('.tickets-sidebar');
    const toggleBtn = document.querySelector('.tickets-toggle-btn');
    if (sidebar) sidebar.remove();
    if (toggleBtn) toggleBtn.remove();
    isInitialized = false;
  };

  // ==================== СОЗДАНИЕ ПАНЕЛИ ====================
  const createSidebar = () => {
    if (document.querySelector('.tickets-sidebar')) return;
    
    injectStyles();
    checkAndApplyTheme();
    
    document.body.insertAdjacentHTML('beforeend', `
      <div class="tickets-toggle-btn">
        <span class="btn-text">Учет</span>
      </div>
      <div class="tickets-sidebar">
        <div class="tickets-header">
          <h3>📊 Учет заявок</h3>
          <button class="tickets-close-btn">&times;</button>
        </div>
        <div class="date-row"><span>Дата:</span> <strong id="sidebar-currentDate">...</strong></div>
        <input type="text" id="sidebar-ticketNumber" placeholder="Номер заявки">
        <textarea id="sidebar-ticketComment" placeholder="Комментарий (необязательно)"></textarea>
        <div class="time-inputs">
          <div class="time-group"><label>Часы</label><input type="number" id="sidebar-workHours" min="0" max="24" value="0"></div>
          <div class="time-group"><label>Минуты</label><input type="number" id="sidebar-workMinutes" min="0" max="59" value="0"></div>
        </div>
        <div class="buttons">
          <button id="sidebar-addClosed" class="primary">✅ Закрыто</button>
          <button id="sidebar-addField" class="warning">🚗 На выезд</button>
          <button id="sidebar-removeLast" class="danger">🗑️ Удалить</button>
        </div>
        <div class="stats">
          <div>✅ Закрыто: <strong id="sidebar-countClosed">0</strong></div>
          <div>🚗 На выезд: <strong id="sidebar-countField">0</strong></div>
          <div>📊 Всего: <strong id="sidebar-countTotal">0</strong></div>
        </div>
        <div class="performance" id="sidebar-performance">Производительность: —</div>
        <div class="closure-percent" id="sidebar-closurePercent">Процент закрытия: 0%</div>
        <div class="list"><h4>📋 Лента событий</h4><ul id="sidebar-entries"><li>Загрузка...</li></ul></div>
        <div class="footer-buttons">
          <button id="sidebar-startNewDay" class="success">🔄 Новый день</button>
          <button id="sidebar-finishDay" class="accent">📥 Отчет</button>
        </div>
      </div>
    `);

    $('sidebar-addClosed').onclick = () => Logic.add('closed');
    $('sidebar-addField').onclick = () => Logic.add('field');
    $('sidebar-removeLast').onclick = Logic.removeLast;
    $('sidebar-workHours').oninput = Logic.saveTime;
    $('sidebar-workMinutes').oninput = Logic.saveTime;
    $('sidebar-startNewDay').onclick = Logic.newDay;
    $('sidebar-finishDay').onclick = Logic.exportCSV;

    const toggleBtn = document.querySelector('.tickets-toggle-btn');
    const sidebar = document.querySelector('.tickets-sidebar');
    const btnText = toggleBtn.querySelector('.btn-text');

    toggleBtn.addEventListener('click', () => {
      checkAndApplyTheme();
      sidebar.classList.toggle('open');
      toggleBtn.classList.toggle('active');
      btnText.textContent = sidebar.classList.contains('open') ? 'Скрыть' : 'Учет';
    });

    document.querySelector('.tickets-close-btn').addEventListener('click', () => {
      sidebar.classList.remove('open');
      toggleBtn.classList.remove('active');
      btnText.textContent = 'Учет';
    });

    Logic.init();
    isInitialized = true;
    
    // Таймер для проверки темы (раз в 0.8с)
    setInterval(checkAndApplyTheme, 800);
    setTimeout(checkAndApplyTheme, 1000);
  };

  // ==================== ИНИЦИАЛИЗАЦИЯ ====================
  const init = () => {
    console.log('Accounting Panel v2.0');
    
    // Загружаем настройки
    chrome.storage.local.get(['settings'], (result) => {
      settings = result.settings || { omnichatTemplates: true, ttmButton: true, accountingPanel: true };
      
      if (settings.accountingPanel) {
        createSidebar();
      }
    });
  };

  // ==================== ЗАПУСК ====================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Observer для динамической инициализации
  new MutationObserver(() => {
    if (!isInitialized && settings.accountingPanel) {
      createSidebar();
    }
  }).observe(document.body, { childList: true, subtree: true });

})();
