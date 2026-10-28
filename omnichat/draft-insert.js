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

  const TEMPLATE_IMAGE_MAX_CHARS = 550000;

  O.isTemplateImage = function (value) {
    if (typeof value !== 'string') return false;
    if (value.length < 32 || value.length > TEMPLATE_IMAGE_MAX_CHARS) return false;
    return /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  };

  function safeTemplateFileName(name, mime) {
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'jpg';
    const base = String(name || 'image').split(/[/\\]/).pop().replace(/\.(jpe?g|png|webp|gif)$/i, '').slice(0, 60);
    const clean = base.replace(/[^\w.\- ()\u0400-\u04FF]+/g, '_') || 'image';
    return `${clean}.${ext}`;
  }

  O.templateImageToFile = function (dataUrl, imageName) {
    if (!O.isTemplateImage(dataUrl)) return null;
    const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    if (!match) return null;
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], safeTemplateFileName(imageName, match[1]), { type: match[1] });
  };

  // Композер: кнопка data-testid=attachment-file и соседний input[type=file].
  // Input внутри модалки шаблонов не берём.
  O.findComposerFileInput = function () {
    const buttons = document.querySelectorAll('[data-testid="attachment-file"]');
    for (const btn of buttons) {
      if (btn.closest(SELECTORS.modal)) continue;
      const next = btn.nextElementSibling;
      if (next && next.matches && next.matches('input[type="file"]')) return next;
      const input = btn.parentElement && btn.parentElement.querySelector('input[type="file"]');
      if (input && !input.closest(SELECTORS.modal)) return input;
    }
    return null;
  };

  function assignComposerFiles(input, file) {
    const transfer = new DataTransfer();
    if (input.multiple && input.files) {
      for (const existing of input.files) transfer.items.add(existing);
    }
    transfer.items.add(file);
    // React может проглотить change, если внутренний tracker не сбросить.
    if (input._valueTracker) input._valueTracker.setValue('');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function pasteImageIntoEditor(file) {
    const field = O.findChatEditor();
    if (!field) return false;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: transfer,
      bubbles: true,
      cancelable: true
    });
    field.focus();
    field.dispatchEvent(pasteEvent);
    return true;
  }

  O.attachImageToChat = function (dataUrl, imageName) {
    const file = O.templateImageToFile(dataUrl, imageName);
    if (!file) return false;
    const input = O.findComposerFileInput();
    if (input) {
      try {
        assignComposerFiles(input, file);
        return true;
      } catch (e) {
        console.warn('[Omnichat] Не удалось вложить файл через кнопку, пробую вставку', e);
      }
    }
    return pasteImageIntoEditor(file);
  };

  O.insertTemplateIntoChat = function (text, image, imageName) {
    const closeBtn = O.findModalCloseButton();

    const doInsert = () => {
      const field = O.findChatEditor();
      if (!field) return false;
      O.trackEvent('omnichat_template_insert');
      const ok = O.insertTextIntoDraftEditor(text, field);
      if (image) setTimeout(() => O.attachImageToChat(image, imageName), 80);
      return ok;
    };

    if (closeBtn) {
      closeBtn.click();
      setTimeout(() => doInsert(), 250);
      return true;
    }

    return doInsert();
  };
})(window.OmnichatExt);