# 🧰 2TSL toolbox

> Набор инструментов для повышения эффективности работы сотрудников технической поддержки — управление шаблонами, навигация между системами, учёт заявок, напоминания и автоматизация рутинных задач.

<p align="center">
  <img src="icons/icon.png" alt="2TSL toolbox icon" width="80">
</p>

<p align="center">
  <b>Версия:</b> 0.8.0 &nbsp;·&nbsp;
  <b>Манифест:</b> V3 &nbsp;·&nbsp;
  <b>Зависимости:</b> 0 (расширение) &nbsp;·&nbsp;
  <b>Объём кода:</b> ~10 000+ строк
</p>

---

## ✨ Возможности

| Возможность | Описание |
|-------------|----------|
| 📋 **Шаблоны** | CRUD-менеджер текстовых шаблонов с группами, поиском и вставкой прямо в чат |
| 🔗 **Навигация** | Кликабельные ссылки на НЛС и номера заявок в Omnichat → мгновенный переход в TTM |
| 🔀 **Межсистемный мост** | TTM → Ассистент (автозаполнение формы), Onyma, SIPAL — одним кликом |
| 📊 **Учёт заявок** | Боковая панель в Omnichat: закрытые, выезды, статистика, CSV-экспорт |
| ⏱ **Напоминания** | Таймеры в TTM с уведомлениями Chrome, редактирование и автосборка |
| 🌐 **Grafana → SSH** | Кликабельные IP-адреса в дашбордах с автоматическим переходом на SSH-терминал |
| 📈 **Аналитика** | Анонимная статистика использования через Google Таблицы (батч раз в 30 мин) |
| 💬 **Обратная связь** | Отправка отзывов и багрепортов из настроек расширения |
| 🌙 **Тёмная тема** | Тёмная тема popup, Argus и Axiros (отдельные переключатели, общая палитра) |
| ⚙️ **Гибкие настройки** | Переключатели модулей, масштаб popup, порядок шаблонов |
| 💾 **Резервная копия** | Импорт/экспорт шаблонов: JSON-файл (всем) и облако по токену |
| ↕️ **Порядок шаблонов** | Кнопки ▲/▼ или перетаскивание — на выбор в настройках |

---

## 🗺 Карта навигации между системами

```
Omnichat (НЛС / Тикет)
    ├──→ TTM (автопоиск)
    │       ├──→ Форма ассистента (автозаполнение: номер, услуга, РФ, технология)
    │       ├──→ Onyma (автопоиск по ИЛС, начинается с 4)
    │       └──→ SIPAL (автопоиск по ИЛС, начинается с 2)
    └──→ Напоминания (таймер на TTM → уведомление в Chrome)

Grafana (IP-адреса)
    └──→ SSH-терминал (автозаполнение IP по региону)
```

---

## 📁 Структура проекта

```
2TSL-Tools/
├── manifest.json               # Chrome Extension Manifest V3
├── popup.html / popup.js       # UI: шаблоны, учёт, напоминания, настройки
├── background.js               # Service worker: напоминания, маршрутизация
├── analytics.js                # Анонимная аналитика → Google Sheets
├── cloud-sync.js               # Облачный обмен шаблонами по токену
├── import-export.html          # Страница резервного копирования
├── popup-import-export.js      # Логика импорта/экспорта (файл + облако)
├── import-export-page.js       # Инициализация страницы backup
├── omnichat/                   # Omnichat: шаблоны «Дополнительно» + ссылки TTM
│   ├── namespace.js / state.js / constants.js / utils.js
│   ├── draft-insert.js / ttm-links.js / templates-modal.js / init.js
├── content-accounting.js       # Omnichat: боковая панель учёта заявок
├── content-ttm.js              # TTM: кнопки, автопоиск, конструктор комментариев
├── content-form.js             # Автозаполнение формы ассистента
├── content-volgahelp.js        # volgahelp.ru: черновики и копирование
├── content-argus-theme.js      # Argus: тёмная тема (inject CSS)
├── argus-dark.css              # Argus: палитра slate + framework overrides
├── content-axiros-theme.js     # Axiros: тёмная тема (inject CSS)
├── axiros-dark.css             # Axiros: Bootstrap 3 overrides + палитры
├── content-grafana.js          # Grafana: IP → SSH переход
├── content-epd-mac.js          # EPD customers: MAC hover → OUI год/месяц + вендор
├── content-ssh.js              # SSH: автозаполнение IP
├── content-onyma.js            # Onyma: автозаполнение поиска
├── content-sipal.js            # SIPAL: автозаполнение поиска
├── build.bat                   # Сборка ZIP (7-Zip, только runtime)
├── google-sheets-api.gs        # Apps Script для Google Таблицы (локально)
├── scripts/
│   └── build_analytics_dashboard.py  # Оформление xlsx-отчёта и графики
├── AI_CONTEXT.md               # Контекст проекта для AI-ассистентов
├── AGENTS.md                   # Always-on правила для агентов
├── AGENT_WORKFLOW.md           # Процесс: план → вопросы → реализация
└── icons/                      # Иконки (светлая / тёмная версии)
```

---

## 🔧 Модули

### Popup — Всплывающее окно

Четыре вкладки:

- **Шаблоны** — CRUD, группы, поиск, копирование и вставка в чат Omnichat
- **Учёт заявок** — трекинг закрытых заявок и выездов, статистика, CSV-экспорт
- **Напоминалка** — просмотр, редактирование и удаление напоминаний
- **Настройки** — переключатели модулей, конфиденциальность, тёмная тема, обратная связь

### Content Scripts

| Файл | Система | Функционал |
|------|---------|-----------|
| `omnichat/*` | `omnichat.rt.ru` | Вкладка «Дополнительно»; автолинковка НЛС и заявок |
| `content-accounting.js` | `omnichat.rt.ru` | Плавающая панель учёта заявок |
| `content-ttm.js` | `www.ttm.rt.ru` | Кнопки Ассистент / Таймер / Onyma / SIPAL; мягкий автопоиск |
| `content-form.js` | `bzbti.rt.ru` | Автозаполнение формы ассистента (только целевая вкладка) |
| `content-volgahelp.js` | `volgahelp.ru` | Конструктор комментария: черновики, «Скопировать всё» |
| `content-argus-theme.js` + `argus-dark.css` | `argus.rt.ru`, `*.argus.rt.ru` | Тёмная тема Argus + портал (палитры slate/black/navy) |
| `content-axiros-theme.js` + `axiros-dark.css` | `acs-tr69.sz.rt.ru:4673`, `tr069.south.rt.ru:9673`, `10.82.16.11:9673` | Тёмная тема Axiros (Bootstrap 3) |
| `content-grafana.js` | `epd.rt.ru/stb-events` | IP → SSH (Волга, Юг, СЗ) |
| `content-epd-mac.js` | `epd.rt.ru/customers` | Наведение на MAC → вендор + YYYY-MM (OUI, maclookup.app) |
| `content-ssh.js` | `10.x.x.x` | Автозаполнение IP |
| `content-onyma.js` | `onymaweb.south.rt.ru` | Автопоиск ИЛС |
| `content-sipal.js` | `sipal.sz.rt.ru` | Автопоиск НЛС |

### Background — Service Worker

- Анонимная аналитика (батч каждые 30 мин → Google Sheets)
- Система напоминаний (`chrome.alarms` + `chrome.notifications`)
- Маршрутизация сообщений между popup и content scripts
- `openTtmSearch` / `openAssistantForm` — открытие вкладки + запись bridge-данных с `targetTabId`
- Автовосстановление alarms при перезапуске браузера

---

## ⚙️ Настройки

| Переключатель | По умолчанию | Описание |
|---------------|:------------:|----------|
| `omnichatTemplates` | ✅ | Вкладка пользовательских шаблонов в Omnichat |
| `omnichatTTMLinks` | ✅ | Кликабельные ссылки НЛС/заявок в чате |
| `ttmButton` | ✅ | Кнопка TTM → Форма ассистента |
| `accountingPanel` | ✅ | Боковая панель учёта заявок |
| `grafanaSSH` | ✅ | Кликабельные IP → SSH в Grafana |
| `epdMacYear` | ✅ | EPD customers: подсказка OUI (вендор + месяц) при наведении на MAC |
| `reminder` | ✅ | Кнопка таймера/напоминаний в TTM |
| `ttmOnyma` | ✅ | Кнопка перехода в Onyma |
| `ttmSipal` | ✅ | Кнопка перехода в SIPAL |
| `darkMode` | ❌ | Тёмная тема для popup |
| `argusDarkTheme` | ❌ | Тёмная тема Argus (портал + регионы) |
| `axirosDarkTheme` | ❌ | Тёмная тема Axiros (СЗ / Юг / Волга) |
| `systemsDarkPalette` | `slate` | Общая палитра Argus+Axiros: `slate` (как ЕПД), `black`, `navy` |
| `analyticsEnabled` | ✅ | Анонимная статистика использования |
| `popupUnifiedTabSize` | ❌ | Один размер окна для всех вкладок popup |
| `templateReorderMode` | `buttons` | Порядок шаблонов: `buttons` (▲/▼) или `drag` |

При отключении статистики показывается подтверждение. Обратная связь работает независимо от этого переключателя.

**Настройки → Резервная копия** открывает отдельное окно `import-export.html`.

---

## 📈 Аналитика (Google Таблицы)

Расширение отправляет **анонимные** метрики в Google Таблицу через Apps Script:

- **profileId** — стабильный ID профиля Chrome (`chrome.identity`, email не собирается)
- **installId** — fallback при отсутствии авторизации в Chrome
- **Снимок настроек** — какие модули включены, число шаблонов
- **События** — агрегированные счётчики (клики по кнопкам, вставки шаблонов и т.д.)
- **Feedback** — отзывы из popup (отправляются сразу)

Отправка пакетами **раз в 30 минут**, не на каждое действие.

### Настройка бэкенда

1. Создайте Google Таблицу с листами `Users`, `Events`, `Feedback` (заголовки — см. `AI_CONTEXT.md`)
2. Листы `CloudContributors`, `CloudTokens`, `CloudPayloads` создаются автоматически при первом облачном запросе (можно добавить вручную)
3. Разверните `google-sheets-api.gs` как веб-приложение (**Изменить** → **Новая версия** при обновлении)
4. Укажите URL и SECRET в `analytics.js`

### Облачный обмен шаблонами

- Доступен в **Настройки → Резервная копия → По токену** (экспорт и импорт)
- Токен `2TSL-XXXX-XXXX-XXXX`, один на пользователя, срок **30 дней с последнего использования**
- Передаётся коллеге в личном чате; импорт/экспорт **файлом** доступен всем
- ФИО, регион и настройка статистики в облако **не попадают**

### Локальный отчёт (xlsx)

```bash
pip install openpyxl pandas
python scripts/build_analytics_dashboard.py
```

Скрипт оформляет экспорт из Google и строит лист `Dashboard` с графиками.

---

## 💾 Хранение данных

| Данные | Где | Назначение |
|--------|-----|------------|
| `templates`, `groups` | local | Шаблоны и группы |
| `settings` | local | Переключатели функций |
| `requestsByDate` | local | Учёт заявок по дням |
| `reminders` | local | Напоминания |
| `profileId`, `installId` | local | Анонимная идентификация |
| `analyticsQueue` | local | Очередь событий до flush |
| `ttmFormData`, `ttmSearchData` | local | Мост между системами (`targetTabId`, TTL ~20–30 с) |
| `onymaSearchData`, `sipalSearchData`, `sshTransferData` | local | Автопоиск / передача IP |
| `volgaHelpSession`, `volgaHelpDrafts`, `volgaHelpPastePending` | local | Конструктор комментариев |
| `contributorState` | local | Состояние доступа к облаку (без PII) |
| `popupTabSizes`, `popupLayoutScale` | local (settings) | Размеры и масштаб popup |

Персональные данные (ФИО, регион) хранятся локально для автозаполнения формы ассистента.

Мосты `ttmSearchData` / `ttmFormData` привязаны к **конкретной вкладке** (`targetTabId`), чтобы при нескольких открытых TTM/формах не срабатывали чужие автозаполнения и антиспам TTM.

---

## 🚀 Установка

1. Склонируйте репозиторий:
   ```bash
   git clone https://github.com/2GAPUH/2TSL-Tools.git
   ```
2. Chrome → `chrome://extensions/`
3. Включите **Режим разработчика**
4. **Загрузить распакованное расширение** → папка `2TSL-Tools`

### Сборка ZIP (для передачи коллегам)

```bat
build.bat
```

Нужен установленный [7-Zip](https://www.7-zip.org/). Архив: `dist/2TSL-toolbox-v0.7.9.zip` (только runtime-файлы).

### Обновление

`git pull` + перезагрузка расширения на `chrome://extensions/`.

---

## 🏗 Технические детали

- **Чистый JavaScript** — без фреймворков и сборщиков в runtime расширения
- **Manifest V3** — service worker, content scripts, popup
- **Omnichat** — модульный пакет `omnichat/*`; селекторы по `data-testid`, не `sc-*`
- **CSS Variables** — светлая и тёмная тема
- **MutationObserver** — динамический контент в SPA
- **Draft.js** — вставка текста в Omnichat через ClipboardEvent
- **Батч-аналитика** — `chrome.alarms` + Google Apps Script
- **Targeted bridges** — `targetTabId` для Omnichat→TTM и TTM→Форма

---

## 📋 Требования

- Google Chrome 110+ (Manifest V3)
- Авторизация в Chrome (для стабильного `profileId`)
- Доступ к внутренним системам Ростелеком (VPN / корпоративная сеть)

---

## 📄 Лицензия

Проект предназначен для внутреннего использования сотрудниками технической поддержки Ростелеком.
