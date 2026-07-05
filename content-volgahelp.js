// content-volgahelp.js
// Интеграция https://volgahelp.ru/tag_api/comments/ с 2TSL toolbox

const DRAFT_FIELD_IDS = ['issue', 'actions', 'conclusion', 'diagnostics', 'other'];
const SAVE_DEBOUNCE_MS = 500;
const TAG_SELECT_MAX_WAIT_MS = 15000;
const MAX_DRAFTS = 100;

let activeTicket = '';
let saveTimer = null;

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
            });
            trackEvent('ttm_comment_builder_copy');
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

async function init() {
  if (window.self === window.top) return;

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}