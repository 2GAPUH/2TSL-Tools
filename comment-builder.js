// comment-builder.js — свой конструктор комментария (расширение, не volgahelp DOM)
(function () {
  'use strict';

  const DRAFT_FIELD_IDS = ['issue', 'actions', 'conclusion', 'diagnostics', 'other'];
  const SAVE_DEBOUNCE_MS = 400;
  const MAX_DRAFTS = 100;
  const TTM_CLIENT_KEY = 'ttmClientByNls';
  const SNIPPETS_KEY = 'volgaHelpQuickSnippets';
  const DRAFTS_KEY = 'volgaHelpDrafts';
  const SESSION_KEY = 'volgaHelpSession';
  const CACHE_TTL_MS = 60 * 60 * 1000;
  const SNIPPET_PREVIEW_LEN = 48;
  const TAGS_URL = 'https://volgahelp.ru/tag_api/api/tag/?format=json';
  const LAYOUT_KEY = 'volgaHelpWindowLayout';
  /** Высоты textarea 1–5 — общие на весь профиль (все окна конструктора) */
  const FIELD_HEIGHTS_KEY = 'volgaHelpFieldHeights';
  const FIELD_HEIGHT_SAVE_DEBOUNCE_MS = 400;
  const MIN_FIELD_HEIGHT = 48;

  const FIELD_LABELS = {
    issue: '1. С чем обратился абонент?',
    actions: '2. Что было сделано для решения сложности?',
    conclusion: '3. Ваше техническое заключение',
    diagnostics: '4. Диагностика из ЕПД и других систем',
    other: '5. Другая важная информация'
  };

  let activeTicket = '';
  let activeNls = '';
  let activeEditorQaId = '';
  let saveTimer = null;
  let autofillEnabled = true;
  let snippetsEnabled = true;
  let tagsByValue = {};
  let openDropdown = null;
  let applyingSession = false;
  let fieldHeightSaveTimer = null;
  /** @type {ResizeObserver[]} */
  let fieldHeightObservers = [];

  function $(id) {
    return document.getElementById(id);
  }

  function trackEvent(event) {
    try {
      chrome.runtime.sendMessage({ action: 'trackEvent', event });
    } catch (e) { /* ignore */ }
  }

  function showToast(message, isError) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'show ' + (isError ? 'err' : 'ok');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.className = '';
    }, 2800);
  }

  function setSessionMeta() {
    const meta = $('sessionMeta');
    if (!meta) return;
    meta.innerHTML =
      'Заявка: <strong>' + (activeTicket || '—') + '</strong> · НЛС: <strong>' +
      (activeNls || '—') + '</strong>';
  }

  function showSwitchBanner(ticket) {
    const b = $('switchBanner');
    if (!b) return;
    b.textContent = 'Переключено на заявку ' + ticket + '. Черновик предыдущей сохранён.';
    b.classList.add('show');
    clearTimeout(showSwitchBanner._t);
    showSwitchBanner._t = setTimeout(() => b.classList.remove('show'), 4000);
  }

  // ---------- drafts ----------
  function getDraftFromForm() {
    const tagSelect = $('tagSelect');
    return {
      checkbox_changes: !!$('checkbox_changes')?.checked,
      tagSelect: tagSelect?.value || '',
      issue: $('issue')?.value || '',
      actions: $('actions')?.value || '',
      conclusion: $('conclusion')?.value || '',
      diagnostics: $('diagnostics')?.value || '',
      other: $('other')?.value || '',
      updatedAt: Date.now()
    };
  }

  function clearFormFields() {
    const cb = $('checkbox_changes');
    if (cb) cb.checked = false;
    const tagSelect = $('tagSelect');
    if (tagSelect) {
      tagSelect.selectedIndex = 0;
      updateTagDesc();
    }
    DRAFT_FIELD_IDS.forEach((id) => {
      const el = $(id);
      if (el) el.value = '';
    });
    const out = $('output');
    if (out) out.value = '';
  }

  function applyDraft(draft) {
    if (!draft) {
      clearFormFields();
      return;
    }
    const checkbox = $('checkbox_changes');
    if (checkbox) checkbox.checked = !!draft.checkbox_changes;

    if (draft.tagSelect) {
      const tagSelect = $('tagSelect');
      if (tagSelect) {
        const has = Array.from(tagSelect.options).some((o) => o.value === draft.tagSelect);
        if (has) {
          tagSelect.value = draft.tagSelect;
          updateTagDesc();
        }
      }
    }

    DRAFT_FIELD_IDS.forEach((id) => {
      const el = $(id);
      if (el && draft[id] != null) el.value = draft[id];
    });
  }

  function pruneDrafts(drafts) {
    const entries = Object.entries(drafts || {});
    if (entries.length <= MAX_DRAFTS) return drafts || {};
    entries.sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0));
    const pruned = {};
    entries.slice(0, MAX_DRAFTS).forEach(([k, v]) => {
      pruned[k] = v;
    });
    return pruned;
  }

  function saveDraftNow() {
    if (!activeTicket || applyingSession) return;
    chrome.storage.local.get([DRAFTS_KEY], (result) => {
      const drafts = result[DRAFTS_KEY] || {};
      drafts[activeTicket] = getDraftFromForm();
      chrome.storage.local.set({ [DRAFTS_KEY]: pruneDrafts(drafts) });
    });
  }

  function scheduleSave() {
    if (!activeTicket || applyingSession) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraftNow, SAVE_DEBOUNCE_MS);
  }

  function removeDraft(ticket) {
    if (!ticket) return;
    chrome.storage.local.get([DRAFTS_KEY], (result) => {
      const drafts = result[DRAFTS_KEY] || {};
      if (!drafts[ticket]) return;
      delete drafts[ticket];
      chrome.storage.local.set({ [DRAFTS_KEY]: drafts });
    });
  }

  // ---------- tags ----------
  function updateTagDesc() {
    const sel = $('tagSelect');
    const desc = $('tagDesc');
    if (!sel || !desc) return;
    const val = sel.value;
    const tag = tagsByValue[val];
    desc.textContent = tag?.off_text ? String(tag.off_text).replace(/\\r\\n/g, '\n').replace(/\r\n/g, '\n') : '';
  }

  async function loadTags() {
    const sel = $('tagSelect');
    if (!sel) return;
    try {
      const res = await fetch(TAGS_URL, { credentials: 'omit', cache: 'no-cache' });
      if (!res.ok) throw new Error('http_' + res.status);
      const list = await res.json();
      tagsByValue = {};
      sel.innerHTML = '';
      const ph = document.createElement('option');
      ph.value = '';
      ph.disabled = true;
      ph.selected = true;
      ph.textContent = 'Выберите тег';
      sel.appendChild(ph);

      (Array.isArray(list) ? list : []).forEach((tag) => {
        const main = (tag.main_text || '').trim();
        if (!main) return;
        const opt = document.createElement('option');
        opt.value = main;
        opt.textContent = main;
        tagsByValue[main] = tag;
        sel.appendChild(opt);
      });
    } catch (e) {
      console.warn('[2TSL builder] tags', e);
      sel.innerHTML = '<option value="" disabled selected>Не удалось загрузить теги</option>';
      showToast('Не удалось загрузить теги volgahelp', true);
    }
  }

  // ---------- build text ----------
  function buildCopyText() {
    let output = '';
    if ($('checkbox_changes')?.checked) {
      output += '#ХолостойНа2ЛТП\n\n';
    }
    const tagSelect = $('tagSelect');
    const selectedTag = tagSelect?.options[tagSelect.selectedIndex]?.text?.trim();
    if (selectedTag && tagSelect?.value) {
      output += '#' + selectedTag.replace(/^#/, '') + '\n\n';
    }

    [
      ['1. С чем обратился абонент?', 'issue'],
      ['2. Что было сделано для решения сложности?', 'actions'],
      ['3. Ваше техническое заключение', 'conclusion'],
      ['4. Диагностика из ЕПД и других систем', 'diagnostics'],
      ['5. Другая важная информация', 'other']
    ].forEach(([label, id]) => {
      const value = $(id)?.value?.trim() || '';
      if (value) {
        output += '✅ ' + label + '\n' + value + '\n\n';
      } else {
        output += '❌ ' + label + '\n(Поле не заполнено)\n\n';
      }
    });

    return output.trimEnd();
  }

  function refreshOutputPreview() {
    const out = $('output');
    if (!out) return;
    out.value = buildCopyText();
  }

  // ---------- autofill (только телефон из TTM; ЕПД отключён в 0.8.3) ----------
  function isCacheFresh(entry) {
    if (!entry?.updatedAt) return false;
    return Date.now() - entry.updatedAt < CACHE_TTL_MS;
  }

  function setFieldValue(id, value) {
    const el = $(id);
    if (!el) return false;
    el.value = value == null ? '' : value;
    return true;
  }

  function applyPhoneFromMap(ttmMap, force) {
    const nls = String(activeNls || '').replace(/\s+/g, '');
    if (!nls) return false;
    const entry = ttmMap?.[nls];
    let phoneLine = '';
    if (isCacheFresh(entry)) {
      phoneLine = String(entry.phoneLine || '').trim();
      if (!phoneLine && entry.phone) {
        phoneLine = 'Контакт для дозвона: ' + String(entry.phone).replace(/\D/g, '');
      }
    }
    const other = $('other');
    if (!other) return false;
    if (force) {
      setFieldValue('other', phoneLine || '');
      return !!phoneLine;
    }
    if (phoneLine && !other.value.trim()) {
      setFieldValue('other', phoneLine);
      return true;
    }
    return false;
  }

  async function runAutofill(force) {
    if (!autofillEnabled && !force) return { success: false, reason: 'disabled' };

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

    const stored = await new Promise((resolve) => {
      chrome.storage.local.get([TTM_CLIENT_KEY], resolve);
    });
    const phoneOk = applyPhoneFromMap(stored[TTM_CLIENT_KEY] || {}, !!force);
    if (phoneOk) scheduleSave();
    refreshOutputPreview();
    return { success: phoneOk, phone: phoneOk };
  }

  // ---------- snippets ----------
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
      cb(result[SNIPPETS_KEY] && typeof result[SNIPPETS_KEY] === 'object' ? result[SNIPPETS_KEY] : {});
    });
  }

  function saveSnippetsMap(map, cb) {
    chrome.storage.local.set({ [SNIPPETS_KEY]: map }, () => cb && cb());
  }

  function uid() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function appendFieldValue(id, value) {
    const el = $(id);
    if (!el || !value) return;
    const cur = el.value || '';
    el.value = cur
      ? (cur.endsWith('\n') || cur.endsWith(' ') ? cur + value : cur + '\n' + value)
      : value;
    scheduleSave();
    refreshOutputPreview();
  }

  function openSnippetMenu(fieldId, anchorBtn) {
    closeOpenDropdown();
    loadSnippetsMap((map) => {
      const list = Array.isArray(map[fieldId]) ? map[fieldId] : [];
      const menu = document.createElement('div');
      menu.className = 'snippet-menu';

      if (!list.length) {
        const empty = document.createElement('div');
        empty.className = 'snippet-empty';
        empty.textContent = 'Нет шаблонов';
        menu.appendChild(empty);
      } else {
        list.forEach((item) => {
          const row = document.createElement('div');
          row.className = 'snippet-item';
          const pick = document.createElement('button');
          pick.type = 'button';
          pick.className = 'snippet-pick';
          pick.tabIndex = -1;
          pick.textContent = previewSnippet(item.text);
          pick.title = item.text;
          pick.addEventListener('click', () => {
            appendFieldValue(fieldId, item.text);
            trackEvent('volga_snippet_insert');
            closeOpenDropdown();
          });
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'snippet-del';
          del.tabIndex = -1;
          del.textContent = '×';
          del.title = 'Удалить';
          del.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm('Удалить этот шаблон?')) return;
            loadSnippetsMap((fresh) => {
              fresh[fieldId] = (fresh[fieldId] || []).filter((x) => x.id !== item.id);
              saveSnippetsMap(fresh, () => {
                trackEvent('volga_snippet_delete');
                closeOpenDropdown();
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
      addBtn.className = 'snippet-add';
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

      const wrap = anchorBtn.closest('.snippet-wrap') || anchorBtn.parentElement;
      wrap.appendChild(menu);
      const onDocClick = (e) => {
        if (menu.contains(e.target) || anchorBtn.contains(e.target)) return;
        closeOpenDropdown();
      };
      setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
      openDropdown = { menu, btn: anchorBtn, onDocClick };
    });
  }

  function setupSnippetButtons() {
    document.querySelectorAll('.snippet-wrap[data-snippet-for]').forEach((wrap) => {
      wrap.innerHTML = '';
      if (!snippetsEnabled) return;
      const fieldId = wrap.getAttribute('data-snippet-for');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'snippet-btn';
      btn.tabIndex = -1;
      btn.textContent = '▾';
      btn.title = 'Быстрые шаблоны';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (openDropdown && openDropdown.btn === btn) {
          closeOpenDropdown();
          return;
        }
        openSnippetMenu(fieldId, btn);
      });
      wrap.appendChild(btn);

      // выровнять по textarea
      const ta = $(fieldId);
      if (ta) {
        requestAnimationFrame(() => {
          const cs = getComputedStyle(ta);
          const lineH = parseFloat(cs.lineHeight) || 24;
          const padTop = parseFloat(cs.paddingTop) || 0;
          const borderTop = parseFloat(cs.borderTopWidth) || 0;
          wrap.style.marginTop = Math.max(0, Math.round(padTop + borderTop + (lineH - 28) / 2)) + 'px';
        });
      }
    });
  }

  // ---------- session switch ----------
  async function applySession(session, opts) {
    const ticket = String(session?.ticketNumber || '');
    if (!ticket) return;

    const prevTicket = activeTicket;
    const switched = prevTicket && prevTicket !== ticket;

    applyingSession = true;
    try {
      // сохранить предыдущий черновик до смены
      if (switched && prevTicket) {
        const draftsWrap = await new Promise((resolve) => {
          chrome.storage.local.get([DRAFTS_KEY], resolve);
        });
        const drafts = draftsWrap[DRAFTS_KEY] || {};
        drafts[prevTicket] = getDraftFromForm();
        // временно activeTicket = prev for getDraft - already used form
        await new Promise((r) => {
          chrome.storage.local.set({ [DRAFTS_KEY]: pruneDrafts(drafts) }, r);
        });
      }

      activeTicket = ticket;
      activeNls = String(session.nls || '').replace(/\s+/g, '');
      activeEditorQaId = session.commentEditorQaId || '';
      setSessionMeta();
      document.title = '2TSL — заявка ' + activeTicket;

      const result = await new Promise((resolve) => {
        chrome.storage.local.get([DRAFTS_KEY, 'settings'], resolve);
      });
      const settings = result.settings || {};
      autofillEnabled = settings.ttmCommentBuilderAutofill !== false
        && settings.ttmCommentBuilder !== false;
      snippetsEnabled = settings.ttmCommentBuilderSnippets !== false
        && settings.ttmCommentBuilder !== false;

      setupSnippetButtons();

      const draft = result[DRAFTS_KEY]?.[activeTicket];
      applyDraft(draft || null);

      if (switched) showSwitchBanner(activeTicket);

      applyingSession = false;

      if (autofillEnabled) {
        await runAutofill(false);
      } else {
        refreshOutputPreview();
      }
    } finally {
      applyingSession = false;
    }
  }

  // ---------- copy & paste ----------
  /** Буфер обмена: пишем здесь (есть user gesture), а не только со стороны TTM. */
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy');
        ta.remove();
        return !!ok;
      } catch (e2) {
        return false;
      }
    }
  }

  async function copyAndPaste() {
    if (!activeTicket) {
      showToast('Нет номера заявки в сессии', true);
      return;
    }

    const text = buildCopyText();
    const out = $('output');
    if (out) out.value = text;

    if (!text) {
      showToast('Нечего копировать', true);
      return;
    }

    // 1) Буфер — в окне конструктора (клик = user activation; content script TTM часто без неё)
    const copied = await copyToClipboard(text);

    // 2) Pending + sendMessage во вкладки TTM (двойной путь)
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            action: 'commentBuilderPaste',
            text,
            ticketNumber: activeTicket,
            commentEditorQaId: activeEditorQaId || ''
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response);
          }
        );
      });
      trackEvent('ttm_comment_builder_copy');
      showToast(
        copied
          ? 'Скопировано и отправлено в TTM…'
          : 'Отправлено в TTM (в буфер не удалось)'
      );
      // не закрываем мгновенно — даём SW/вкладкам обработать
      setTimeout(() => {
        try {
          window.close();
        } catch (e) { /* ignore */ }
      }, 350);
    } catch (e) {
      console.error('[2TSL builder] paste', e);
      if (copied) {
        showToast('Скопировано; вставка в TTM: ' + (e.message || e), true);
      } else {
        showToast('Ошибка: ' + (e.message || e), true);
      }
    }
  }

  function clearAll() {
    if (!confirm('Очистить все поля и черновик этой заявки?')) return;
    clearFormFields();
    removeDraft(activeTicket);
    refreshOutputPreview();
  }

  // ---------- layout persist ----------
  function saveLayout() {
    try {
      const size = {
        width: Math.max(640, window.outerWidth),
        height: Math.max(500, window.outerHeight)
      };
      chrome.storage.local.set({ [LAYOUT_KEY]: size });
    } catch (e) { /* ignore */ }
  }

  // ---------- высоты полей 1–5 (общие для всех popup) ----------
  function applyFieldHeights(heights) {
    if (!heights || typeof heights !== 'object') return;
    DRAFT_FIELD_IDS.forEach((id) => {
      const el = $(id);
      const h = heights[id];
      if (!el || !(h >= MIN_FIELD_HEIGHT)) return;
      el.style.boxSizing = 'border-box';
      el.style.resize = 'vertical';
      el.style.minHeight = MIN_FIELD_HEIGHT + 'px';
      el.style.height = h + 'px';
    });
  }

  function collectFieldHeights() {
    const heights = {};
    DRAFT_FIELD_IDS.forEach((id) => {
      const el = $(id);
      if (el) heights[id] = el.offsetHeight;
    });
    return heights;
  }

  function scheduleFieldHeightSave() {
    clearTimeout(fieldHeightSaveTimer);
    fieldHeightSaveTimer = setTimeout(() => {
      try {
        chrome.storage.local.set({ [FIELD_HEIGHTS_KEY]: collectFieldHeights() });
      } catch (e) { /* ignore */ }
    }, FIELD_HEIGHT_SAVE_DEBOUNCE_MS);
  }

  function setupFieldHeightPersistence() {
    fieldHeightObservers.forEach((o) => {
      try { o.disconnect(); } catch (e) { /* ignore */ }
    });
    fieldHeightObservers = [];

    DRAFT_FIELD_IDS.forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.style.resize = 'vertical';
      el.style.minHeight = MIN_FIELD_HEIGHT + 'px';
      el.style.boxSizing = 'border-box';
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => scheduleFieldHeightSave());
        ro.observe(el);
        fieldHeightObservers.push(ro);
      } else {
        el.addEventListener('mouseup', scheduleFieldHeightSave);
      }
    });
  }

  function initFieldHeights() {
    chrome.storage.local.get([FIELD_HEIGHTS_KEY], (result) => {
      applyFieldHeights(result[FIELD_HEIGHTS_KEY]);
      setupFieldHeightPersistence();
    });
  }

  // ---------- init ----------
  function wireUi() {
    $('checkbox_changes')?.addEventListener('change', () => {
      scheduleSave();
      refreshOutputPreview();
    });
    $('tagSelect')?.addEventListener('change', () => {
      updateTagDesc();
      scheduleSave();
      refreshOutputPreview();
    });
    DRAFT_FIELD_IDS.forEach((id) => {
      $(id)?.addEventListener('input', () => {
        scheduleSave();
        refreshOutputPreview();
      });
    });

    $('copyPasteBtn')?.addEventListener('click', () => {
      copyAndPaste();
    });
    $('clearBtn')?.addEventListener('click', clearAll);

    $('syncBtn')?.addEventListener('click', async () => {
      const btn = $('syncBtn');
      if (!activeNls) {
        showToast('НЛС не передан — откройте конструктор с карточки TTM', true);
        return;
      }
      btn.disabled = true;
      btn.classList.add('spinning');
      try {
        const res = await runAutofill(true);
        trackEvent('ttm_comment_builder_sync');
        if (res?.phone) {
          showToast('Контакт из TTM обновлён');
        } else {
          showToast(
            'Контакт не найден. Откройте карточку заявки в TTM (комментарии с «Контакт для дозвона»)',
            true
          );
        }
      } finally {
        btn.disabled = false;
        btn.classList.remove('spinning');
      }
    });

    window.addEventListener('resize', () => {
      clearTimeout(saveLayout._t);
      saveLayout._t = setTimeout(saveLayout, 400);
    });
    window.addEventListener('pagehide', saveLayout);
  }

  async function init() {
    wireUi();
    await loadTags();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[SESSION_KEY]?.newValue) {
        const s = changes[SESSION_KEY].newValue;
        if (s?.ticketNumber) {
          applySession(s, { fromStorage: true });
        }
      }
      // высоты с другого окна конструктора — подтянуть
      if (changes[FIELD_HEIGHTS_KEY]?.newValue) {
        applyFieldHeights(changes[FIELD_HEIGHTS_KEY].newValue);
      }
      if (changes.settings?.newValue) {
        const settings = changes.settings.newValue || {};
        const builderOn = settings.ttmCommentBuilder !== false;
        autofillEnabled = settings.ttmCommentBuilderAutofill !== false && builderOn;
        snippetsEnabled = settings.ttmCommentBuilderSnippets !== false && builderOn;
        setupSnippetButtons();
      }
    });

    initFieldHeights();

    chrome.storage.local.get([SESSION_KEY, 'settings'], async (result) => {
      const settings = result.settings || {};
      const builderOn = settings.ttmCommentBuilder !== false;
      autofillEnabled = settings.ttmCommentBuilderAutofill !== false && builderOn;
      snippetsEnabled = settings.ttmCommentBuilderSnippets !== false && builderOn;

      const session = result[SESSION_KEY];
      if (session?.ticketNumber) {
        await applySession(session);
      } else {
        setSessionMeta();
        setupSnippetButtons();
        showToast('Откройте конструктор из TTM (кнопка в редакторе комментария)', true);
      }
    });

    // сообщить background что окно живо
    try {
      chrome.runtime.sendMessage({ action: 'commentBuilderReady' });
    } catch (e) { /* ignore */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
