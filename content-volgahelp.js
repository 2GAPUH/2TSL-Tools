// content-volgahelp.js
// Интеграция https://volgahelp.ru/tag_api/comments/ с 2TSL toolbox

const DRAFT_FIELD_IDS = ['issue', 'actions', 'conclusion', 'diagnostics', 'other'];
const RESIZABLE_FIELD_IDS = [...DRAFT_FIELD_IDS, 'output'];
const SAVE_DEBOUNCE_MS = 500;
const FIELD_HEIGHT_SAVE_DEBOUNCE_MS = 400;
const WINDOW_LAYOUT_SAVE_DEBOUNCE_MS = 400;
const TAG_SELECT_MAX_WAIT_MS = 15000;
const MAX_DRAFTS = 100;
const MIN_FIELD_HEIGHT = 48;
const DEFAULT_WINDOW_LAYOUT = { width: 960, height: 900 };

let activeTicket = '';
let saveTimer = null;
let fieldHeightSaveTimer = null;
let windowLayoutSaveTimer = null;

function trackEvent(event) {
  try {
    chrome.runtime.sendMessage({ action: 'trackEvent', event });
  } catch (e) { /* service worker недоступен */ }
}

function safelyExecute(callback, errorMsg = 'Ошибка') {
  try { return callback(); }
  catch (e) { console.error(errorMsg + ':', e); return null; }
}

function getDraftFromForm() {
  const tagSelect = document.getElementById('tagSelect');
  return {
    checkbox_changes: !!document.getElementById('checkbox_changes')?.checked,
    tagSelect: tagSelect?.value || '',
    issue: document.getElementById('issue')?.value || '',
    actions: document.getElementById('actions')?.value || '',
    conclusion: document.getElementById('conclusion')?.value || '',
    diagnostics: document.getElementById('diagnostics')?.value || '',
    other: document.getElementById('other')?.value || '',
    updatedAt: Date.now()
  };
}

function applyDraft(draft) {
  if (!draft) return;

  const checkbox = document.getElementById('checkbox_changes');
  if (checkbox) checkbox.checked = !!draft.checkbox_changes;

  if (draft.tagSelect) {
    const tagSelect = document.getElementById('tagSelect');
    if (tagSelect) {
      const hasOption = Array.from(tagSelect.options).some(opt => opt.value === draft.tagSelect);
      if (hasOption) {
        tagSelect.value = draft.tagSelect;
        tagSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  DRAFT_FIELD_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el && draft[id] != null) el.value = draft[id];
  });
}

function pruneDrafts(drafts) {
  const entries = Object.entries(drafts);
  if (entries.length <= MAX_DRAFTS) return drafts;

  entries.sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0));
  const pruned = {};
  entries.slice(0, MAX_DRAFTS).forEach(([key, value]) => {
    pruned[key] = value;
  });
  return pruned;
}

function saveDraftNow() {
  if (!activeTicket) return;

  chrome.storage.local.get(['volgaHelpDrafts'], (result) => {
    const drafts = result.volgaHelpDrafts || {};
    drafts[activeTicket] = getDraftFromForm();
    chrome.storage.local.set({ volgaHelpDrafts: pruneDrafts(drafts) });
  });
}

function scheduleSave() {
  if (!activeTicket) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraftNow, SAVE_DEBOUNCE_MS);
}

function removeDraft(ticketNumber) {
  if (!ticketNumber) return;
  chrome.storage.local.get(['volgaHelpDrafts'], (result) => {
    const drafts = result.volgaHelpDrafts || {};
    if (!drafts[ticketNumber]) return;
    delete drafts[ticketNumber];
    chrome.storage.local.set({ volgaHelpDrafts: drafts });
  });
}

function waitForTagSelectReady() {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      const select = document.getElementById('tagSelect');
      if (select && select.options.length > 1) {
        resolve(select);
        return;
      }
      if (Date.now() - startedAt > TAG_SELECT_MAX_WAIT_MS) {
        resolve(select || null);
        return;
      }
      setTimeout(check, 200);
    };
    check();
  });
}

function buildCopyText() {
  let output = '';

  const checkbox = document.getElementById('checkbox_changes');
  if (checkbox?.checked) {
    output += '#ХолостойНа2ЛТП\n\n';
  }

  const tagSelect = document.getElementById('tagSelect');
  const selectedTag = tagSelect?.options[tagSelect.selectedIndex]?.text?.trim();
  if (selectedTag && tagSelect?.selectedIndex > 0) {
    output += `#${selectedTag}\n\n`;
  }

  const fields = [
    ['1. С чем обратился абонент?', 'issue'],
    ['2. Что было сделано для решения сложности?', 'actions'],
    ['3. Ваше техническое заключение', 'conclusion'],
    ['4. Диагностика из ЕПД и других систем', 'diagnostics'],
    ['5. Другая важная информация', 'other']
  ];

  fields.forEach(([label, id]) => {
    const value = document.getElementById(id)?.value?.trim() || '';
    if (value) {
      output += `✅ ${label}\n${value}\n\n`;
    } else {
      output += `❌ ${label}\n(Поле не заполнено)\n\n`;
    }
  });

  return output.trimEnd();
}

function hookCopyButton() {
  const buttons = document.querySelectorAll('button.btn-rt');
  buttons.forEach((btn) => {
    if (!btn.textContent?.includes('Скопировать')) return;

    btn.addEventListener('click', () => {
      setTimeout(() => {
        safelyExecute(() => {
          const outputBox = document.getElementById('output');
          const text = outputBox?.value?.trim() || buildCopyText();
          if (!text || !activeTicket) return;

          chrome.storage.local.get(['volgaHelpSession'], (result) => {
            const session = result.volgaHelpSession || {};
            chrome.runtime.sendMessage({
              action: 'volgaHelpCopied',
              text,
              ticketNumber: activeTicket,
              commentEditorQaId: session.commentEditorQaId || ''
            }, () => {
              trackEvent('ttm_comment_builder_copy');
              window.close();
            });
          });
        }, 'Ошибка отправки скопированного комментария');
      }, 0);
    }, true);
  });
}

function hookClearButton() {
  const buttons = document.querySelectorAll('button.btn-outline-secondary');
  buttons.forEach((btn) => {
    if (!btn.textContent?.includes('Очистить')) return;
    btn.addEventListener('click', () => {
      setTimeout(() => removeDraft(activeTicket), 0);
    }, true);
  });
}

function clampWindowSize(width, height) {
  const maxWidth = Math.max(640, screen.availWidth - 40);
  const maxHeight = Math.max(500, screen.availHeight - 40);
  return {
    width: Math.min(Math.max(width, 640), maxWidth),
    height: Math.min(Math.max(height, 500), maxHeight)
  };
}

function saveWindowLayoutNow() {
  const size = clampWindowSize(window.outerWidth, window.outerHeight);
  chrome.storage.local.set({ volgaHelpWindowLayout: size });
}

function scheduleWindowLayoutSave() {
  clearTimeout(windowLayoutSaveTimer);
  windowLayoutSaveTimer = setTimeout(saveWindowLayoutNow, WINDOW_LAYOUT_SAVE_DEBOUNCE_MS);
}

function applyWindowLayout(layout) {
  const source = layout || DEFAULT_WINDOW_LAYOUT;
  const { width, height } = clampWindowSize(source.width, source.height);
  const left = Math.max(0, Math.round((screen.availLeft + screen.availWidth - width) / 2));
  const top = Math.max(0, Math.round((screen.availTop + screen.availHeight - height) / 2));

  try {
    window.resizeTo(width, height);
    window.moveTo(left, top);
  } catch (e) {
    console.warn('[2TSL] Не удалось применить размер окна:', e);
  }
}

function setupWindowLayoutPersistence() {
  chrome.storage.local.get(['volgaHelpWindowLayout'], (result) => {
    applyWindowLayout(result.volgaHelpWindowLayout);
  });

  window.addEventListener('resize', scheduleWindowLayoutSave);
  window.addEventListener('pagehide', saveWindowLayoutNow);
}

function applyFieldHeights(heights) {
  if (!heights) return;

  RESIZABLE_FIELD_IDS.forEach((id) => {
    const el = document.getElementById(id);
    const height = heights[id];
    if (el && height >= MIN_FIELD_HEIGHT) {
      el.style.boxSizing = 'border-box';
      el.style.resize = 'vertical';
      el.style.minHeight = `${MIN_FIELD_HEIGHT}px`;
      el.style.height = `${height}px`;
    }
  });
}

function collectFieldHeights() {
  const heights = {};
  RESIZABLE_FIELD_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) heights[id] = el.offsetHeight;
  });
  return heights;
}

function scheduleFieldHeightSave() {
  clearTimeout(fieldHeightSaveTimer);
  fieldHeightSaveTimer = setTimeout(() => {
    chrome.storage.local.set({ volgaHelpFieldHeights: collectFieldHeights() });
  }, FIELD_HEIGHT_SAVE_DEBOUNCE_MS);
}

function setupFieldHeightPersistence() {
  RESIZABLE_FIELD_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    el.style.resize = 'vertical';
    const observer = new ResizeObserver(() => scheduleFieldHeightSave());
    observer.observe(el);
  });
}

function initFieldHeights() {
  chrome.storage.local.get(['volgaHelpFieldHeights'], (result) => {
    applyFieldHeights(result.volgaHelpFieldHeights);
    setupFieldHeightPersistence();
  });
}

function setupAutoSave() {
  const checkbox = document.getElementById('checkbox_changes');
  if (checkbox) checkbox.addEventListener('change', scheduleSave);

  const tagSelect = document.getElementById('tagSelect');
  if (tagSelect) tagSelect.addEventListener('change', scheduleSave);

  DRAFT_FIELD_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', scheduleSave);
  });
}

async function initSession() {
  chrome.storage.local.get(['volgaHelpSession', 'volgaHelpDrafts'], async (result) => {
    const session = result.volgaHelpSession;
    if (!session?.ticketNumber) return;

    activeTicket = String(session.ticketNumber);
    await waitForTagSelectReady();

    const draft = result.volgaHelpDrafts?.[activeTicket];
    applyDraft(draft);

    setupAutoSave();
    hookCopyButton();
    hookClearButton();
  });
}

function init() {
  setupWindowLayoutPersistence();
  initFieldHeights();
  initSession();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}