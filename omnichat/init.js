// omnichat/init.js — запуск модуля, настройки, сообщения расширения
(function (O) {
  const { state, SELECTORS } = O;

  function init() {
    console.log('[Omnichat] v9.2 — стабильные селекторы модалки (без sc-*)');

    if (!O.isContextValid()) {
      O.handleContextInvalidated();
      return;
    }

    O.storageGet(['settings']).then((result) => {
      state.settings = result.settings || {
        omnichatTemplates: true,
        ttmButton: true,
        omnichatTTMLinks: true
      };

      if (state.settings.omnichatTemplates) {
        O.injectBaseStyles();
        setTimeout(O.initializeTemplatesModal, 1000);
        setTimeout(() => {
          if (!state.isInitialized) O.initializeTemplatesModal();
        }, 3000);
      }

      if (state.settings.omnichatTTMLinks) {
        O.initTTMLinks();
      }
    }).catch(() => {});
  }

  if (O.isContextValid()) {
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (!O.isContextValid()) return;
        if (area !== 'local' || !changes.settings) return;

        const oldSettings = state.settings;
        state.settings = changes.settings.newValue || state.settings;

        if (oldSettings.omnichatTemplates && !state.settings.omnichatTemplates) {
          O.disableOmnichatTemplates();
        }

        if (!oldSettings.omnichatTemplates && state.settings.omnichatTemplates) {
          setTimeout(O.initializeTemplatesModal, 500);
        }

        if (oldSettings.omnichatTTMLinks && !state.settings.omnichatTTMLinks) {
          O.disableTTMLinks();
        }

        if (!oldSettings.omnichatTTMLinks && state.settings.omnichatTTMLinks) {
          O.initTTMLinks();
        }
      });
    } catch (e) {
      O.handleContextInvalidated();
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!O.isContextValid()) {
      sendResponse({ success: false, error: 'context_invalidated' });
      return true;
    }

    if (request.action === 'insertTemplate') {
      const field = O.findChatEditor();
      if (field && O.insertTextIntoDraftEditor(request.text, field)) {
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false });
      }
    }
    return true;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  new MutationObserver(() => {
    if (!O.isContextValid()) return;
    if (!state.isInitialized && state.settings.omnichatTemplates && document.querySelector(SELECTORS.tabsGroup)) {
      O.initializeTemplatesModal();
    }
  }).observe(document.body, { childList: true, subtree: true });
})(window.OmnichatExt);