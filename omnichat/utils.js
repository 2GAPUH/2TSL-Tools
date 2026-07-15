// omnichat/utils.js — утилиты, тема, аналитика, базовые стили
(function (O) {
  const { state } = O;

  O.isContextValid = function () {
    if (state.contextInvalidated) return false;
    try {
      return Boolean(chrome.runtime?.id);
    } catch (e) {
      return false;
    }
  };

  O.handleContextInvalidated = function () {
    if (state.contextInvalidated) return;
    state.contextInvalidated = true;
    console.warn('[Omnichat] Контекст расширения устарел — обновите страницу Omnichat (F5).');

    if (!document.getElementById('omnichat-ext-reload-hint')) {
      const hint = document.createElement('div');
      hint.id = 'omnichat-ext-reload-hint';
      hint.textContent = '2TSL toolbox: расширение обновлено. Нажмите F5 для продолжения работы.';
      hint.style.cssText = [
        'position:fixed', 'top:12px', 'left:50%', 'transform:translateX(-50%)',
        'z-index:10001', 'padding:10px 16px', 'border-radius:8px',
        'background:#fff3cd', 'color:#664d03', 'border:1px solid #ffecb5',
        'font:14px/1.4 Rostelecom Basis,sans-serif', 'box-shadow:0 4px 12px rgba(0,0,0,.15)'
      ].join(';');
      document.body.appendChild(hint);
    }
  };

  O.storageGet = function (keys) {
    return new Promise((resolve, reject) => {
      if (!O.isContextValid()) {
        O.handleContextInvalidated();
        reject(new Error('Extension context invalidated'));
        return;
      }
      try {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            if (/context invalidated/i.test(chrome.runtime.lastError.message)) {
              O.handleContextInvalidated();
            }
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(result);
        });
      } catch (e) {
        O.handleContextInvalidated();
        reject(e);
      }
    });
  };

  O.storageSet = function (data) {
    return new Promise((resolve, reject) => {
      if (!O.isContextValid()) {
        O.handleContextInvalidated();
        reject(new Error('Extension context invalidated'));
        return;
      }
      try {
        chrome.storage.local.set(data, () => {
          if (chrome.runtime.lastError) {
            if (/context invalidated/i.test(chrome.runtime.lastError.message)) {
              O.handleContextInvalidated();
            }
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        });
      } catch (e) {
        O.handleContextInvalidated();
        reject(e);
      }
    });
  };

  O.sendExtensionMessage = function (message) {
    return new Promise((resolve, reject) => {
      if (!O.isContextValid()) {
        O.handleContextInvalidated();
        reject(new Error('Extension context invalidated'));
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            if (/context invalidated/i.test(chrome.runtime.lastError.message)) {
              O.handleContextInvalidated();
            }
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      } catch (e) {
        O.handleContextInvalidated();
        reject(e);
      }
    });
  };

  O.trackEvent = function (event) {
    if (!O.isContextValid()) return;
    O.sendExtensionMessage({ action: 'trackEvent', event }).catch(() => {});
  };

  O.safelyExecute = function (callback, errorMsg = 'Ошибка') {
    try {
      return callback();
    } catch (e) {
      console.error('[Omnichat]', errorMsg + ':', e);
      return null;
    }
  };

  O.detectTheme = function () {
    return O.safelyExecute(() => {
      const body = document.body;
      if (!body) return state.isDarkTheme;

      const styleAttr = body.getAttribute('style') || '';
      if (styleAttr.includes('color-scheme: dark')) {
        state.isDarkTheme = true;
        return state.isDarkTheme;
      }
      if (styleAttr.includes('color-scheme: light')) {
        state.isDarkTheme = false;
        return state.isDarkTheme;
      }

      const bgColor = window.getComputedStyle(body).backgroundColor;
      const rgb = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgb) {
        state.isDarkTheme = (parseInt(rgb[1], 10) + parseInt(rgb[2], 10) + parseInt(rgb[3], 10)) < 384;
      }
      return state.isDarkTheme;
    }, 'Ошибка определения темы');
  };

  O.injectBaseStyles = function () {
    if (document.getElementById('omnichat-ext-styles')) return;

    const style = document.createElement('style');
    style.id = 'omnichat-ext-styles';
    style.textContent = `
      .omnichat-ext-native-hidden { display: none !important; }
      .omnichat-ext-filter-host {
        padding: 0 16px 16px;
        overflow-y: auto;
      }
      .omnichat-ext-search-host {
        width: 100%;
        padding: 0;
      }
      .omnichat-ext-search-host .omnichat-ext-search-input {
        width: 100%;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 14px;
        border: 1px solid #d0d5dd;
        color: #333;
        background: #fff;
        box-sizing: border-box;
      }
      .omnichat-ext-templates-overlay {
        position: absolute;
        inset: 0;
        overflow-y: auto;
        z-index: 2;
        background: inherit;
        min-height: 240px;
      }
      [data-testid="wrapper-tabs"].omnichat-ext-additional-mode [data-testid="tab-favorites"],
      [data-testid="wrapper-tabs"].omnichat-ext-additional-mode [data-testid="tab-all-template"] {
        pointer-events: auto;
      }

      .custom-templates-wrapper {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        contain: content;
      }
      .custom-template-item {
        padding: 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: background-color 0.2s ease;
        position: relative;
        overflow: hidden;
        contain: layout style;
      }
      .custom-template-item:hover { background-color: rgba(0,0,0,0.05); }
      .dark-theme .custom-template-item:hover { background-color: rgba(255,255,255,0.1); }
      .custom-template-title-wrapper { padding: 0 0 8px 0; }
      .custom-template-content-wrapper { padding: 8px 0 0 0; }
      .group-filter-select {
        width: 100%;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 14px;
        color: #333 !important;
        background: white !important;
        cursor: pointer;
      }
      .group-filter-select option { color: #333 !important; background: white !important; }
      .group-filter-reset {
        width: 100%;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        color: #333;
        background: #f5f5f5;
        margin-top: 8px;
      }
      .group-filter-reset:hover { background: #e9e9e9; }
      .template-group-badge {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 3px;
        margin-left: 8px;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .tsl-ttm-link {
        color: #007bff !important;
        cursor: pointer;
        text-decoration: none;
        transition: all 0.2s ease;
      }
      .tsl-ttm-link:hover {
        color: #0056b3 !important;
        text-decoration: underline;
        background-color: rgba(0, 123, 255, 0.1);
      }
      .dark-theme .tsl-ttm-link { color: #4da3ff !important; }
      .dark-theme .tsl-ttm-link:hover {
        color: #80bdff !important;
        background-color: rgba(77, 163, 255, 0.1);
      }
    `;
    document.head.appendChild(style);
  };

  O.getModal = function () {
    return document.querySelector(O.SELECTORS.modal);
  };

  /**
   * Находит «ряд» нативных контролов поиска (search-template + sorting),
   * не захватывая вкладки и список шаблонов.
   * Важно: в Omnichat 3.26+ старый sc-jBOuCM обёртка стала шире и включала tabs —
   * hideNativeSearchRow тогда скрывал «Дополнительно».
   */
  O.findSearchControlsRow = function (modal, tabsGroup) {
    if (!modal) return null;

    const searchInput = modal.querySelector(O.SELECTORS.searchTemplate);
    if (!searchInput) return null;

    // Идём вверх, пока не упрёмся в предка, который уже содержит вкладки
    let el = searchInput.parentElement;
    let candidate = el;

    while (el && el !== modal) {
      if (tabsGroup && el.contains(tabsGroup)) break;

      const hasSorting = Boolean(el.querySelector(O.SELECTORS.modalSorting));
      const hasSearch = Boolean(el.querySelector(O.SELECTORS.searchTemplate));
      if (hasSearch || hasSorting) candidate = el;

      // Родитель содержит tabs как соседа — candidate = ряд поиска
      const parent = el.parentElement;
      if (parent && tabsGroup && parent.contains(tabsGroup) && !el.contains(tabsGroup)) {
        return el;
      }

      el = parent;
    }

    return candidate;
  };

  O.getModalScrollBoxes = function () {
    const layout = O.getModalLayout();
    return {
      categories: layout?.categories || null,
      templates: layout?.templates || null
    };
  };

  O.isModalReady = function () {
    const layout = O.getModalLayout();
    return Boolean(layout?.tabsGroup && layout?.templates);
  };

  O.getChatMessagesContainer = function () {
    const boxes = document.querySelectorAll(O.SELECTORS.scrollBoxRoot);
    for (const box of boxes) {
      if (box.querySelector(O.SELECTORS.chatMessage)) return box;
    }
    return null;
  };

  O.isExcludedFromLinkProcessing = function (element) {
    if (!element) return true;
    if (element.closest(O.SELECTORS.appealPreview)) return true;
    if (element.closest(O.SELECTORS.modal)) return true;
    if (element.closest('.DraftEditor-root')) return true;
    if (element.closest('[contenteditable="true"]')) return true;
    if (element.closest('[data-omnichat-filter-host]')) return true;
    if (element.closest('[data-omnichat-search-host]')) return true;
    if (element.closest('[data-omnichat-templates-overlay]')) return true;
    if (element.closest('.' + O.CSS.ttmLink)) return true;
    if (element.closest('.' + O.CSS.textWrapper)) return true;
    return false;
  };

  O.getModalLayout = function () {
    const modal = O.getModal();
    if (!modal) return null;

    const tabsGroup = modal.querySelector(O.SELECTORS.tabsGroup);
    const boxes = Array.from(modal.querySelectorAll(O.SELECTORS.scrollBoxRoot));

    // Левая колонка: scroll-box со списком категорий
    const categories = boxes.find((box) => box.querySelector(O.SELECTORS.listElement)) || null;
    // Не title-modal: parent scroll-box-а со списком
    let categoriesCol = categories?.parentElement || null;
    if (categoriesCol?.closest?.(O.SELECTORS.titleModal)) {
      categoriesCol = categories?.parentElement?.parentElement || categoriesCol;
    }

    // Правая колонка: scroll-box сразу после вкладок, иначе со списком reply-template
    let templates = null;
    if (tabsGroup) {
      let sibling = tabsGroup.nextElementSibling;
      while (sibling) {
        if (sibling.id === 'scroll-box-root' || sibling.matches?.(O.SELECTORS.scrollBoxRoot)) {
          templates = sibling;
          break;
        }
        sibling = sibling.nextElementSibling;
      }
    }

    if (!templates) {
      templates = boxes.find((box) =>
        box !== categories && (
          box.querySelector(O.SELECTORS.replyTemplate) ||
          box.querySelector('[data-omnichat-templates-overlay]')
        )
      ) || null;
    }

    if (!templates) {
      templates = boxes.filter((box) => box !== categories).pop() || null;
    }

    const searchRow = O.findSearchControlsRow(modal, tabsGroup);

    return {
      modal,
      categoriesCol,
      searchRow,
      tabsGroup,
      categories,
      templates
    };
  };

  O.getSidebarAccountPanels = function () {
    const panels = [];
    const seen = new Set();

    document.querySelectorAll('span').forEach((span) => {
      const title = span.textContent?.trim();
      if (!O.SIDEBAR_ACCOUNT_PANEL_TITLES.includes(title)) return;

      const panel = span.closest('.sc-iViqLm') || span.closest('.sc-bGPiPG') || span.closest('.sc-bHduTz')?.parentElement;
      if (!panel || seen.has(panel)) return;
      seen.add(panel);
      panels.push(panel);
    });

    return panels;
  };

  O.getLinkProcessingRoots = function () {
    const roots = [];
    const chat = O.getChatMessagesContainer();
    if (chat) roots.push(chat);
    O.getSidebarAccountPanels().forEach((panel) => roots.push(panel));
    return roots;
  };

  O.isInAllowedLinkRoot = function (element) {
    if (!element) return false;
    return O.getLinkProcessingRoots().some((root) => root.contains(element));
  };

  O.exactSearch = function (query, items) {
    if (!query) return items;
    const lower = query.toLowerCase();
    return items.filter((item) =>
      item.name.toLowerCase().includes(lower) ||
      item.body.toLowerCase().includes(lower)
    );
  };
})(window.OmnichatExt);