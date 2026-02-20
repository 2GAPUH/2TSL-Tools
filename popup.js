// ==================== ХЕЛПЕРЫ ====================
const pad2 = (n) => String(n).padStart(2, "0");
const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const getTimeStr = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

// ==================== ХРАНИЛИЩЕ ====================
let templates = [];
let groups = [];
let settings = {
  omnichatTemplates: true,
  ttmButton: true,
  accountingPanel: true
};
let savedFormData = {
  region: '',
  fio: ''
};
let currentFilter = "";
let lastActiveTab = "templates";
let activeWorkingDate = getTodayStr();

// ==================== ЭЛЕМЕНТЫ DOM ====================
const templatesList = document.getElementById('templatesList');
const addTemplateBtn = document.getElementById('addTemplateBtn');
const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const templateForm = document.getElementById('templateForm');
const templateId = document.getElementById('templateId');
const templateName = document.getElementById('templateName');
const templateGroup = document.getElementById('templateGroup');
const templateText = document.getElementById('templateText');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelBtn = document.getElementById('cancelBtn');
const groupFilter = document.getElementById('groupFilter');
const groupsModalOverlay = document.getElementById('groupsModalOverlay');
const closeGroupsModalBtn = document.getElementById('closeGroupsModalBtn');
const closeGroupsModalBtn2 = document.getElementById('closeGroupsModalBtn2');
const groupsList = document.getElementById('groupsList');
const newGroupName = document.getElementById('newGroupName');
const addGroupBtn = document.getElementById('addGroupBtn');

// Настройки
const settingOmnichatTemplates = document.getElementById('settingOmnichatTemplates');
const settingTTMButton = document.getElementById('settingTTMButton');
const settingAccountingPanel = document.getElementById('settingAccountingPanel');
const savedRegion = document.getElementById('savedRegion');
const savedFIO = document.getElementById('savedFIO');
const clearSavedDataBtn = document.getElementById('clearSavedData');

// Учёт заявок
const ticketEls = {
  currentDate: document.getElementById("currentDate"),
  ticketNumber: document.getElementById("ticketNumber"),
  ticketComment: document.getElementById("ticketComment"),
  workHours: document.getElementById("workHours"),
  workMinutes: document.getElementById("workMinutes"),
  addClosed: document.getElementById("addClosed"),
  addField: document.getElementById("addField"),
  removeLast: document.getElementById("removeLast"),
  countClosed: document.getElementById("countClosed"),
  countField: document.getElementById("countField"),
  countTotal: document.getElementById("countTotal"),
  entries: document.getElementById("entries"),
  finishDay: document.getElementById("finishDay"),
  startNewDay: document.getElementById("startNewDay"),
  performance: document.getElementById("performance"),
  closurePercent: document.getElementById("closurePercent")
};

// ==================== ТАБЫ ====================
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + '-tab').classList.add('active');
    
    // Сохраняем последнюю активную вкладку
    lastActiveTab = tab.dataset.tab;
    chrome.storage.local.set({ lastActiveTab });
    
    if (tab.dataset.tab === 'settings') {
      loadSavedFormData();
    }
  });
});

// ==================== ЗАГРУЗКА ДАННЫХ ====================
function loadAllData() {
  chrome.storage.local.get(['templates', 'groups', 'settings', 'savedFormData', 'lastActiveTab', 'currentWorkingDate', 'requestsByDate'], (result) => {
    templates = result.templates || [];
    groups = result.groups || [];
    settings = result.settings || { omnichatTemplates: true, ttmButton: true, accountingPanel: true };
    savedFormData = result.savedFormData || { region: '', fio: '' };
    lastActiveTab = result.lastActiveTab || 'templates';
    activeWorkingDate = result.currentWorkingDate || getTodayStr();
    
    // Если переменной еще нет в памяти - создаем
    if (!result.currentWorkingDate) {
      chrome.storage.local.set({ currentWorkingDate: activeWorkingDate });
    }
    
    // Инициализируем данные для текущей даты
    const allData = result.requestsByDate || {};
    if (!allData[activeWorkingDate]) {
      allData[activeWorkingDate] = { entries: [], hours: 0, minutes: 0 };
      chrome.storage.local.set({ requestsByDate: allData });
    }
    
    // Восстанавливаем последнюю активную вкладку
    switchToTab(lastActiveTab);
    
    renderTemplates();
    renderGroupFilter();
    renderTemplateGroupSelect();
    renderGroupsList();
    applySettings();
    updateTicketsUI(activeWorkingDate, allData[activeWorkingDate]);
  });
}

// Переключение на вкладку
function switchToTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  const tabContent = document.getElementById(tabName + '-tab');
  
  if (tab && tabContent) {
    tab.classList.add('active');
    tabContent.classList.add('active');
    
    if (tabName === 'settings') {
      loadSavedFormData();
    }
  }
}

function saveTemplates() {
  chrome.storage.local.set({ templates });
}

function saveGroups() {
  chrome.storage.local.set({ groups });
}

function saveSettings() {
  chrome.storage.local.set({ settings });
}

function saveFormData() {
  chrome.storage.local.set({ savedFormData });
}

// ==================== СИНХРОНИЗАЦИЯ ====================
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    // Если дата сменилась в другом месте (например, в content-accounting.js)
    if (changes.currentWorkingDate) {
      activeWorkingDate = changes.currentWorkingDate.newValue;
      chrome.storage.local.get(['requestsByDate'], (res) => {
        updateTicketsUI(activeWorkingDate, res.requestsByDate?.[activeWorkingDate]);
      });
    }
    // Если обновились данные заявок
    if (changes.requestsByDate) {
      updateTicketsUI(activeWorkingDate, changes.requestsByDate.newValue?.[activeWorkingDate]);
    }
    // Проверяем изменение настроек
    if (changes.settings) {
      settings = changes.settings.newValue;
    }
    if (changes.templates || changes.groups) {
      chrome.storage.local.get(['templates', 'groups'], (res) => {
        templates = res.templates || [];
        groups = res.groups || [];
        renderTemplates();
        renderGroupFilter();
        renderTemplateGroupSelect();
        renderGroupsList();
      });
    }
  }
});

// ==================== НАСТРОЙКИ ====================
function applySettings() {
  settingOmnichatTemplates.checked = settings.omnichatTemplates;
  settingTTMButton.checked = settings.ttmButton;
  settingAccountingPanel.checked = settings.accountingPanel;
}

function loadSavedFormData() {
  savedRegion.textContent = savedFormData.region || '-';
  savedFIO.textContent = savedFormData.fio || '-';
}

settingOmnichatTemplates.addEventListener('change', (e) => {
  settings.omnichatTemplates = e.target.checked;
  saveSettings();
});

settingTTMButton.addEventListener('change', (e) => {
  settings.ttmButton = e.target.checked;
  saveSettings();
});

settingAccountingPanel.addEventListener('change', (e) => {
  settings.accountingPanel = e.target.checked;
  saveSettings();
});

clearSavedDataBtn.addEventListener('click', () => {
  if (confirm('Вы уверены, что хотите очистить сохраненные данные?')) {
    savedFormData = { region: '', fio: '' };
    saveFormData();
    loadSavedFormData();
  }
});

// ==================== УЧЁТ ЗАЯВОК ====================
function updateTicketsUI(date, data) {
  if (!data) data = { entries: [], hours: 0, minutes: 0 };
  ticketEls.currentDate.textContent = date;
  
  const entries = data.entries || [];
  ticketEls.entries.innerHTML = entries.length ? entries.map(e => `
    <li>[${e.time}] ${e.type==='closed'?'✅':'🚗'} ${e.number||''} ${e.comment||''}</li>
  `).join('') : '<li>Записей нет</li>';
  
  const closed = entries.filter(e => e.type === 'closed').length;
  ticketEls.countClosed.textContent = closed;
  ticketEls.countField.textContent = entries.filter(e => e.type === 'field').length;
  ticketEls.countTotal.textContent = entries.length;
  
  if (document.activeElement !== ticketEls.workHours) ticketEls.workHours.value = data.hours || 0;
  if (document.activeElement !== ticketEls.workMinutes) ticketEls.workMinutes.value = data.minutes || 0;
  
  const h = parseInt(data.hours || 0);
  const m = parseInt(data.minutes || 0);
  const totalH = h + (m / 60);
  
  if (totalH > 0) {
    const lunch = totalH >= 12 ? 1.75 : 0.75;
    const work = totalH - lunch;
    const perf = work > 0 ? (entries.length / work).toFixed(2) : 0;
    ticketEls.performance.textContent = `Производительность: ${perf}`;
  } else {
    ticketEls.performance.textContent = 'Производительность: —';
  }
  
  const perc = entries.length > 0 ? ((closed / entries.length) * 100).toFixed(2) : 0;
  ticketEls.closurePercent.textContent = `Процент закрытия: ${perc}%`;
}

async function addTicketEntry(type) {
  const num = ticketEls.ticketNumber.value.trim();
  const com = ticketEls.ticketComment.value.trim();
  if (!num && !com) return alert('Введите номер заявки или комментарий');
  
  const today = activeWorkingDate;
  const res = await chrome.storage.local.get(['requestsByDate']);
  const allData = res.requestsByDate || {};
  if (!allData[today]) allData[today] = { entries: [], hours: 0, minutes: 0 };
  
  const exists = allData[today].entries.some(e => 
    (num && e.number === num && e.type === type) || 
    (!num && com && e.comment === com && e.type === type)
  );
  
  if (exists) return alert('Уже добавлено');
  
  allData[today].entries.push({ time: getTimeStr(), type, number: num, comment: com });
  await chrome.storage.local.set({ requestsByDate: allData });
  ticketEls.ticketNumber.value = '';
  ticketEls.ticketComment.value = '';
}

async function removeLastTicketEntry() {
  const today = activeWorkingDate;
  const res = await chrome.storage.local.get(['requestsByDate']);
  const allData = res.requestsByDate || {};
  if (allData[today]?.entries?.length) {
    allData[today].entries.pop();
    await chrome.storage.local.set({ requestsByDate: allData });
  }
}

async function saveTicketTime() {
  const today = activeWorkingDate;
  const res = await chrome.storage.local.get(['requestsByDate']);
  const allData = res.requestsByDate || {};
  if (!allData[today]) allData[today] = { entries: [] };
  
  allData[today].hours = parseInt(ticketEls.workHours.value) || 0;
  allData[today].minutes = parseInt(ticketEls.workMinutes.value) || 0;
  await chrome.storage.local.set({ requestsByDate: allData });
}

async function startNewDay() {
  if (!confirm('Начать новый день?')) return;
  
  const realToday = getTodayStr();
  activeWorkingDate = realToday;
  
  const res = await chrome.storage.local.get(['requestsByDate']);
  const allData = res.requestsByDate || {};
  allData[realToday] = { entries: [], hours: 0, minutes: 0 };
  
  await chrome.storage.local.set({ 
    requestsByDate: allData,
    currentWorkingDate: realToday
  });
  
  ticketEls.ticketNumber.value = '';
  ticketEls.ticketComment.value = '';
  ticketEls.workHours.value = 0;
  ticketEls.workMinutes.value = 0;
}

async function finishDay() {
  const today = activeWorkingDate;
  const res = await chrome.storage.local.get(['requestsByDate']);
  const dayData = res.requestsByDate?.[today];
  if (!dayData || !dayData.entries.length) return alert('Нет данных для выгрузки');

  let csv = '\uFEFFДата;Время;Тип;Номер;Комментарий\n';
  dayData.entries.forEach(e => {
    csv += `${today};${e.time};${e.type==='closed'?'Закрыто':'Выезд'};${e.number || ''};${e.comment || ''}\n`;
  });
  
  const perfText = ticketEls.performance.textContent;
  csv += `\n;;ИТОГО;;\n;;Всего;${dayData.entries.length};\n;;Отработано;${ticketEls.workHours.value}ч ${ticketEls.workMinutes.value}м;\n;;${perfText};;`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Otchet_${today}.csv`;
  link.click();
}

// Инициализация обработчиков для вкладки "Учёт заявок"
ticketEls.addClosed.onclick = () => addTicketEntry('closed');
ticketEls.addField.onclick = () => addTicketEntry('field');
ticketEls.removeLast.onclick = removeLastTicketEntry;
ticketEls.startNewDay.onclick = startNewDay;
ticketEls.finishDay.onclick = finishDay;
ticketEls.workHours.oninput = saveTicketTime;
ticketEls.workMinutes.oninput = saveTicketTime;

// ==================== ШАБЛОНЫ ====================
function renderTemplates() {
  const selectedGroup = groupFilter.value;
  const filteredTemplates = selectedGroup ? 
    templates.filter(t => t.group === selectedGroup) : 
    templates;

  if (filteredTemplates.length === 0) {
    templatesList.innerHTML = `
      <div class="empty-state">
        <p>Шаблонов пока нет</p>
        <p>Нажмите "Добавить", чтобы создать первый шаблон</p>
      </div>
    `;
    return;
  }

  templatesList.innerHTML = filteredTemplates.map(template => `
    <div class="template-item" data-id="${template.id}">
      <div class="template-header">
        <div style="flex: 1;">
          <h3 class="template-title">${escapeHtml(template.name)}</h3>
          ${template.group ? `<div class="template-group">${escapeHtml(template.group)}</div>` : ''}
        </div>
        <div class="template-actions">
          <button class="action-btn copy-btn" data-id="${template.id}" title="Копировать">
            <img src="${chrome.runtime.getURL('copy.png')}" alt="Копировать">
          </button>
          <button class="action-btn paste-btn" data-id="${template.id}" title="Вставить в сообщение">
            <img src="${chrome.runtime.getURL('paste.png')}" alt="Вставить">
          </button>
          <button class="action-btn edit-btn" data-id="${template.id}" title="Редактировать">
            <img src="${chrome.runtime.getURL('edit.png')}" alt="Редактировать">
          </button>
          <button class="action-btn delete-btn" data-id="${template.id}" title="Удалить">
            <img src="${chrome.runtime.getURL('delete.png')}" alt="Удалить">
          </button>
        </div>
      </div>
      <p class="template-body">${escapeHtml(template.body)}</p>
    </div>
  `).join('');

  addEventListenersToButtons();
}

function renderGroupFilter() {
  const currentValue = groupFilter.value;
  
  groupFilter.innerHTML = '<option value="">Все группы</option>' +
    groups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('') +
    '<option value="manage_groups" class="manage-groups-option">Управление группами</option>';

  if (currentValue && groups.includes(currentValue)) {
    groupFilter.value = currentValue;
  } else if (currentValue === "manage_groups") {
    openGroupsModal();
    groupFilter.value = "";
  }
}

function renderTemplateGroupSelect() {
  templateGroup.innerHTML = '<option value="">Без группы</option>' +
    groups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
}

function renderGroupsList() {
  if (groups.length === 0) {
    groupsList.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Групп пока нет</p>';
    return;
  }

  groupsList.innerHTML = groups.map(g => `
    <div class="group-item">
      <span>${escapeHtml(g)}</span>
      <div class="group-actions">
        <button class="action-btn delete-btn" data-group="${escapeHtml(g)}" title="Удалить">
          <img src="${chrome.runtime.getURL('delete.png')}" alt="Удалить">
        </button>
      </div>
    </div>
  `).join('');

  addGroupDeleteListeners();
}

// ==================== ОБРАБОТЧИКИ ====================
function addEventListenersToButtons() {
  templatesList.removeEventListener('click', handleTemplateActions);
  templatesList.addEventListener('click', handleTemplateActions);
}

function handleTemplateActions(e) {
  const button = e.target.closest('.action-btn');
  if (!button) return;
  
  const id = button.dataset.id;
  
  if (button.classList.contains('copy-btn')) {
    copyTemplateToClipboard(id);
  } else if (button.classList.contains('paste-btn')) {
    pasteTemplateToMessage(id);
  } else if (button.classList.contains('edit-btn')) {
    editTemplate(id);
  } else if (button.classList.contains('delete-btn')) {
    deleteTemplate(id);
  }
}

function addGroupDeleteListeners() {
  groupsList.removeEventListener('click', handleGroupDelete);
  groupsList.addEventListener('click', handleGroupDelete);
}

function handleGroupDelete(e) {
  const btn = e.target.closest('.delete-btn');
  if (btn) {
    deleteGroup(btn.dataset.group);
  }
}

// ==================== ДЕЙСТВИЯ С ШАБЛОНАМИ ====================
function copyTemplateToClipboard(id) {
  const template = templates.find(t => t.id === id);
  if (!template) return;

  navigator.clipboard.writeText(template.body).catch(err => {
    const textArea = document.createElement('textarea');
    textArea.value = template.body;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  });
}

function pasteTemplateToMessage(id) {
  const template = templates.find(t => t.id === id);
  if (!template) return;

  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'insertTemplate',
        text: template.body
      }, (response) => {
        if (response?.success) {
          window.close();
        }
      });
    }
  });
}

function editTemplate(id) {
  const template = templates.find(t => t.id === id);
  if (!template) return;

  modalTitle.textContent = 'Редактировать шаблон';
  templateId.value = template.id;
  templateName.value = template.name;
  templateGroup.value = template.group || '';
  templateText.value = template.body;
  modalOverlay.style.display = 'flex';
  templateName.focus();
}

function deleteTemplate(id) {
  if (confirm('Удалить этот шаблон?')) {
    templates = templates.filter(t => t.id !== id);
    saveTemplates();
    renderTemplates();
  }
}

function addGroup() {
  const groupName = newGroupName.value.trim();
  if (!groupName) {
    alert('Введите название группы');
    return;
  }
  if (groups.includes(groupName)) {
    alert('Группа уже существует');
    return;
  }

  groups.push(groupName);
  saveGroups();
  renderGroupFilter();
  renderTemplateGroupSelect();
  renderGroupsList();
  newGroupName.value = '';
}

function deleteGroup(groupName) {
  if (!confirm(`Удалить группу "${groupName}"?`)) return;

  groups = groups.filter(g => g !== groupName);
  templates.forEach(t => {
    if (t.group === groupName) t.group = '';
  });

  saveGroups();
  saveTemplates();
  renderGroupFilter();
  renderTemplateGroupSelect();
  renderGroupsList();
  renderTemplates();
}

// ==================== УТИЛИТЫ ====================
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ==================== МОДАЛЬНЫЕ ОКНА ====================
function openAddModal() {
  modalTitle.textContent = 'Добавить шаблон';
  templateId.value = '';
  templateName.value = '';
  templateGroup.value = '';
  templateText.value = '';
  modalOverlay.style.display = 'flex';
  templateName.focus();
}

function closeModal() {
  modalOverlay.style.display = 'none';
  templateForm.reset();
}

function openGroupsModal() {
  groupsModalOverlay.style.display = 'flex';
  newGroupName.focus();
}

function closeGroupsModal() {
  groupsModalOverlay.style.display = 'none';
  newGroupName.value = '';
  groupFilter.value = "";
  renderTemplates();
}

// ==================== СОБЫТИЯ ====================
addTemplateBtn.addEventListener('click', openAddModal);
closeModalBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);

groupFilter.addEventListener('change', function() {
  if (this.value === "manage_groups") {
    openGroupsModal();
    this.value = "";
  } else {
    renderTemplates();
  }
});

closeGroupsModalBtn.addEventListener('click', closeGroupsModal);
closeGroupsModalBtn2.addEventListener('click', closeGroupsModal);
addGroupBtn.addEventListener('click', addGroup);

newGroupName.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addGroup();
  }
});

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

groupsModalOverlay.addEventListener('click', (e) => {
  if (e.target === groupsModalOverlay) closeGroupsModal();
});

templateForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const id = templateId.value || generateId();
  const name = templateName.value.trim();
  const group = templateGroup.value;
  const body = templateText.value.trim();

  if (!name || !body) {
    alert('Заполните все обязательные поля');
    return;
  }

  if (group && !groups.includes(group)) {
    groups.push(group);
    saveGroups();
    renderGroupFilter();
    renderTemplateGroupSelect();
    renderGroupsList();
  }

  const existingIndex = templates.findIndex(t => t.id === id);
  if (existingIndex !== -1) {
    templates[existingIndex] = { id, name, group, body };
  } else {
    templates.push({ id, name, group, body });
  }

  saveTemplates();
  renderTemplates();
  closeModal();
});

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('DOMContentLoaded', loadAllData);
