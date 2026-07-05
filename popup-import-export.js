// popup-import-export.js — импорт/экспорт шаблонов и настроек (JSON)

const IE_EXPORT_FORMAT = '2tsl-toolbox-export';
const IE_EXPORT_VERSION = 1;
const IE_MAX_FILE_SIZE = 5 * 1024 * 1024;
const IE_MAX_BODY_LENGTH = 50000;

const IE_SETTINGS_KEYS = [
  'omnichatTemplates', 'omnichatTTMLinks', 'ttmButton', 'accountingPanel',
  'grafanaSSH', 'reminder', 'ttmOnyma', 'ttmSipal', 'darkMode',
  'popupLayoutScale', 'popupTabSizes', 'popupUnifiedTabSize'
];

const IE_SETTINGS_LABELS = {
  omnichatTemplates: 'Шаблоны Omnichat',
  omnichatTTMLinks: 'Ссылки Omnichat → TTM',
  ttmButton: 'Кнопка TTM → Форма',
  accountingPanel: 'Панель «Учёт заявок»',
  grafanaSSH: 'Переход Grafana → SSH',
  reminder: 'Напоминалка',
  ttmOnyma: 'Переход TTM → Onyma',
  ttmSipal: 'Переход TTM → SIPAL',
  darkMode: 'Тёмная тема',
  popupUnifiedTabSize: 'Один размер для всех вкладок',
  popupLayoutScale: 'Масштаб оформления',
  popupTabSizes: 'Размеры вкладок'
};

let ieApi = null;
let ieExportDraft = [];
let ieImportPreview = null;
let ieImportFileInput = null;

// ==================== УТИЛИТЫ ====================

function ieEscapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function ieEscapeTextarea(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/<\/textarea/gi, '&lt;/textarea');
}

function ieTruncate(text, max = 80) {
  const s = String(text || '').replace(/\s+/g, ' ');
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function ieFormatSettingValue(key, value) {
  if (typeof value === 'boolean') return value ? 'вкл' : 'выкл';
  if (key === 'popupLayoutScale' && value && typeof value === 'object') {
    return `шрифт ${value.fontSize}%, отступы ${value.padding}%`;
  }
  if (key === 'popupTabSizes' && value && typeof value === 'object') {
    return 'настроены';
  }
  return String(value);
}

function ieSanitizeSettings(settings) {
  const out = {};
  IE_SETTINGS_KEYS.forEach((key) => {
    if (settings[key] !== undefined) {
      out[key] = settings[key];
    }
  });
  return out;
}

function ieBuildGroupOptions(groups, selected) {
  const unique = [...new Set(groups.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  let html = '<option value="">Без группы</option>';
  unique.forEach((g) => {
    const sel = g === selected ? ' selected' : '';
    html += `<option value="${ieEscapeAttr(g)}"${sel}>${ieApi.escapeHtml(g)}</option>`;
  });
  if (selected && !unique.includes(selected)) {
    html += `<option value="${ieEscapeAttr(selected)}" selected>${ieApi.escapeHtml(selected)} (из файла)</option>`;
  }
  return html;
}

function ieTodayFileSuffix() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ==================== ЭКСПОРТ ====================

function ieBuildExportPayload(draftItems, options) {
  const selected = draftItems.filter((item) => item.selected);
  const templates = selected.map((item) => {
    const entry = {
      name: item.name.trim(),
      body: item.body
    };
    if (options.includeGroups && item.group) {
      entry.group = item.group;
    }
    return entry;
  }).filter((t) => t.name && t.body);

  const payload = {
    format: IE_EXPORT_FORMAT,
    version: IE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest().version,
    templates
  };

  if (options.includeGroups) {
    const groupSet = new Set();
    templates.forEach((t) => {
      if (t.group) groupSet.add(t.group);
    });
    if (groupSet.size) payload.groups = [...groupSet].sort((a, b) => a.localeCompare(b, 'ru'));
  }

  if (options.includeSettings) {
    payload.settings = ieSanitizeSettings(ieApi.getSettings());
  }

  return payload;
}

function ieDownloadJson(payload) {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `2TSL-backup_${ieTodayFileSuffix()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function ieCanExport() {
  const includeSettings = document.getElementById('exportIncludeSettings')?.checked;
  const hasTemplates = ieExportDraft.some((item) => item.selected);
  return hasTemplates || includeSettings;
}

function ieUpdateExportSubmitState() {
  const btn = document.getElementById('exportSubmitBtn');
  if (btn) btn.disabled = !ieCanExport();
}

function ieRenderExportList() {
  const list = document.getElementById('exportTemplatesList');
  if (!list) return;

  const groups = ieApi.getGroups();

  if (!ieExportDraft.length) {
    list.innerHTML = '<p class="ie-empty">Шаблонов нет. Можно экспортировать только настройки.</p>';
    ieUpdateExportSubmitState();
    return;
  }

  list.innerHTML = ieExportDraft.map((item, index) => `
    <div class="ie-row" data-index="${index}">
      <label class="ie-row-check">
        <input type="checkbox" class="ie-export-select" data-index="${index}" ${item.selected ? 'checked' : ''}>
      </label>
      <div class="ie-row-body">
        <div class="ie-row-line">
          <input type="text" class="ie-field ie-name" data-index="${index}" value="${ieEscapeAttr(item.name)}" maxlength="100" placeholder="Название">
          <select class="ie-field ie-group" data-index="${index}">${ieBuildGroupOptions(groups, item.group)}</select>
        </div>
        <textarea class="ie-field ie-body" data-index="${index}" rows="3" placeholder="Текст шаблона">${ieEscapeTextarea(item.body)}</textarea>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.ie-export-select').forEach((el) => {
    el.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      ieExportDraft[idx].selected = e.target.checked;
      ieUpdateExportSubmitState();
    });
  });

  list.querySelectorAll('.ie-name').forEach((el) => {
    el.addEventListener('input', (e) => {
      ieExportDraft[parseInt(e.target.dataset.index, 10)].name = e.target.value;
    });
  });

  list.querySelectorAll('.ie-group').forEach((el) => {
    el.addEventListener('change', (e) => {
      ieExportDraft[parseInt(e.target.dataset.index, 10)].group = e.target.value;
    });
  });

  list.querySelectorAll('.ie-body').forEach((el) => {
    el.addEventListener('input', (e) => {
      ieExportDraft[parseInt(e.target.dataset.index, 10)].body = e.target.value;
    });
  });

  ieUpdateExportSubmitState();
}

function ieInitExportPanel() {
  ieExportDraft = ieApi.getTemplates().map((t) => ({
    sourceId: t.id,
    selected: true,
    name: t.name,
    group: t.group || '',
    body: t.body
  }));

  const includeGroups = document.getElementById('exportIncludeGroups');
  const includeSettings = document.getElementById('exportIncludeSettings');
  if (includeGroups) includeGroups.checked = true;
  if (includeSettings) includeSettings.checked = false;

  ieRenderExportList();
  ieApi.trackEvent('popup_export_open');
}

function ieHandleExportSubmit() {
  if (!ieCanExport()) return;

  const includeGroups = document.getElementById('exportIncludeGroups')?.checked ?? true;
  const includeSettings = document.getElementById('exportIncludeSettings')?.checked ?? false;

  const payload = ieBuildExportPayload(ieExportDraft, { includeGroups, includeSettings });
  const templateCount = payload.templates.length;

  if (!templateCount && !includeSettings) {
    alert('Выберите шаблоны или включите экспорт настроек');
    return;
  }

  for (const t of payload.templates) {
    if (t.body.length > IE_MAX_BODY_LENGTH) {
      alert(`Шаблон «${t.name}» слишком длинный (макс. ${IE_MAX_BODY_LENGTH} символов)`);
      return;
    }
  }

  ieDownloadJson(payload);
  ieApi.trackEvent('popup_export_done');
  if (typeof ieApi.showStatus === 'function') {
    ieApi.showStatus('Файл скачан');
  }
}

// ==================== ИМПОРТ ====================

function ieParseImportFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'Не удалось прочитать файл. Убедитесь, что это JSON.' };
  }

  if (!data || typeof data !== 'object') {
    return { error: 'Файл не содержит данных.' };
  }

  if (data.format !== IE_EXPORT_FORMAT) {
    return { error: 'Неподдерживаемый формат файла. Ожидается резервная копия 2TSL toolbox.' };
  }

  if (data.version !== IE_EXPORT_VERSION) {
    return { error: `Неподдерживаемая версия файла (${data.version}). Обновите расширение.` };
  }

  const templates = Array.isArray(data.templates) ? data.templates : [];
  const hasSettings = data.settings && typeof data.settings === 'object';

  if (!templates.length && !hasSettings) {
    return { error: 'Файл не содержит шаблонов и настроек.' };
  }

  const normalizedTemplates = templates.map((t, index) => {
    const name = String(t?.name || '').trim();
    const body = String(t?.body ?? '').trim();
    const group = String(t?.group || '').trim();
    return {
      index,
      selected: Boolean(name && body),
      name,
      body,
      group,
      invalid: !name || !body
    };
  });

  return {
    data,
    templates: normalizedTemplates,
    settings: hasSettings ? ieSanitizeSettings(data.settings) : null,
    fileGroups: Array.isArray(data.groups) ? data.groups.filter(Boolean) : []
  };
}

function ieDiffSettings(current, incoming) {
  const diffs = [];
  IE_SETTINGS_KEYS.forEach((key) => {
    if (incoming[key] === undefined) return;
    const curVal = current[key];
    const newVal = incoming[key];
    const same = JSON.stringify(curVal) === JSON.stringify(newVal);
    if (!same) {
      diffs.push({
        key,
        label: IE_SETTINGS_LABELS[key] || key,
        from: ieFormatSettingValue(key, curVal),
        to: ieFormatSettingValue(key, newVal)
      });
    }
  });
  return diffs;
}

function ieCanImport() {
  if (!ieImportPreview) return false;
  const hasTemplates = ieImportPreview.templates.some((t) => t.selected && !t.invalid);
  const applySettings = document.getElementById('importApplySettings')?.checked;
  return hasTemplates || (applySettings && ieImportPreview.settings);
}

function ieUpdateImportSubmitState() {
  const btn = document.getElementById('importSubmitBtn');
  if (btn) btn.disabled = !ieCanImport();
}

function ieRenderImportSettingsBlock() {
  const block = document.getElementById('importSettingsBlock');
  const diffList = document.getElementById('importSettingsDiff');
  const applyCheckbox = document.getElementById('importApplySettings');
  if (!block || !ieImportPreview) return;

  if (!ieImportPreview.settings) {
    block.style.display = 'none';
    if (applyCheckbox) applyCheckbox.checked = false;
    return;
  }

  block.style.display = 'block';
  const diffs = ieDiffSettings(ieApi.getSettings(), ieImportPreview.settings);

  if (diffList) {
    if (!diffs.length) {
      diffList.innerHTML = '<p class="ie-hint">Настройки в файле совпадают с текущими.</p>';
    } else {
      diffList.innerHTML = diffs.map((d) => `
        <div class="ie-diff-item">
          <span class="ie-diff-label">${ieApi.escapeHtml(d.label)}</span>
          <span class="ie-diff-values">${ieApi.escapeHtml(d.from)} → ${ieApi.escapeHtml(d.to)}</span>
        </div>
      `).join('');
    }
  }

  if (applyCheckbox) applyCheckbox.checked = false;
}

function ieRenderImportList() {
  const list = document.getElementById('importTemplatesList');
  const meta = document.getElementById('importFileMeta');
  if (!list || !ieImportPreview) return;

  const userGroups = ieApi.getGroups();
  const existingNames = new Set(ieApi.getTemplates().map((t) => t.name.trim().toLowerCase()));

  if (meta) {
    const parts = [];
    if (ieImportPreview.templates.length) {
      parts.push(`Шаблонов: ${ieImportPreview.templates.length}`);
    }
    if (ieImportPreview.settings) parts.push('Настройки: есть');
    meta.textContent = parts.join(' · ') || '—';
  }

  if (!ieImportPreview.templates.length) {
    list.innerHTML = '<p class="ie-empty">В файле нет шаблонов. Можно импортировать только настройки.</p>';
    ieUpdateImportSubmitState();
    return;
  }

  list.innerHTML = ieImportPreview.templates.map((item) => {
    const duplicate = item.name && existingNames.has(item.name.toLowerCase());
    const invalidNote = item.invalid ? '<span class="ie-badge ie-badge-warn">неполный</span>' : '';
    const dupNote = duplicate ? '<span class="ie-badge">имя уже есть</span>' : '';
    return `
      <div class="ie-row ${item.invalid ? 'ie-row-invalid' : ''}" data-index="${item.index}">
        <label class="ie-row-check">
          <input type="checkbox" class="ie-import-select" data-index="${item.index}"
            ${item.selected && !item.invalid ? 'checked' : ''} ${item.invalid ? 'disabled' : ''}>
        </label>
        <div class="ie-row-body">
          <div class="ie-row-line">
            <input type="text" class="ie-field ie-name" data-index="${item.index}"
              value="${ieEscapeAttr(item.name)}" maxlength="100" placeholder="Название" ${item.invalid ? 'disabled' : ''}>
            <select class="ie-field ie-group" data-index="${item.index}" ${item.invalid ? 'disabled' : ''}>
              ${ieBuildGroupOptions(userGroups, item.group)}
            </select>
            ${invalidNote}${dupNote}
          </div>
          <textarea class="ie-field ie-body" data-index="${item.index}" rows="3"
            placeholder="Текст шаблона" ${item.invalid ? 'disabled' : ''}>${ieEscapeTextarea(item.body)}</textarea>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.ie-import-select').forEach((el) => {
    el.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      const item = ieImportPreview.templates.find((t) => t.index === idx);
      if (item) item.selected = e.target.checked;
      ieUpdateImportSubmitState();
    });
  });

  list.querySelectorAll('.ie-name').forEach((el) => {
    el.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      const item = ieImportPreview.templates.find((t) => t.index === idx);
      if (item) item.name = e.target.value;
    });
  });

  list.querySelectorAll('.ie-group').forEach((el) => {
    el.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      const item = ieImportPreview.templates.find((t) => t.index === idx);
      if (item) item.group = e.target.value;
    });
  });

  list.querySelectorAll('.ie-body').forEach((el) => {
    el.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.index, 10);
      const item = ieImportPreview.templates.find((t) => t.index === idx);
      if (item) item.body = e.target.value;
    });
  });

  ieUpdateImportSubmitState();
}

function ieShowImportPreview(parsed, fileName) {
  const pickBlock = document.getElementById('importPickBlock');
  const previewBlock = document.getElementById('importPreviewBlock');
  const title = document.getElementById('importModalFileName');

  ieImportPreview = {
    fileName: fileName || 'файл',
    templates: parsed.templates,
    settings: parsed.settings,
    fileGroups: parsed.fileGroups
  };

  if (title) title.textContent = ieImportPreview.fileName;

  const bulkGroup = document.getElementById('importBulkGroup');
  if (bulkGroup) {
    bulkGroup.innerHTML = ieBuildGroupOptions(ieApi.getGroups(), '');
  }

  if (pickBlock) pickBlock.classList.add('hidden');
  if (previewBlock) previewBlock.classList.add('visible');

  ieRenderImportSettingsBlock();
  ieRenderImportList();
  ieApi.trackEvent('popup_import_open');
}

function ieResetImportPanel() {
  ieImportPreview = null;
  const pickBlock = document.getElementById('importPickBlock');
  const previewBlock = document.getElementById('importPreviewBlock');
  if (pickBlock) pickBlock.classList.remove('hidden');
  if (previewBlock) previewBlock.classList.remove('visible');
}

function ieApplyImport() {
  if (!ieCanImport() || !ieImportPreview) return;

  const applySettings = document.getElementById('importApplySettings')?.checked;
  const selectedTemplates = ieImportPreview.templates.filter((t) => t.selected && !t.invalid);

  for (const t of selectedTemplates) {
    const name = t.name.trim();
    const body = t.body.trim();
    if (!name || !body) {
      alert('У выбранных шаблонов должны быть название и текст');
      return;
    }
    if (body.length > IE_MAX_BODY_LENGTH) {
      alert(`Шаблон «${name}» слишком длинный`);
      return;
    }
  }

  const incomingSettings = ieImportPreview.settings;

  if (applySettings && incomingSettings) {
    const confirmed = confirm(
      'Применить настройки из файла? Текущие настройки расширения будут изменены.'
    );
    if (!confirmed) return;
  }

  let importedCount = 0;
  const newTemplates = [...ieApi.getTemplates()];
  const newGroups = [...ieApi.getGroups()];

  selectedTemplates.forEach((t) => {
    const group = t.group.trim();
    if (group && !newGroups.includes(group)) {
      newGroups.push(group);
    }
    newTemplates.push({
      id: ieApi.generateId(),
      name: t.name.trim(),
      group,
      body: t.body.trim()
    });
    importedCount += 1;
  });

  ieApi.setTemplates(newTemplates);
  ieApi.setGroups(newGroups);
  ieApi.saveTemplates();
  ieApi.saveGroups();

  if (applySettings && incomingSettings) {
    ieApi.applySettingsPatch(incomingSettings);
    ieApi.trackEvent('popup_import_settings_confirmed');
  }

  ieApi.refreshUiAfterImport();
  ieApi.trackEvent('popup_import_done');

  const parts = [];
  if (importedCount) parts.push(`Импортировано шаблонов: ${importedCount}`);
  if (applySettings && incomingSettings) parts.push('настройки применены');

  if (typeof ieApi.showStatus === 'function') {
    ieApi.showStatus(parts.join('. ') || 'Импорт завершён');
  } else if (parts.length) {
    alert(parts.join('. '));
  }

  ieResetImportPanel();
}

function ieHandleImportFile(file) {
  if (!file) return;

  if (file.size > IE_MAX_FILE_SIZE) {
    alert('Файл слишком большой (максимум 5 МБ)');
    ieApi.trackEvent('popup_import_error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const parsed = ieParseImportFile(e.target.result);
    if (parsed.error) {
      alert(parsed.error);
      ieApi.trackEvent('popup_import_error');
      return;
    }
    ieShowImportPreview(parsed, file.name);
  };
  reader.onerror = () => {
    alert('Не удалось прочитать файл');
    ieApi.trackEvent('popup_import_error');
  };
  reader.readAsText(file, 'UTF-8');
}

function ieTriggerImportFile() {
  const input = document.getElementById('importFileInput');
  if (input) {
    input.click();
    return;
  }
  if (!ieImportFileInput) {
    ieImportFileInput = document.createElement('input');
    ieImportFileInput.type = 'file';
    ieImportFileInput.accept = '.json,application/json';
    ieImportFileInput.style.display = 'none';
    ieImportFileInput.addEventListener('change', () => {
      const file = ieImportFileInput.files?.[0];
      ieImportFileInput.value = '';
      ieHandleImportFile(file);
    });
    document.body.appendChild(ieImportFileInput);
  }
  ieImportFileInput.click();
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

function bindImportExportControls() {
  document.getElementById('exportSubmitBtn')?.addEventListener('click', ieHandleExportSubmit);

  document.getElementById('exportSelectAll')?.addEventListener('click', () => {
    ieExportDraft.forEach((item) => { item.selected = true; });
    ieRenderExportList();
  });

  document.getElementById('exportDeselectAll')?.addEventListener('click', () => {
    ieExportDraft.forEach((item) => { item.selected = false; });
    ieRenderExportList();
  });

  document.getElementById('exportIncludeSettings')?.addEventListener('change', ieUpdateExportSubmitState);

  document.getElementById('importSubmitBtn')?.addEventListener('click', ieApplyImport);

  document.getElementById('importSelectAll')?.addEventListener('click', () => {
    if (!ieImportPreview) return;
    ieImportPreview.templates.forEach((t) => {
      if (!t.invalid) t.selected = true;
    });
    ieRenderImportList();
  });

  document.getElementById('importDeselectAll')?.addEventListener('click', () => {
    if (!ieImportPreview) return;
    ieImportPreview.templates.forEach((t) => { t.selected = false; });
    ieRenderImportList();
  });

  document.getElementById('importApplyBulkGroup')?.addEventListener('click', () => {
    if (!ieImportPreview) return;
    const group = document.getElementById('importBulkGroup')?.value ?? '';
    ieImportPreview.templates.forEach((t) => {
      if (t.selected && !t.invalid) t.group = group;
    });
    ieRenderImportList();
  });

  document.getElementById('importApplySettings')?.addEventListener('change', ieUpdateImportSubmitState);

  document.getElementById('importPickFileBtn')?.addEventListener('click', ieTriggerImportFile);
  document.getElementById('importPickAnotherBtn')?.addEventListener('click', () => {
    ieResetImportPanel();
    ieTriggerImportFile();
  });

  const fileInput = document.getElementById('importFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      ieHandleImportFile(file);
    });
  }
}

function initImportExportPage(api) {
  ieApi = api;
  bindImportExportControls();
  ieInitExportPanel();
  ieResetImportPanel();
}

function openImportExportWindow(tab) {
  chrome.windows.create({
    url: chrome.runtime.getURL(`import-export.html?tab=${tab}`),
    type: 'popup',
    width: 620,
    height: 760,
    focused: true
  });
}

function initImportExportPopup() {
  document.getElementById('openBackupBtn')?.addEventListener('click', () => {
    openImportExportWindow('export');
  });
}