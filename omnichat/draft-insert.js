// omnichat/draft-insert.js — безопасная вставка в Draft.js редактор чата
(function (O) {
  const { SELECTORS } = O;

  O.findChatEditor = function () {
    const editors = document.querySelectorAll(SELECTORS.draftEditorContent);
    for (const editor of editors) {
      if (editor.closest(SELECTORS.modal)) continue;

      const root = editor.closest('.DraftEditor-root');
      const placeholder = root?.querySelector('.public-DraftEditorPlaceholder-inner');
      if (placeholder?.textContent?.includes('Текст сообщения')) return editor;
    }

    for (const editor of editors) {
      if (!editor.closest(SELECTORS.modal)) return editor;
    }
    return null;
  };

  O.findModalCloseButton = function () {
    return O.safelyExecute(() => {
      const modal = O.getModal();
      if (!modal) return null;

      const titleBar = modal.querySelector(SELECTORS.titleModal);
      if (titleBar) {
        const closeInTitle = titleBar.querySelector(SELECTORS.iconContainer);
        if (closeInTitle) return closeInTitle;
      }

      const buttons = modal.querySelectorAll(SELECTORS.iconContainer);
      return buttons[buttons.length - 1] || null;
    }, 'Ошибка поиска кнопки закрытия');
  };

  function moveCaretToEnd(target) {
    const selection = window.getSelection();
    if (!selection) return false;

    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function dispatchInput(target, text) {
    target.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: text
    }));
  }

  O.insertTextIntoDraftEditor = function (text, target) {
    if (!target || !text) return false;

    return O.safelyExecute(() => {
      target.focus();

      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true
      });
      pasteEvent.clipboardData.setData('text/plain', text);
      target.dispatchEvent(pasteEvent);

      if (pasteEvent.defaultPrevented) {
        dispatchInput(target, text);
        return true;
      }

      moveCaretToEnd(target);
      if (document.execCommand('insertText', false, text)) {
        dispatchInput(target, text);
        return true;
      }

      const textSpan = target.querySelector('[data-block="true"] span[data-text="true"]');
      if (textSpan) {
        const prefix = textSpan.textContent || '';
        textSpan.textContent = prefix ? prefix + text : text;
        dispatchInput(target, text);
        return true;
      }

      console.warn('[Omnichat] Не удалось вставить текст в Draft.js');
      return false;
    }, 'Ошибка вставки');
  };

  O.insertTemplateIntoChat = function (text) {
    const closeBtn = O.findModalCloseButton();

    const doInsert = () => {
      const field = O.findChatEditor();
      if (!field) return false;
      O.trackEvent('omnichat_template_insert');
      return O.insertTextIntoDraftEditor(text, field);
    };

    if (closeBtn) {
      closeBtn.click();
      setTimeout(() => doInsert(), 250);
      return true;
    }

    return doInsert();
  };
})(window.OmnichatExt);