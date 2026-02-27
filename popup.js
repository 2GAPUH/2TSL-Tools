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
  accountingPanel: true,
  grafanaSSH: true,
  reminder: true
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
const settingGrafanaSSH = document.getElementById('settingGrafanaSSH');
const settingReminder = document.getElementById('settingReminder');
const savedRegion = document.getElementById('savedRegion');
const savedFIO = document.getElementById('savedFIO');
const clearSavedDataBtn = document.getElementById('clearSavedData');

// Напоминалка
const remindersList = document.getElementById('remindersList');

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
function resizePopup() {
  // Получаем активную вкладку
  const activeTab = document.querySelector('.tab-content.active');
  if (!activeTab) return;
  
  // Сбрасываем высоту body для пересчёта
  document.body.style.height = 'auto';
  document.documentElement.style.height = 'auto';
  
  // Принудительный reflow
  void document.body.offsetHeight;
  
  // Вычисляем новую высоту: header + tabs + tab content + padding
  const headerHeight = document.querySelector('.tabs').offsetHeight || 41;
  const tabContentHeight = activeTab.offsetHeight;
  const padding = 32; // 16px top + 16px bottom
  
  const totalHeight = headerHeight + tabContentHeight + padding;
  
  // Устанавливаем высоту
  document.documentElement.style.height = totalHeight + 'px';
  document.body.style.height = totalHeight + 'px';
}

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
    
    // Изменяем размер popup под содержимое с задержкой для отрисовки
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resizePopup();
      });
    });
  });
});

// ==================== ЗАГРУЗКА ДАННЫХ ====================
function loadAllData() {
  chrome.storage.local.get(['templates', 'groups', 'settings', 'savedFormData', 'lastActiveTab', 'currentWorkingDate', 'requestsByDate', 'reminders'], (result) => {
    templates = result.templates || [];
    groups = result.groups || [];
    settings = result.settings || { omnichatTemplates: true, ttmButton: true, accountingPanel: true, grafanaSSH: true, reminder: true };
    savedFormData = result.savedFormData || { region: '', fio: '' };
    lastActiveTab = result.lastActiveTab || 'templates';
    activeWorkingDate = result.currentWorkingDate || getTodayStr();
    reminders = result.reminders || [];
    
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
    renderReminders(); // Загружаем напоминания сразу
    
    // Изменяем размер popup после загрузки данных
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resizePopup();
      });
    });
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
    
    // Пересчитываем размер
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resizePopup();
      });
    });
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
  settingGrafanaSSH.checked = settings.grafanaSSH;
  settingReminder.checked = settings.reminder;
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

settingGrafanaSSH.addEventListener('change', (e) => {
  settings.grafanaSSH = e.target.checked;
  saveSettings();
});

settingReminder.addEventListener('change', (e) => {
  settings.reminder = e.target.checked;
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

// ==================== НАПОМИНАЛКА ====================
let reminders = [];

function formatReminderTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  
  if (isToday) {
    return `Сегодня ${timeStr}`;
  } else {
    const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return `${dateStr} ${timeStr}`;
  }
}

function getTimeStatus(reminder) {
  const now = Date.now();
  const diff = reminder.remindAt - now;
  
  if (reminder.notified) {
    return 'notified'; // Уведомление уже показано
  } else if (diff < 0) {
    return 'overdue'; // Просрочено
  } else if (diff < 60000) {
    return 'soon'; // Меньше минуты
  }
  return 'pending'; // Ожидает
}

function renderReminders() {
  if (reminders.length === 0) {
    remindersList.innerHTML = `
      <div class="reminder-empty">
        <p>Нет активных напоминаний</p>
        <p>Нажмите кнопку ⏰ в TTM, чтобы создать напоминание</p>
      </div>
    `;
    return;
  }
  
  // Сортируем по времени (ближайшие сначала)
  const sorted = [...reminders].sort((a, b) => a.remindAt - b.remindAt);
  
  remindersList.innerHTML = sorted.map(reminder => {
    const status = getTimeStatus(reminder);
    const statusClass = status === 'notified' ? 'notified' : status === 'overdue' ? 'overdue' : '';
    const statusText = status === 'notified' ? '✅ Выполнено' : 
                       status === 'overdue' ? '❌ Просрочено' : 
                       formatReminderTime(reminder.remindAt);
    
    return `
      <div class="reminder-item" data-id="${reminder.id}">
        <div class="reminder-header">
          <a class="reminder-ticket" href="${reminder.ticketUrl}" target="_blank" title="Открыть заявку">
            #${reminder.ticketNumber}
          </a>
          <span class="reminder-time ${statusClass}">${statusText}</span>
        </div>
        ${reminder.description ? `<div class="reminder-description">${escapeHtml(reminder.description)}</div>` : ''}
        <div class="reminder-actions">
          ${status !== 'notified' ? `<button class="reminder-btn reminder-btn-edit" data-id="${reminder.id}">
            ✏️ Изменить время
          </button>` : ''}
          <button class="reminder-btn reminder-btn-delete" data-id="${reminder.id}">
            🗑️ Удалить
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  // Добавляем обработчики
  remindersList.querySelectorAll('.reminder-btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteReminder(btn.dataset.id));
  });
  
  remindersList.querySelectorAll('.reminder-btn-edit').forEach(btn => {
    btn.addEventListener('click', () => editReminderTime(btn.dataset.id));
  });
}

async function loadReminders() {
  const result = await chrome.storage.local.get(['reminders']);
  reminders = result.reminders || [];
  renderReminders();
}

async function deleteReminder(id) {
  if (!confirm('Удалить это напоминание?')) return;
  
  await chrome.runtime.sendMessage({ action: 'removeReminder', reminderId: id });
  reminders = reminders.filter(r => r.id !== id);
  renderReminders();
}

function editReminderTime(id) {
  const reminder = reminders.find(r => r.id === id);
  if (!reminder) return;
  
  // Создаём модальное окно редактирования
  const existingModal = document.getElementById('edit-reminder-modal');
  if (existingModal) existingModal.remove();
  
  // Находим элемент напоминания, под которым нужно показать форму
  const reminderItem = document.querySelector(`.reminder-item[data-id="${id}"]`);
  
  const modal = document.createElement('div');
  modal.id = 'edit-reminder-modal';
  modal.innerHTML = `
    <div class="reminder-edit-content" style="
      position: relative;
      background: white;
      border-radius: 8px;
      width: 100%;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      border: 1px solid #c0d3e2;
      margin-top: 10px;
    ">
        <div class="tsl-modal-header" style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid #e0e0e0;
        ">
          <h3 style="margin: 0; font-size: 14px; color: #333;">✏️ Изменить время для #${reminder.ticketNumber}</h3>
          <button class="tsl-modal-close" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #666;">&times;</button>
        </div>
        <div class="tsl-modal-body" style="padding: 12px 16px;">
          <div class="tsl-form-group" style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 500; color: #333;">Тип времени</label>
            <div style="display: flex; flex-wrap: wrap; gap: 12px;">
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; white-space: nowrap;">
                <input type="radio" name="editTimerType" value="minutes" checked>
                <span>Через N минут</span>
              </label>
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; white-space: nowrap;">
                <input type="radio" name="editTimerType" value="time">
                <span>В указанное время</span>
              </label>
            </div>
          </div>
          
          <div class="tsl-form-group tsl-minutes-group" style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500; color: #333;">Минуты</label>
            <input type="number" id="editTimerMinutes" placeholder="Например: 30" min="1" max="1440" style="
              width: 100%;
              padding: 8px 10px;
              border: 1px solid #ccc;
              border-radius: 4px;
              font-size: 13px;
              box-sizing: border-box;
            ">
          </div>
          
          <div class="tsl-form-group tsl-time-group" style="display: none; margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500; color: #333;">Время (ЧЧ:ММ)</label>
            <input type="time" id="editTimerTime" style="
              width: 100%;
              padding: 8px 10px;
              border: 1px solid #ccc;
              border-radius: 4px;
              font-size: 13px;
              box-sizing: border-box;
            ">
          </div>
          
          <div class="tsl-form-group" style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 4px; font-size: 12px; font-weight: 500; color: #333;">Описание</label>
            <textarea id="editTimerDescription" placeholder="Описание напоминания" rows="2" style="
              width: 100%;
              padding: 8px 10px;
              border: 1px solid #ccc;
              border-radius: 4px;
              font-size: 13px;
              box-sizing: border-box;
              resize: vertical;
            ">${reminder.description || ''}</textarea>
          </div>
        </div>
        <div class="tsl-modal-footer" style="
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 10px 16px;
          border-top: 1px solid #e0e0e0;
        ">
          <button class="tsl-btn tsl-btn-secondary" id="editCancelBtn" style="
            padding: 6px 14px;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            background: #6c757d;
            color: white;
          ">Отмена</button>
          <button class="tsl-btn tsl-btn-primary" id="editSaveBtn" style="
            padding: 6px 14px;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
            background: #007bff;
            color: white;
          ">Сохранить</button>
        </div>
      </div>
  `;
  
  // Добавляем модальное окно после конкретного элемента напоминания
  if (reminderItem) {
    reminderItem.parentNode.insertBefore(modal, reminderItem.nextSibling);
  } else {
    // Fallback - добавляем в конец списка
    remindersList.parentNode.insertBefore(modal, remindersList.nextSibling);
  }
  
  // Изменяем размер popup под содержимое
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      resizePopup();
    });
  });
  
  // Функция для закрытия
  const closeModal = () => {
    modal.remove();
    // Восстанавливаем размер после закрытия
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resizePopup();
      });
    });
  };
  
  // Обработчики
  const closeBtn = modal.querySelector('.tsl-modal-close');
  const cancelBtn = modal.querySelector('#editCancelBtn');
  const saveBtn = modal.querySelector('#editSaveBtn');
  const radioButtons = modal.querySelectorAll('input[name="editTimerType"]');
  const minutesGroup = modal.querySelector('.tsl-minutes-group');
  const timeGroup = modal.querySelector('.tsl-time-group');
  
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  
  // Переключение типа
  radioButtons.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'minutes') {
        minutesGroup.style.display = 'block';
        timeGroup.style.display = 'none';
      } else {
        minutesGroup.style.display = 'none';
        timeGroup.style.display = 'block';
      }
    });
  });
  
  // Сохранение
  saveBtn.addEventListener('click', () => {
    const timerType = modal.querySelector('input[name="editTimerType"]:checked').value;
    const minutes = modal.querySelector('#editTimerMinutes').value;
    const specificTime = modal.querySelector('#editTimerTime').value;
    const description = modal.querySelector('#editTimerDescription').value.trim();
    
    let newRemindAt = null;
    
    if (timerType === 'minutes') {
      if (!minutes) {
        alert('Укажите количество минут');
        return;
      }
      newRemindAt = Date.now() + (parseInt(minutes) * 60 * 1000);
    } else {
      if (!specificTime) {
        alert('Укажите время напоминания');
        return;
      }
      
      const [hours, mins] = specificTime.split(':').map(Number);
      const now = new Date();
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, mins);
      
      if (targetDate.getTime() <= now.getTime()) {
        targetDate.setDate(targetDate.getDate() + 1);
      }
      
      newRemindAt = targetDate.getTime();
    }
    
    chrome.runtime.sendMessage({
      action: 'updateReminder',
      data: { id, remindAt: newRemindAt, description }
    }, (response) => {
      if (response?.success) {
        reminder.remindAt = newRemindAt;
        reminder.description = description;
        reminder.notified = false;
        renderReminders();
        closeModal();
      } else {
        alert('Ошибка при обновлении напоминания');
      }
    });
  });
}

// Слушаем изменения в storage для напоминаний
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.reminders) {
    reminders = changes.reminders.newValue || [];
    renderReminders();
  }
});
