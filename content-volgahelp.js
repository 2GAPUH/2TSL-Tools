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

const TTM_CLIENT_KEY = 'ttmClientByNls';
const SNIPPETS_KEY = 'volgaHelpQuickSnippets';
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 минут
const SNIPPET_PREVIEW_LEN = 48;

const FIELD_LABELS = {
  issue: '1. С чем обратился абонент?',
  actions: '2. Что было сделано для решения сложности?',
  conclusion: '3. Ваше техническое заключение',
  diagnostics: '4. Диагностика из ЕПД и других систем',
  other: '5. Другая важная информация'
};

let activeTicket = '';
let activeNls = '';
let saveTimer = null;
let fieldHeightSaveTimer = null;
let windowLayoutSaveTimer = null;
let autofillEnabled = true;
let openDropdown = null; // { menu, btn, onDocClick }
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
    // legacy volgahelp: переименовать и надёжная отправка (наш текст, не native output)
    try {
      if (btn.textContent.includes('Скопировать всё')) {
        btn.textContent = btn.textContent.replace('Скопировать всё', 'Скопировать и вставить');
      }
    } catch (e) { /* ignore */ }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      safelyExecute(() => {
        const text = buildCopyText();
        if (!text || !activeTicket) return;
        const outputBox = document.getElementById('output');
        if (outputBox) outputBox.value = text;

        chrome.storage.local.get(['volgaHelpSession'], (result) => {
          const session = result.volgaHelpSession || {};
          chrome.runtime.sendMessage({
            action: 'commentBuilderPaste',
            text,
            ticketNumber: activeTicket,
            commentEditorQaId: session.commentEditorQaId || ''
          }, () => {
            void chrome.runtime.lastError;
            trackEvent('ttm_comment_builder_copy');
            setTimeout(() => {
              try { window.close(); } catch (err) { /* ignore */ }
            }, 300);
          });
        });
      }, 'Ошибка отправки скопированного комментария');
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

// ==================== АВТОЗАПОЛНЕНИЕ (только телефон из TTM; ЕПД отключён) ====================

function isCacheFresh(entry) {
  if (!entry || !entry.updatedAt) return false;
  return Date.now() - entry.updatedAt < CACHE_TTL_MS;
}

function setFieldValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return false;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function appendFieldValue(id, value) {
  const el = document.getElementById(id);
  if (!el || !value) return false;
  const cur = el.value || '';
  const next = cur
    ? (cur.endsWith('\n') || cur.endsWith(' ') ? cur + value : cur + '\n' + value)
    : value;
  el.value = next;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function applyPhoneFromMap(ttmMap, opts) {
  const force = !!opts?.force;
  const nls = String(activeNls || '').replace(/\s+/g, '');
  if (!nls) return false;

  const clientEntry = ttmMap?.[nls];
  let phoneLine = '';
  if (isCacheFresh(clientEntry)) {
    phoneLine = String(clientEntry.phoneLine || '').trim();
    if (!phoneLine && clientEntry.phone) {
      phoneLine = `Контакт для дозвона: ${String(clientEntry.phone).replace(/\D/g, '')}`;
    }
  }
  const otherEl = document.getElementById('other');
  if (!otherEl) return false;
  if (force) {
    setFieldValue('other', phoneLine || '');
    return !!phoneLine;
  }
  if (phoneLine && !otherEl.value.trim()) {
    setFieldValue('other', phoneLine);
    return true;
  }
  return false;
}

/** @param {boolean} force */
function loadAndApplyAutofill(force) {
  return new Promise((resolve) => {
    chrome.storage.local.get([TTM_CLIENT_KEY, 'settings'], async (result) => {
      const settings = result.settings || {};
      autofillEnabled = settings.ttmCommentBuilderAutofill !== false
        && settings.ttmCommentBuilder !== false;

      if (!autofillEnabled && !force) {
        resolve({ phone: false, reason: 'disabled' });
        return;
      }

      const nls = String(activeNls || '').replace(/\s+/g, '');
      if (force && nls) {
        await new Promise((r) => {
          chrome.runtime.sendMessage(
            { action: 'refreshCommentBuilderSources', nls },
            () => {
              void chrome.runtime.lastError;
              r();
            }
          );
        });
      }

      chrome.storage.local.get([TTM_CLIENT_KEY], (r2) => {
        const phoneOk = applyPhoneFromMap(r2[TTM_CLIENT_KEY] || result[TTM_CLIENT_KEY] || {}, {
          force: !!force
        });
        if (phoneOk) scheduleSave();
        resolve({ phone: phoneOk });
      });
    });
  });
}

function showToast(message, isError) {
  const existing = document.getElementById('tsl-volga-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'tsl-volga-toast';
  toast.textContent = message;
  toast.style.cssText = [
    'position:fixed',
    'bottom:16px',
    'right:16px',
    'z-index:100000',
    'max-width:320px',
    'padding:10px 14px',
    'border-radius:8px',
    'font-size:13px',
    'line-height:1.35',
    'box-shadow:0 4px 16px rgba(0,0,0,.35)',
    isError
      ? 'background:#5c1a1a;color:#ffd0d0;border:1px solid #a33'
      : 'background:#1e2a44;color:#e8eefc;border:1px solid #3d5a99',
    'opacity:0',
    'transition:opacity .2s ease'
  ].join(';');

  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 2600);
}

function injectToolbarStyles() {
  if (document.getElementById('tsl-volga-styles')) return;
  const style = document.createElement('style');
  style.id = 'tsl-volga-styles';
  style.textContent = `
    /* Фикс тёмного текста на тёмном фоне (баговая тема volgahelp / bootstrap) */
    body.container,
    body {
      color: #f1f1f1 !important;
    }
    textarea.form-control,
    textarea#output,
    textarea#issue,
    textarea#actions,
    textarea#conclusion,
    textarea#diagnostics,
    textarea#other,
    select.form-select,
    select#tagSelect,
    #output {
      background-color: #2c2c3c !important;
      color: #ffffff !important;
      -webkit-text-fill-color: #ffffff !important;
      caret-color: #ffffff !important;
      border-color: #555 !important;
    }
    textarea.form-control:disabled,
    textarea.form-control[readonly],
    textarea:disabled,
    textarea[readonly],
    select:disabled,
    #output[readonly] {
      background-color: #252536 !important;
      color: #e8e8f0 !important;
      -webkit-text-fill-color: #e8e8f0 !important;
      opacity: 1 !important;
    }
    textarea.form-control::placeholder,
    textarea::placeholder,
    #output::placeholder {
      color: #b0b0c0 !important;
      opacity: 1 !important;
      -webkit-text-fill-color: #b0b0c0 !important;
    }
    textarea.form-control::-webkit-input-placeholder { color: #b0b0c0 !important; opacity: 1 !important; }
    textarea.form-control::-moz-placeholder { color: #b0b0c0 !important; opacity: 1 !important; }
    .form-label,
    label.form-label,
    label {
      color: #e0e0e0 !important;
    }
    .form-select,
    select#tagSelect {
      color: #ffffff !important;
      -webkit-text-fill-color: #ffffff !important;
      background-color: #2c2c3c !important;
    }
    .form-select option,
    select#tagSelect option {
      background-color: #2c2c3c;
      color: #ffffff;
    }
    /* Состояние загрузки диагностики */
    textarea#diagnostics.tsl-diag-loading {
      color: #c8d0e8 !important;
      -webkit-text-fill-color: #c8d0e8 !important;
      font-style: italic;
    }

    .tsl-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 1.5rem;
    }
    .tsl-title-row h2 {
      margin-bottom: 0 !important;
      flex: 1;
      min-width: 0;
    }
    .tsl-sync-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      border: 1px solid #555;
      background: #2c2c3c;
      color: #e8eefc;
      cursor: pointer;
      padding: 0;
      flex-shrink: 0;
    }
    .tsl-sync-btn:hover { background: #3a3a50; border-color: #7C3AED; }
    .tsl-sync-btn:disabled { opacity: .5; cursor: wait; }
    .tsl-sync-btn svg { width: 18px; height: 18px; display: block; }
    .tsl-sync-btn.spinning svg { animation: tsl-spin .8s linear infinite; }
    @keyframes tsl-spin { to { transform: rotate(360deg); } }

    .tsl-field-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .tsl-field-row .tsl-field-main {
      flex: 1;
      min-width: 0;
    }
    /* Кнопка шаблонов на уровне textarea, не label */
    .tsl-snippet-wrap {
      position: relative;
      flex: 0 0 auto;
      margin-top: 0;
      align-self: flex-start;
      padding-top: 0;
    }
    .tsl-snippet-btn {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: 1px solid #555;
      background: #2c2c3c;
      color: #e0e0e0;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      font-size: 14px;
      line-height: 1;
    }
    .tsl-snippet-btn:hover { border-color: #7C3AED; color: #fff; }
    .tsl-snippet-menu {
      position: absolute;
      left: 0;
      top: 32px;
      z-index: 10000;
      min-width: 220px;
      max-width: min(360px, 70vw);
      max-height: 280px;
      overflow: auto;
      background: #252536;
      border: 1px solid #555;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,.4);
      padding: 4px 0;
    }
    .tsl-snippet-item {
      display: flex;
      align-items: stretch;
      gap: 0;
      border-bottom: 1px solid rgba(255,255,255,.06);
    }
    .tsl-snippet-item:last-of-type { border-bottom: none; }
    .tsl-snippet-pick {
      flex: 1;
      min-width: 0;
      text-align: left;
      background: transparent;
      border: none;
      color: #f1f1f1;
      padding: 8px 10px;
      cursor: pointer;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tsl-snippet-pick:hover { background: rgba(124, 58, 237, .25); }
    .tsl-snippet-del {
      flex: 0 0 auto;
      width: 34px;
      border: none;
      background: transparent;
      color: #c88;
      cursor: pointer;
      font-size: 14px;
    }
    .tsl-snippet-del:hover { background: rgba(180,40,40,.25); color: #f99; }
    .tsl-snippet-add {
      display: block;
      width: 100%;
      border: none;
      border-top: 1px solid #444;
      background: transparent;
      color: #9ec5fe;
      padding: 9px 10px;
      text-align: left;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }
    .tsl-snippet-add:hover { background: rgba(29, 78, 216, .2); }
    .tsl-snippet-empty {
      padding: 8px 10px;
      color: #999;
      font-size: 12px;
    }
  `;
  document.head.appendChild(style);
}

function createSyncButton() {
  injectToolbarStyles();

  const h2 = document.querySelector('h2');
  if (!h2) return;

  // Заголовок + sync в одной строке справа от названия
  let titleRow = h2.closest('.tsl-title-row');
  if (!titleRow) {
    titleRow = document.createElement('div');
    titleRow.className = 'tsl-title-row';
    h2.parentNode.insertBefore(titleRow, h2);
    titleRow.appendChild(h2);
  }

  if (titleRow.querySelector('.tsl-sync-btn')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tsl-sync-btn';
  btn.tabIndex = -1; // Tab только по полям формы
  btn.title = 'Синхронизировать диагностику ЕПД и контакт из TTM';
  btn.setAttribute('aria-label', 'Синхронизировать данные');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
      <polyline points="21 3 21 9 15 9"/>
    </svg>
  `;

  btn.addEventListener('click', async () => {
    if (!activeNls) {
      showToast('НЛС не передан из TTM — откройте конструктор с карточки заявки', true);
      return;
    }

    btn.disabled = true;
    btn.classList.add('spinning');

    try {
      const applied = await loadAndApplyAutofill(true);
      trackEvent('ttm_comment_builder_sync');

      if (applied.phone) {
        showToast('Контакт из TTM обновлён');
      } else {
        showToast(
          'Контакт не найден. Откройте карточку заявки в TTM',
          true
        );
      }
    } catch (e) {
      showToast('Ошибка синхронизации', true);
      console.error('[2TSL volgahelp] sync', e);
    } finally {
      btn.disabled = false;
      btn.classList.remove('spinning');
    }
  });

  titleRow.appendChild(btn);
}

// ==================== БЫСТРЫЕ ШАБЛОНЫ ====================

function closeOpenDropdown() {
  if (!openDropdown) return;
  document.removeEventListener('mousedown', openDropdown.onDocClick, true);
  openDropdown.menu.remove();
  openDropdown = null;
}

function previewSnippet(text) {
  const one = String(text || '').replace(/\s+/g, ' ').trim();
  if (one.length <= SNIPPET_PREVIEW_LEN) return one;
  return one.slice(0, SNIPPET_PREVIEW_LEN - 1) + '…';
}

function loadSnippetsMap(cb) {
  chrome.storage.local.get([SNIPPETS_KEY], (result) => {
    const map = result[SNIPPETS_KEY] && typeof result[SNIPPETS_KEY] === 'object'
      ? result[SNIPPETS_KEY]
      : {};
    cb(map);
  });
}

function saveSnippetsMap(map, cb) {
  chrome.storage.local.set({ [SNIPPETS_KEY]: map }, () => {
    if (cb) cb();
  });
}

function uid() {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function openSnippetMenu(fieldId, anchorBtn) {
  closeOpenDropdown();

  loadSnippetsMap((map) => {
    const list = Array.isArray(map[fieldId]) ? map[fieldId] : [];

    const menu = document.createElement('div');
    menu.className = 'tsl-snippet-menu';
    menu.setAttribute('role', 'menu');

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'tsl-snippet-empty';
      empty.textContent = 'Нет шаблонов';
      menu.appendChild(empty);
    } else {
      list.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'tsl-snippet-item';

        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'tsl-snippet-pick';
        pick.tabIndex = -1;
        pick.textContent = previewSnippet(item.text);
        pick.title = item.text;
        pick.addEventListener('click', () => {
          appendFieldValue(fieldId, item.text);
          scheduleSave();
          trackEvent('volga_snippet_insert');
          closeOpenDropdown();
        });

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'tsl-snippet-del';
        del.tabIndex = -1;
        del.title = 'Удалить шаблон';
        del.setAttribute('aria-label', 'Удалить');
        del.textContent = '×';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!confirm('Удалить этот шаблон?')) return;
          loadSnippetsMap((fresh) => {
            const arr = Array.isArray(fresh[fieldId]) ? fresh[fieldId] : [];
            fresh[fieldId] = arr.filter((x) => x.id !== item.id);
            saveSnippetsMap(fresh, () => {
              trackEvent('volga_snippet_delete');
              closeOpenDropdown();
              // Переоткрыть обновлённое меню
              openSnippetMenu(fieldId, anchorBtn);
            });
          });
        });

        row.appendChild(pick);
        row.appendChild(del);
        menu.appendChild(row);
      });
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'tsl-snippet-add';
    addBtn.tabIndex = -1;
    addBtn.textContent = '+ Добавить';
    addBtn.addEventListener('click', () => {
      const text = prompt('Текст шаблона:');
      if (text == null) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      loadSnippetsMap((fresh) => {
        if (!Array.isArray(fresh[fieldId])) fresh[fieldId] = [];
        fresh[fieldId].push({ id: uid(), text: trimmed });
        saveSnippetsMap(fresh, () => {
          trackEvent('volga_snippet_add');
          closeOpenDropdown();
          openSnippetMenu(fieldId, anchorBtn);
        });
      });
    });
    menu.appendChild(addBtn);

    const wrap = anchorBtn.closest('.tsl-snippet-wrap') || anchorBtn.parentElement;
    wrap.appendChild(menu);

    const onDocClick = (e) => {
      if (menu.contains(e.target) || anchorBtn.contains(e.target)) return;
      closeOpenDropdown();
    };
    setTimeout(() => {
      document.addEventListener('mousedown', onDocClick, true);
    }, 0);

    openDropdown = { menu, btn: anchorBtn, onDocClick };
  });
}

function setupSnippetButtons() {
  injectToolbarStyles();

  DRAFT_FIELD_IDS.forEach((fieldId) => {
    const textarea = document.getElementById(fieldId);
    if (!textarea) return;

    // Уже обёрнуто
    if (textarea.closest('.tsl-field-row')) return;

    const block = textarea.closest('.mb-3') || textarea.parentElement;
    if (!block) return;

    const label = block.querySelector('label');
    // label остаётся сверху; ряд «кнопка | textarea» — кнопка на уровне поля
    const row = document.createElement('div');
    row.className = 'tsl-field-row';

    const wrap = document.createElement('div');
    wrap.className = 'tsl-snippet-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tsl-snippet-btn';
    btn.tabIndex = -1; // Tab: issue → actions → … без кнопок
    btn.title = 'Быстрые шаблоны';
    btn.setAttribute('aria-label', 'Быстрые шаблоны для: ' + (FIELD_LABELS[fieldId] || fieldId));
    btn.textContent = '▾';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (openDropdown && openDropdown.btn === btn) {
        closeOpenDropdown();
        return;
      }
      openSnippetMenu(fieldId, btn);
    });

    wrap.appendChild(btn);

    // Выровнять по вертикали с textarea (центр первой строки)
    const alignSnippetToTextarea = () => {
      const ta = document.getElementById(fieldId);
      if (!ta) return;
      // кнопка 28px — по центру высоты первой строки textarea
      const cs = window.getComputedStyle(ta);
      const lineH = parseFloat(cs.lineHeight) || 24;
      const padTop = parseFloat(cs.paddingTop) || 0;
      const borderTop = parseFloat(cs.borderTopWidth) || 0;
      const offset = Math.max(0, Math.round(padTop + borderTop + (lineH - 28) / 2));
      wrap.style.marginTop = `${offset}px`;
    };

    row.appendChild(wrap);
    row.appendChild(textarea);

    // Собираем блок: label, затем row
    while (block.firstChild) block.removeChild(block.firstChild);
    if (label) block.appendChild(label);
    block.appendChild(row);

    requestAnimationFrame(alignSnippetToTextarea);
    setTimeout(alignSnippetToTextarea, 50);
  });
}

/** Нативные кнопки volgahelp тоже не должны ломать Tab по полям */
function fixNativeButtonsTabOrder() {
  document.querySelectorAll('button').forEach((btn) => {
    if (btn.classList.contains('tsl-sync-btn') || btn.classList.contains('tsl-snippet-btn')) return;
    // «Скопировать / Очистить» — не в цепочке Tab между textarea
    if (btn.closest('.tsl-snippet-menu')) return;
    const text = (btn.textContent || '').trim();
    if (text.includes('Скопировать') || text.includes('Очистить')) {
      btn.tabIndex = -1;
    }
  });
}

// ==================== СЕССИЯ ====================

async function initSession() {
  chrome.storage.local.get(
    ['volgaHelpSession', 'volgaHelpDrafts', 'settings'],
    async (result) => {
      const session = result.volgaHelpSession;
      if (!session?.ticketNumber) return;

      activeTicket = String(session.ticketNumber);
      activeNls = String(session.nls || '').replace(/\s+/g, '');

      const settings = result.settings || {};
      const builderOn = settings.ttmCommentBuilder !== false;
      autofillEnabled = settings.ttmCommentBuilderAutofill !== false && builderOn;
      const snippetsOn = settings.ttmCommentBuilderSnippets !== false && builderOn;

      await waitForTagSelectReady();

      const draft = result.volgaHelpDrafts?.[activeTicket];
      applyDraft(draft);

      setupAutoSave();
      hookCopyButton();
      hookClearButton();
      createSyncButton();
      fixNativeButtonsTabOrder();

      if (snippetsOn) {
        setupSnippetButtons();
      }

      // Автозаполнение только пустых полей (после draft)
      if (autofillEnabled) {
        await loadAndApplyAutofill(false);
      }
    }
  );
}

function init() {
  injectToolbarStyles(); // цвета формы сразу (даже до session)
  setupWindowLayoutPersistence();
  initFieldHeights();
  initSession();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
