// content-omnichat.js
// Для сайта omnichat.rt.ru
// Версия 7.0 - с поддержкой настроек

// ==================== ПЕРЕМЕННЫЕ ====================
let originalSearchContainer = null;
let customSearchContainer = null;
let isInitialized = false;
let modalCloseObserver = null;
let searchInputHandler = null;
let originalFifthScrollContent = null;
let originalSixthScrollContent = null;
let groupFilterSelect = null;
let currentSelectedGroup = "";
let isDarkTheme = false;
let currentLoadingId = 0;
let settings = { omnichatTemplates: true, ttmButton: true };

// ==================== СЕЛЕКТОРЫ ====================
const SELECTORS = {
  tabsGroup: '[data-testid="test-tabsgroup"]',
  wrapperTabs: '[data-testid="wrapper-tabs"]',
  modal: '[data-testid="modal"]',
  scrollBoxRoot: '#scroll-box-root',
  tabFavorites: '[data-testid="tab-favorites"]',
  tabAllTemplate: '[data-testid="tab-all-template"]',
  tabAdditional: '[data-testid="tab-additional"]',
  searchTemplate: '[data-testid="search-template"]',
  replyTemplate: '[data-testid="reply-template"]',
  replyTitle: '[data-testid="reply-title"]',
  collapsableText: '[data-testid="collapsable-text"]',
  iconContainer: '[data-testid="iconContainer"]',
  dialog: '[role="dialog"]',
  draftEditorContent: '.public-DraftEditor-content[contenteditable="true"]',
  contentEditable: '[contenteditable="true"]'
};

// ==================== УТИЛИТЫ ====================
function safelyExecute(callback, errorMsg = 'Ошибка') {
  try { return callback(); } 
  catch (e) { console.error(errorMsg + ':', e); return null; }
}

function safelyAddEventListener(el, event, handler) {
  if (el) { el.addEventListener(event, handler); return true; }
  return false;
}

// ==================== CSS ====================
function injectTemplateStyles() {
  if (document.getElementById('omnichat-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'omnichat-styles';
  style.textContent = `
    .custom-templates-wrapper { padding: 12px; display: flex; flex-direction: column; gap: 8px; contain: content; }
    .custom-template-item { padding: 12px; border-radius: 8px; cursor: pointer; transition: background-color 0.2s ease; position: relative; overflow: hidden; contain: layout style; }
    .custom-template-item:hover { background-color: rgba(0,0,0,0.05); }
    .dark-theme .custom-template-item:hover { background-color: rgba(255,255,255,0.1); }
    .custom-template-title-wrapper { padding: 0 0 8px 0; position: relative; }
    .custom-template-content-wrapper { padding: 8px 0 0 0; position: relative; }
    .group-filter-select { width: 100%; padding: 8px 12px; border-radius: 4px; font-size: 14px; color: #333 !important; background: white !important; cursor: pointer; }
    .group-filter-select option { color: #333 !important; background: white !important; }
    .group-filter-reset { width: 100%; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; color: #333; background: #f5f5f5; margin-top: 8px; }
    .group-filter-reset:hover { background: #e9e9e9; }
    .template-group-badge { font-size: 11px; padding: 2px 6px; border-radius: 3px; margin-left: 8px; white-space: nowrap; flex-shrink: 0; }
  `;
  document.head.appendChild(style);
}

// ==================== ТЕМА ====================
function detectTheme() {
  return safelyExecute(() => {
    const body = document.body;
    if (!body) return isDarkTheme;
    
    const styleAttr = body.getAttribute('style') || '';
    if (styleAttr.includes('color-scheme: dark')) { isDarkTheme = true; return isDarkTheme; }
    if (styleAttr.includes('color-scheme: light')) { isDarkTheme = false; return isDarkTheme; }
    
    const bgColor = window.getComputedStyle(body).backgroundColor;
    const rgb = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgb) isDarkTheme = (parseInt(rgb[1]) + parseInt(rgb[2]) + parseInt(rgb[3])) < 384;
    return isDarkTheme;
  }, 'Ошибка определения темы');
}

// ==================== КЛАССЫ ====================
function getTabClasses(isActive = false) {
  return safelyExecute(() => {
    const tab = document.querySelector(isActive ? SELECTORS.tabFavorites : SELECTORS.tabAllTemplate);
    if (tab) return tab.className;
    
    const tabs = document.querySelectorAll('[aria-selected]');
    for (const t of tabs) {
      if ((isActive && t.getAttribute('aria-selected') === 'true') ||
          (!isActive && t.getAttribute('aria-selected') === 'false')) return t.className;
    }
    return '';
  }, 'Ошибка получения классов');
}

function getTabSpanClasses() {
  const tab = document.querySelector(SELECTORS.tabFavorites);
  return tab?.querySelector('span')?.className || '';
}

function getTemplateClasses() {
  return {
    container: document.querySelector(SELECTORS.replyTemplate)?.className || '',
    title: document.querySelector(SELECTORS.replyTitle)?.className || '',
    name: safelyExecute(() => {
      const t = document.querySelector(SELECTORS.replyTemplate);
      const wrapper = t?.querySelector('[class*="Title"]') || t?.querySelector('div > span');
      return wrapper?.querySelector('span')?.className || '';
    }, '') || '',
    content: document.querySelector(SELECTORS.collapsableText)?.className || ''
  };
}

// ==================== ПОИСК ЭЛЕМЕНТОВ ====================
function findSearchContainer() {
  return safelyExecute(() => {
    const input = document.querySelector(SELECTORS.searchTemplate);
    if (!input) return null;
    let parent = input.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      if (parent.querySelector(SELECTORS.searchTemplate)) return parent;
      parent = parent.parentElement;
    }
    return null;
  }, 'Ошибка поиска контейнера');
}

function findScrollBoxByIndex(index) {
  const boxes = document.querySelectorAll(SELECTORS.scrollBoxRoot);
  return boxes[index] || null;
}

function findEditableField() {
  const selectors = [SELECTORS.draftEditorContent, SELECTORS.contentEditable, 
                     '.DraftEditor-editorContainer', '.notranslate.public-DraftEditor-content'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function findCorrectCloseButton() {
  return safelyExecute(() => {
    const buttons = document.querySelectorAll(SELECTORS.iconContainer);
    for (const btn of buttons) {
      let parent = btn.parentElement;
      while (parent && parent !== document.body) {
        if (parent.querySelectorAll(SELECTORS.replyTemplate).length > 0) return btn;
        parent = parent.parentElement;
      }
    }
    return buttons[buttons.length - 1] || null;
  }, 'Ошибка поиска кнопки');
}

// ==================== ВСТАВКА ТЕКСТА ====================
function insertTextIntoDraftEditor(text, target) {
  if (!target) return false;
  
  return safelyExecute(() => {
    target.focus();
    
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: new DataTransfer(),
      bubbles: true,
      cancelable: true
    });
    pasteEvent.clipboardData.setData('text/plain', text);
    target.dispatchEvent(pasteEvent);
    
    if (!pasteEvent.defaultPrevented) {
      target.innerHTML = '';
      target.appendChild(document.createTextNode(text));
      target.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    target.dispatchEvent(new Event('compositionend', { bubbles: true }));
    return true;
  }, 'Ошибка вставки');
}

// ==================== СОСТОЯНИЕ ====================
function resetExtensionState() {
  isInitialized = false;
  originalSearchContainer = null;
  customSearchContainer = null;
  searchInputHandler = null;
  currentSelectedGroup = "";
  currentLoadingId++;
  
  if (customSearchContainer?.parentNode) {
    customSearchContainer.style.display = 'none';
    const input = customSearchContainer.querySelector('input');
    if (input) input.value = '';
  }
  
  restoreOriginalContent();
}

function observeModalClose() {
  if (modalCloseObserver) return;
  
  modalCloseObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.removedNodes) {
          if (node.nodeType === 1 && node.querySelector && 
              (node.querySelector(SELECTORS.tabsGroup) || 
               node.querySelector(SELECTORS.modal) ||
               node.querySelector(SELECTORS.dialog))) {
            resetExtensionState();
          }
        }
      }
    }
  });
  
  modalCloseObserver.observe(document.body, { childList: true, subtree: true });
}

function saveOriginalContent() {
  const fifth = findScrollBoxByIndex(4);
  const sixth = findScrollBoxByIndex(5);
  if (fifth && !originalFifthScrollContent) originalFifthScrollContent = fifth.innerHTML;
  if (sixth && !originalSixthScrollContent) originalSixthScrollContent = sixth.innerHTML;
  return fifth && sixth;
}

function restoreOriginalContent() {
  const fifth = findScrollBoxByIndex(4);
  const sixth = findScrollBoxByIndex(5);
  if (originalFifthScrollContent && fifth) fifth.innerHTML = originalFifthScrollContent;
  if (originalSixthScrollContent && sixth) sixth.innerHTML = originalSixthScrollContent;
}

// ==================== ПОИСК ====================
function exactSearch(query, items) {
  if (!query) return items;
  const lower = query.toLowerCase();
  return items.filter(item => 
    item.name.toLowerCase().includes(lower) || 
    item.body.toLowerCase().includes(lower)
  );
}

// ==================== ПОИСК (UI) ====================
function createCustomSearch() {
  return safelyExecute(() => {
    detectTheme();
    originalSearchContainer = findSearchContainer();
    if (!originalSearchContainer) return;
    
    customSearchContainer?.parentNode?.removeChild(customSearchContainer);
    customSearchContainer = originalSearchContainer.cloneNode(true);
    
    const input = customSearchContainer.querySelector(SELECTORS.searchTemplate);
    if (input) {
      input.setAttribute('placeholder', 'Поиск в моих шаблонах...');
      input.value = '';
      searchInputHandler?.removeEventListener?.('input', searchInputHandler);
      searchInputHandler = (e) => {
        const sixth = findScrollBoxByIndex(5);
        if (sixth) loadAndDisplayCustomTemplates(sixth, e.target.value, currentSelectedGroup);
      };
      safelyAddEventListener(input, 'input', searchInputHandler);
    }
    
    customSearchContainer.style.display = 'none';
    originalSearchContainer.parentNode.insertBefore(customSearchContainer, originalSearchContainer.nextSibling);
  }, 'Ошибка создания поиска');
}

function switchToCustomSearch() {
  if (originalSearchContainer && customSearchContainer &&
      document.body.contains(originalSearchContainer) &&
      document.body.contains(customSearchContainer)) {
    originalSearchContainer.style.display = 'none';
    customSearchContainer.style.display = '';
    setTimeout(() => customSearchContainer.querySelector('input')?.focus(), 100);
  } else {
    createCustomSearch();
    if (customSearchContainer) {
      originalSearchContainer.style.display = 'none';
      customSearchContainer.style.display = '';
    }
  }
}

function switchToOriginalSearch() {
  if (originalSearchContainer && customSearchContainer &&
      document.body.contains(originalSearchContainer) &&
      document.body.contains(customSearchContainer)) {
    originalSearchContainer.style.display = '';
    customSearchContainer.style.display = 'none';
    const input = customSearchContainer.querySelector('input');
    if (input) input.value = '';
  }
}

// ==================== ВКЛАДКИ ====================
function updateTabButtons(activeButton) {
  safelyExecute(() => {
    const activeClasses = getTabClasses(true);
    const inactiveClasses = getTabClasses(false);
    const spanClasses = getTabSpanClasses();
    
    document.querySelectorAll(SELECTORS.wrapperTabs + ' button').forEach(btn => {
      btn.setAttribute('aria-selected', 'false');
      btn.className = inactiveClasses;
      const span = btn.querySelector('span');
      if (span) span.className = spanClasses;
    });
    
    activeButton.setAttribute('aria-selected', 'true');
    activeButton.className = activeClasses;
  }, 'Ошибка обновления вкладок');
}

function addStandardTabHandlers(wrapperTabs) {
  const favoriteTab = wrapperTabs.querySelector(SELECTORS.tabFavorites);
  const allTab = wrapperTabs.querySelector(SELECTORS.tabAllTemplate);
  
  favoriteTab?.addEventListener('click', () => {
    updateTabButtons(favoriteTab);
    switchToOriginalSearch();
    restoreOriginalContent();
  });
  
  allTab?.addEventListener('click', () => {
    updateTabButtons(allTab);
    switchToOriginalSearch();
    restoreOriginalContent();
  });
}

function addAdditionalButton() {
  return safelyExecute(() => {
    detectTheme();
    
    const tabsGroup = document.querySelector(SELECTORS.tabsGroup);
    const wrapperTabs = tabsGroup?.querySelector(SELECTORS.wrapperTabs);
    if (!wrapperTabs) return false;

    document.querySelector(SELECTORS.tabAdditional)?.remove();

    const tabClasses = getTabClasses(false);
    const spanClasses = getTabSpanClasses();
    
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', 'tab-additional');
    btn.setAttribute('aria-selected', 'false');
    btn.className = tabClasses;
    
    const span = document.createElement('span');
    span.className = spanClasses;
    span.textContent = 'Дополнительно';
    btn.appendChild(span);
    
    wrapperTabs.appendChild(btn);
    createCustomSearch();
    
    btn.addEventListener('click', () => {
      updateTabButtons(btn);
      switchToAdditionalTab();
    });
    
    addStandardTabHandlers(wrapperTabs);
    return true;
  }, 'Ошибка добавления кнопки');
}

// ==================== ФИЛЬТР ====================
function setupFifthScrollBar() {
  return safelyExecute(() => {
    const fifth = findScrollBoxByIndex(4);
    if (!fifth) return false;
    
    detectTheme();
    const classes = getTemplateClasses();
    
    while (fifth.firstChild) fifth.removeChild(fifth.firstChild);
    
    const container = document.createElement('div');
    container.style.padding = '16px';
    if (isDarkTheme) container.classList.add('dark-theme');
    
    const title = document.createElement('div');
    title.className = classes.title;
    title.innerHTML = `<span class="${classes.name}">Фильтр по группам</span>`;
    container.appendChild(title);
    
    const selectContainer = document.createElement('div');
    selectContainer.style.marginTop = '12px';
    
    groupFilterSelect = document.createElement('select');
    groupFilterSelect.className = 'group-filter-select';
    
    const defaultOpt = document.createElement('option');
    defaultOpt.value = "";
    defaultOpt.textContent = "Все группы";
    groupFilterSelect.appendChild(defaultOpt);
    
    chrome.storage.local.get(['groups'], (result) => {
      (result.groups || []).forEach(group => {
        const opt = document.createElement('option');
        opt.value = group;
        opt.textContent = group;
        groupFilterSelect.appendChild(opt);
      });
      if (currentSelectedGroup) groupFilterSelect.value = currentSelectedGroup;
    });
    
    groupFilterSelect.addEventListener('change', (e) => {
      currentSelectedGroup = e.target.value;
      const sixth = findScrollBoxByIndex(5);
      if (sixth) {
        const query = customSearchContainer?.querySelector('input')?.value || '';
        loadAndDisplayCustomTemplates(sixth, query, currentSelectedGroup);
      }
    });
    
    selectContainer.appendChild(groupFilterSelect);
    container.appendChild(selectContainer);
    
    const resetBtn = document.createElement('button');
    resetBtn.className = 'group-filter-reset';
    resetBtn.textContent = 'Сбросить фильтр';
    resetBtn.addEventListener('click', () => {
      groupFilterSelect.value = "";
      currentSelectedGroup = "";
      const sixth = findScrollBoxByIndex(5);
      if (sixth) {
        const query = customSearchContainer?.querySelector('input')?.value || '';
        loadAndDisplayCustomTemplates(sixth, query, "");
      }
    });
    container.appendChild(resetBtn);
    
    fifth.appendChild(container);
    return true;
  }, 'Ошибка настройки фильтра');
}

// ==================== ШАБЛОНЫ ====================
function createTemplateElement(template, classes) {
  return safelyExecute(() => {
    const div = document.createElement('div');
    div.setAttribute('data-testid', 'reply-template');
    div.className = `${classes.container} custom-template-item`;
    div.style.cssText = 'position:relative;box-sizing:border-box;width:100%;';
    if (isDarkTheme) div.classList.add('dark-theme');
    
    const titleDiv = document.createElement('div');
    titleDiv.className = `${classes.title} custom-template-title-wrapper`;
    titleDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;position:relative;';
    
    const titleSpan = document.createElement('span');
    titleSpan.setAttribute('data-testid', 'reply-title');
    titleSpan.className = classes.name;
    titleSpan.textContent = template.name;
    titleSpan.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block;max-width:70%;';
    titleDiv.appendChild(titleSpan);
    
    if (template.group) {
      const badge = document.createElement('span');
      badge.className = 'template-group-badge';
      badge.textContent = template.group;
      badge.style.cssText = `color:${isDarkTheme ? '#ccc' : '#666'};background:${isDarkTheme ? '#444' : '#f0f0f0'};`;
      titleDiv.appendChild(badge);
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'custom-template-content-wrapper';
    contentDiv.style.position = 'relative';
    
    const bodyDiv = document.createElement('div');
    bodyDiv.setAttribute('data-testid', 'collapsable-text');
    bodyDiv.className = classes.content;
    bodyDiv.textContent = template.body;
    bodyDiv.style.cssText = 'word-wrap:break-word;overflow-wrap:break-word;position:relative;';
    contentDiv.appendChild(bodyDiv);
    
    div.appendChild(titleDiv);
    div.appendChild(contentDiv);
    
    div.addEventListener('click', () => {
      const field = findEditableField();
      if (field) {
        insertTextIntoDraftEditor(template.body, field);
        setTimeout(() => {
          findCorrectCloseButton()?.click();
          setTimeout(resetExtensionState, 100);
        }, 100);
      }
    });
    
    return div;
  }, 'Ошибка создания шаблона');
}

function loadAndDisplayCustomTemplates(container, searchQuery = '', groupFilter = '') {
  safelyExecute(() => {
    detectTheme();
    const classes = getTemplateClasses();
    const thisLoadingId = ++currentLoadingId;
    
    while (container.firstChild) container.removeChild(container.firstChild);
    container.style.clear = 'both';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-templates-wrapper';
    if (isDarkTheme) wrapper.classList.add('dark-theme');
    container.appendChild(wrapper);
    
    chrome.storage.local.get(['templates'], (result) => {
      if (thisLoadingId !== currentLoadingId) return;
      
      let templates = result.templates || [];
      if (groupFilter) templates = templates.filter(t => t.group === groupFilter);
      const filtered = searchQuery ? exactSearch(searchQuery, templates) : templates;
      
      while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
      
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = `${classes.container} custom-template-item`;
        empty.innerHTML = `
          <div class="${classes.title} custom-template-title-wrapper">
            <span class="${classes.name}">${searchQuery || groupFilter ? 'Ничего не найдено' : 'Нет шаблонов'}</span>
          </div>
          <div class="custom-template-content-wrapper">
            <div class="${classes.content}">${searchQuery ? 'Измените запрос' : groupFilter ? 'Измените фильтр' : 'Создайте шаблоны'}</div>
          </div>
        `;
        wrapper.appendChild(empty);
        return;
      }
      
      filtered.forEach(t => wrapper.appendChild(createTemplateElement(t, classes)));
    });
  }, 'Ошибка загрузки шаблонов');
}

function switchToAdditionalTab() {
  safelyExecute(() => {
    saveOriginalContent();
    setupFifthScrollBar();
    
    const sixth = findScrollBoxByIndex(5);
    if (sixth) {
      switchToCustomSearch();
      loadAndDisplayCustomTemplates(sixth, '', currentSelectedGroup);
    }
  }, 'Ошибка переключения');
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function initializeWhenReady() {
  if (isInitialized || !settings.omnichatTemplates) return;
  
  safelyExecute(() => {
    const tabsGroup = document.querySelector(SELECTORS.tabsGroup);
    const scrollBox = findScrollBoxByIndex(5);
    
    if (tabsGroup && scrollBox) {
      injectTemplateStyles();
      detectTheme();
      saveOriginalContent();
      addAdditionalButton();
      isInitialized = true;
      observeModalClose();
    }
  }, 'Ошибка инициализации');
}

function init() {
  console.log('Omnichat Templates v7.0');
  
  // Загружаем настройки
  chrome.storage.local.get(['settings'], (result) => {
    settings = result.settings || { omnichatTemplates: true, ttmButton: true };
    
    if (settings.omnichatTemplates) {
      injectTemplateStyles();
      setTimeout(initializeWhenReady, 1000);
      setTimeout(() => { if (!isInitialized) initializeWhenReady(); }, 3000);
    }
  });
}

// ==================== СООБЩЕНИЯ ====================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'insertTemplate') {
    const field = findEditableField();
    if (field) {
      insertTextIntoDraftEditor(request.text, field);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false });
    }
  }
  return true;
});

// ==================== ЗАПУСК ====================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Observer
new MutationObserver(() => {
  if (!isInitialized && settings.omnichatTemplates && document.querySelector(SELECTORS.tabsGroup)) {
    initializeWhenReady();
  }
}).observe(document.body, { childList: true, subtree: true });
