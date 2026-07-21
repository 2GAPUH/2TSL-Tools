# AI Context — 2TSL Toolbox

> **Для AI-ассистентов:** читай этот файл в начале нового диалога по проекту.  
> Краткий контекст, архитектура, соглашения и текущее состояние.

---

## Что это

**2TSL toolbox** — Chrome Extension (Manifest V3) для инженеров техподдержки Ростелеком.  
Автоматизирует работу с внутренними системами: Omnichat, TTM, Onyma, SIPAL, Grafana, SSH, форма ассистента, volgahelp.ru (конструктор комментариев).

| Параметр | Значение |
|----------|----------|
| Версия | `0.7.11` (см. `manifest.json`) |
| Язык UI/комментариев | Русский |
| Runtime-зависимости | 0 (vanilla JS) |
| Автор / репо | 2GAPUH / https://github.com/2GAPUH/2TSL-Tools |
| Сборка | `build.bat` → ZIP через 7-Zip (`dist/2TSL-toolbox-vX.Y.Z.zip`); runtime без npm |

---

## Архитектура

```
popup.html + popup.js          ← UI (4 вкладки)
import-export.html + page.js   ← отдельное окно резервной копии
popup-import-export.js         ← логика импорта/экспорта (файл + облако)
background.js                  ← service worker (importScripts analytics.js, cloud-sync.js)
analytics.js                   ← очередь метрик, flush → Google Sheets
cloud-sync.js                  ← облачный обмен шаблонами по токену
omnichat/*.js                  ← Omnichat: шаблоны + TTM-ссылки (модульный пакет)
content-*.js                   ← по доменам (TTM, form, grafana, …)
chrome.storage.local           ← все пользовательские данные
build.bat                      ← упаковка runtime-файлов в ZIP
```

### Потоки сообщений (`chrome.runtime.sendMessage`)

| action | Откуда | Что делает |
|--------|--------|------------|
| `trackEvent` | content scripts, popup | `{ event: string }` → очередь в analytics.js |
| `sendFeedback` | popup | Немедленная отправка в Google Sheets |
| `openForm` | content scripts | `chrome.tabs.create({ url })` |
| `openTtmSearch` | omnichat/ttm-links | Создаёт вкладку TTM → пишет `ttmSearchData` **с `targetTabId`** |
| `openAssistantForm` | content-ttm | Создаёт вкладку формы → пишет `ttmFormData` **с `targetTabId`** |
| `getTabId` | content-form, content-ttm | `{ tabId }` отправителя (для targetTabId) |
| `addReminder` / `removeReminder` / `updateReminder` | content-ttm, popup | Напоминалка |
| `cloudCheckEligibility` / `cloudExport` / `cloudImport` | import-export page | Облачный обмен шаблонами |
| `volgaHelpCopied` | content-volgahelp.js | Текст → `volgaHelpPastePending` в storage |

Content scripts **никогда не делают fetch** для аналитики — только `trackEvent`.  
Облачные запросы идут через background → `cloud-sync.js` → Apps Script.

---

## Ключевые файлы

| Файл | Ответственность |
|------|-----------------|
| `popup.js` / `popup.html` | Шаблоны, учёт, напоминания, настройки, feedback |
| `popup-import-export.js` | Импорт/экспорт JSON и облако по токену |
| `omnichat/*` | Модалка «Дополнительно», линковка НЛС/заявок (см. ниже) |
| `content-ttm.js` | Toolbar, мягкий автопоиск, таймер, Onyma/SIPAL, конструктор комментариев |
| `content-form.js` | Автозаполнение формы ассистента (только целевая вкладка) |
| `content-volgahelp.js` | Черновики volgahelp, «Скопировать всё» |
| `content-argus-theme.js` | Argus: вкл/выкл тёмной темы (CSS inject) |
| `argus-dark.css` | Argus: палитры + framework overrides |
| `content-accounting.js` | Боковая панель учёта |
| `analytics.js` | ID, очередь, flush 30 мин |
| `cloud-sync.js` | Eligibility, export/import по токену |
| `background.js` | Напоминания, роутинг, openTtmSearch / openAssistantForm |
| `build.bat` | ZIP-сборка (только runtime) |
| `google-sheets-api.gs` | Apps Script: аналитика + Cloud* листы |

### Omnichat — модули (`omnichat/`)

Порядок в `manifest.json`:

1. `namespace.js` → `state.js` → `constants.js` → `utils.js`
2. `draft-insert.js` → `ttm-links.js` → `templates-modal.js` → `init.js`
3. `content-accounting.js` (отдельно, та же страница)

**Layout модалки шаблонов** — только `data-testid` / структура DOM.  
**Не использовать** styled-components классы `sc-*` (ломаются при обновлении Omnichat, напр. 3.26).

`getModalLayout()` ищет:
- категории: `#scroll-box-root` с `[data-testid="list-element"]`
- шаблоны: sibling после `[data-testid="test-tabsgroup"]` или box с `reply-template`
- ряд поиска: предок `search-template`, **не** захватывающий tabs

### Не в манифесте

- `content-userinfo.js` — устаревший, не подключён

---

## Настройки (`settings` в storage)

```javascript
{
  omnichatTemplates: true,
  omnichatTTMLinks: true,
  ttmButton: true,
  accountingPanel: true,
  grafanaSSH: true,
  reminder: true,
  ttmOnyma: true,
  ttmSipal: true,
  ttmCommentBuilder: true,
  darkMode: false,
  argusDarkTheme: false,           // тёмная тема Argus (отдельный переключатель)
  argusDarkPalette: 'slate',       // 'slate' (EPD) | 'black' | 'navy'
  analyticsEnabled: true,   // opt-out с confirm при выключении
  popupUnifiedTabSize: false,
  templateReorderMode: 'buttons',  // 'buttons' | 'drag'
  popupLayoutScale: 1,
  popupTabSizes: { templates: {...}, accounting: {...}, ... }
}
```

Все content scripts читают `settings` и реагируют на `chrome.storage.onChanged`.

---

## Аналитика

### Идентификация

- `profileId` — `chrome.identity.getProfileUserInfo()`; **требует** `identity` + `identity.email` в manifest (email не используется)
- `installId` — UUID в storage, fallback
- Кэш `profileId` в `chrome.storage.local`

### Отправка

- `SHEETS_API_URL` + `API_SECRET` в `analytics.js`
- Flush: alarm `analyticsFlush` каждые 30 мин + при `onStartup` / `onInstalled`
- Payload action `flush`: settings snapshot + aggregated events JSON
- Feedback: action `feedback`, отправка сразу

### Google Таблица — лист `Users` (колонки A–Q)

| Col | Заголовок |
|-----|-----------|
| A | profileId |
| B | installId |
| C | version |
| D | lastSeen |
| E | firstSeen |
| F | platform |
| G–N | omnichatTemplates … ttmSipal (TRUE/FALSE) |
| O | darkMode |
| P | templatesCount |
| Q | ttmCommentBuilder |

Лист `Events`: timestamp, profileId, installId, version, platform, periodStart, periodEnd, eventsJson  
Лист `Feedback`: timestamp, profileId, installId, type, message, email, version

Версии в Sheets пишутся как `v0.7.7` (иначе Sheets парсит `0.7.7` как дату).

### Облачный обмен шаблонами

- Листы `CloudContributors`, `CloudTokens`, `CloudPayloads` в Google Таблице
- Токен `2TSL-XXXX-XXXX-XXXX`, TTL **30 дней** с последнего использования
- Доступ при включённой статистике и ≥1 успешном flush (grace 15 мин при кратком отключении)
- Cooldown 2 суток после длительного отключения статистики
- Импорт/экспорт **файлом** доступен всем; **по токену** — участникам облака
- ФИО, регион, `analyticsEnabled` не экспортируются

### Каталог событий (основные)

`ttm_assistant_click`, `ttm_timer_click`, `ttm_reminder_created`, `ttm_onyma_click`, `ttm_sipal_click`, `ttm_comment_builder_open`, `ttm_comment_builder_copy`, `ttm_comment_builder_paste`, `ttm_comment_builder_close`, `ttm_autosearch`, `omnichat_templates_tab_open`, `omnichat_template_insert`, `omnichat_link_click_nls`, `omnichat_link_click_ticket`, `accounting_panel_open`, `accounting_entry_closed`, `accounting_entry_field`, `accounting_csv_export`, `grafana_ip_click`, `ssh_autofill`, `form_autofill`, `popup_open`, `popup_tab_*`, `popup_template_copy`, `popup_template_paste`, `settings_change_*`, `argus_dark_theme_on`, `argus_dark_theme_off`, `argus_dark_palette_change`, `cloud_export`, `cloud_import`, `feedback_sent`, `extension_installed`, `extension_updated`

---

## Межсистемные мосты

| Ключ storage | Пишет | Читает | Примечание |
|--------------|-------|--------|------------|
| `ttmSearchData` | background (`openTtmSearch`) | content-ttm | `searchValue`, `targetTabId`, `timestamp`; TTL ~20 с |
| `ttmFormData` | background (`openAssistantForm`) | content-form | `targetTabId`; только целевая вкладка формы |
| `onymaSearchData` | ttm | onyma | TTL 30 с |
| `sipalSearchData` | ttm | sipal | TTL 30 с |
| `sshTransferData` | grafana | ssh | |
| `contributorState` | cloud-sync, analytics | без PII | |
| `volgaHelpSession` | content-ttm | content-volgahelp | ticket + editor |
| `volgaHelpDrafts` | content-volgahelp | content-volgahelp | черновики по заявке |
| `volgaHelpPastePending` | background | content-ttm | вставка **только** в таб с тем же `ticketNumber` |

### Omnichat → TTM (автопоиск) — правила v0.7.7

1. Omnichat шлёт `openTtmSearch` (не пишет storage сам).
2. Background: `tabs.create` → `ttmSearchData` с `targetTabId`.
3. Только вкладка с совпадающим `tabId` ждёт поле поиска и делает **один** submit (кнопка **или** Enter).
4. Не слать submit + click + 3×Enter — антиспам TTM.
5. Не перезапускать автопоиск на SPA-смене URL после первого поиска.

### TTM → Форма ассистента

1. `openAssistantForm` → tab + `ttmFormData.targetTabId`.
2. `content-form.js` читает данные только если `targetTabId === myTabId`.

---

## Соглашения при разработке

1. **Только vanilla JS** в runtime расширения — без npm/webpack в продакшене
2. **Минимальный diff** — не рефакторить несвязанный код
3. **Русский язык** — UI, комментарии, сообщения пользователю
4. **Новые события** — `trackEvent('snake_case')` + сообщение в background, не прямой fetch
5. **SPA-сайты** — MutationObserver, патч history, setInterval для URL
6. **Иконки** — `icons/name.png` и `icons/name_white.png` для тёмной темы
7. **Опечатка в репо** — `icons/cance_whitel.png` (не `cancel_white.png`)
8. **Omnichat DOM** — только `data-testid` / структура, **не** `sc-*`
9. **Мосты через storage** — по возможности с `targetTabId`, иначе все вкладки домена подхватят данные

---

## Известные ограничения

- Автообновление через `update_url` **удалено** — только ручное обновление
- `profileId` пустой без авторизации в Chrome или без `identity.email`
- Apps Script: `doGet` опционален (только проверка URL в браузере)
- Секрет API захардкожен в `analytics.js` — защита от случайного спама, не криптостойкая
- `google-sheets-api.gs`, xlsx-отчёт, `scripts/`, `systems-html/`, `dist/` — не runtime расширения

---

## Сборка ZIP

```bat
build.bat
```

Требует 7-Zip. Версия читается из `manifest.json`.  
Результат: `dist/2TSL-toolbox-v0.7.9.zip` (только runtime: js/html/icons/css, без README/xlsx/dumps).

---

## Вспомогательные скрипты (не часть расширения)

```bash
pip install openpyxl pandas
python scripts/build_analytics_dashboard.py
```

Пересобирает `2TSL Toolbox Analytics.xlsx`: Dashboard, графики, EventStats.

---

## Типичные задачи

| Задача | Где править |
|--------|-------------|
| Новая кнопка в TTM | `content-ttm.js` + settings в popup |
| Конструктор комментария | `content-ttm.js` + `content-volgahelp.js` + `background.js` |
| Вкладка «Дополнительно» / layout модалки | `omnichat/templates-modal.js`, `omnichat/utils.js`, `omnichat/constants.js` |
| Omnichat → TTM ссылки | `omnichat/ttm-links.js` + `openTtmSearch` в background |
| Автопоиск TTM / антиспам | `content-ttm.js` (`runTtmSearch`, `initAutoSearch`) |
| Форма ассистента | `content-form.js` + `openAssistantForm` в background |
| Новое событие аналитики | `trackEvent()` + при необходимости Apps Script |
| Новый переключатель | popup.html, popup.js settings, content script guard |
| Тёмная тема Argus | `argus-dark.css` + `content-argus-theme.js` + setting `argusDarkTheme` / `argusDarkPalette` |
| Изменить интервал flush | `FLUSH_INTERVAL_MINUTES` в `analytics.js` |
| ZIP-сборка | `build.bat` (список файлов внутри) |

---

## Что НЕ трогать без запроса

- `about.md` — устаревшая подробная документация (может расходиться с кодом)
- Внешние URL систем Ростелеком — продакшен-интеграции
- Секреты в `analytics.js` — менять только по запросу владельца
- `systems-html/` — дампы DOM для отладки, не runtime

---

## Быстрый чеклист перед коммитом

- [ ] Версия в `manifest.json` актуальна
- [ ] README / AI_CONTEXT обновлены при архитектурных изменениях
- [ ] Новые permissions обоснованы
- [ ] `trackEvent` не дублируется (popup vs content)
- [ ] Настройки синхронизируются через storage
- [ ] Мосты storage с `targetTabId`, если несколько вкладок одного домена
- [ ] Omnichat: нет селекторов `sc-*`
