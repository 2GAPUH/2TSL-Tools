# AI Context — 2TSL Toolbox

> **Для AI-ассистентов:** читай этот файл в начале нового диалога по проекту.  
> Краткий контекст, архитектура, соглашения и текущее состояние.

---

## Что это

**2TSL toolbox** — Chrome Extension (Manifest V3) для инженеров техподдержки Ростелеком.  
Автоматизирует работу с внутренними системами: Omnichat, TTM, Onyma, SIPAL, Grafana, SSH, форма ассистента.

| Параметр | Значение |
|----------|----------|
| Версия | `0.5.3` (см. `manifest.json`) |
| Язык UI/комментариев | Русский |
| Runtime-зависимости | 0 (vanilla JS) |
| Автор / репо | 2GAPUH / https://github.com/2GAPUH/2TSL-Tools |
| Сборка | Нет — файлы грузятся напрямую в Chrome |

---

## Архитектура

```
popup.html + popup.js          ← UI (4 вкладки)
background.js                  ← service worker (importScripts analytics.js)
analytics.js                   ← очередь метрик, flush → Google Sheets
content-*.js                   ← по одному (или два) на домен
chrome.storage.local           ← все пользовательские данные
```

### Потоки сообщений (`chrome.runtime.sendMessage`)

| action | Откуда | Что делает |
|--------|--------|------------|
| `trackEvent` | content scripts, popup | `{ event: string }` → очередь в analytics.js |
| `sendFeedback` | popup | Немедленная отправка в Google Sheets |
| `openForm` | content scripts | `chrome.tabs.create({ url })` |
| `addReminder` / `removeReminder` / `updateReminder` | content-ttm, popup | Напоминалка |

Content scripts **никогда не делают fetch** для аналитики — только `trackEvent`.

---

## Ключевые файлы

| Файл | Строк ~ | Ответственность |
|------|---------|-----------------|
| `popup.js` | 1200+ | Шаблоны, учёт, напоминания, настройки, feedback |
| `content-omnichat.js` | 1030+ | Шаблоны «Дополнительно», линковка НЛС/заявок |
| `content-ttm.js` | 940+ | Кнопки toolbar, автопоиск, таймер |
| `content-accounting.js` | 890+ | Боковая панель учёта |
| `analytics.js` | 250+ | ID, очередь, flush 30 мин, API |
| `background.js` | 280+ | Напоминания, роутинг сообщений |
| `google-sheets-api.gs` | — | Apps Script (может быть в .gitignore) |

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
  darkMode: false,
  analyticsEnabled: true   // opt-out с confirm при выключении
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

### Google Таблица — лист `Users` (колонки A–P)

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

Лист `Events`: timestamp, profileId, installId, version, platform, periodStart, periodEnd, eventsJson  
Лист `Feedback`: timestamp, profileId, installId, type, message, email, version

Версии в Sheets пишутся как `v0.5.3` (иначе Sheets парсит `0.5.3` как дату).

### Каталог событий (основные)

`ttm_assistant_click`, `ttm_timer_click`, `ttm_reminder_created`, `ttm_onyma_click`, `ttm_sipal_click`, `ttm_autosearch`, `omnichat_templates_tab_open`, `omnichat_template_insert`, `omnichat_link_click_nls`, `omnichat_link_click_ticket`, `accounting_panel_open`, `accounting_entry_closed`, `accounting_entry_field`, `accounting_csv_export`, `grafana_ip_click`, `ssh_autofill`, `form_autofill`, `popup_open`, `popup_tab_*`, `popup_template_copy`, `popup_template_paste`, `settings_change_*`, `feedback_sent`, `extension_installed`, `extension_updated`

---

## Межсистемные мосты (TTL 30 сек)

| Ключ storage | Пишет | Читает |
|--------------|-------|--------|
| `ttmSearchData` | omnichat | ttm |
| `ttmFormData` | ttm | form |
| `onymaSearchData` | ttm | onyma |
| `sipalSearchData` | ttm | sipal |
| `sshTransferData` | grafana | ssh |

---

## Соглашения при разработке

1. **Только vanilla JS** в runtime расширения — без npm/webpack в продакшене
2. **Минимальный diff** — не рефакторить несвязанный код
3. **Русский язык** — UI, комментарии, сообщения пользователю
4. **Новые события** — `trackEvent('snake_case')` + сообщение в background, не прямой fetch
5. **SPA-сайты** — MutationObserver, патч history, setInterval для URL
6. **Иконки** — `icons/name.png` и `icons/name_white.png` для тёмной темы
7. **Опечатка в репо** — `icons/cance_whitel.png` (не `cancel_white.png`)

---

## Известные ограничения

- Автообновление через `update_url` **удалено** — только ручное обновление
- `profileId` пустой без авторизации в Chrome или без `identity.email`
- Apps Script: `doGet` опционален (только проверка URL в браузере)
- Секрет API захардкожен в `analytics.js` — защита от случайного спама, не криптостойкая
- `google-sheets-api.gs`, xlsx-отчёт, `scripts/` могут быть в `.gitignore`

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
| Новое событие аналитики | `trackEvent()` в нужном файле + при необходимости Apps Script |
| Новый переключатель | popup.html, popup.js settings, content script guard |
| Изменить интервал flush | `FLUSH_INTERVAL_MINUTES` в `analytics.js` |
| Графики метрик | `scripts/build_analytics_dashboard.py` или Google Sheets вручную |

---

## Что НЕ трогать без запроса

- `about.md` — устаревшая подробная документация (может расходиться с кодом)
- Внешние URL систем Ростелеком — продакшен-интеграции
- Секреты в `analytics.js` — менять только по запросу владельца

---

## Быстрый чеклист перед коммитом

- [ ] Версия в `manifest.json` актуальна
- [ ] Новые permissions обоснованы
- [ ] `trackEvent` не дублируется (popup vs content)
- [ ] Настройки синхронизируются через storage
- [ ] README / AI_CONTEXT обновлены при архитектурных изменениях