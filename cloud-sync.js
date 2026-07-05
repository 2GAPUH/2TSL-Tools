// cloud-sync.js — облачный импорт/экспорт шаблонов по токену (Google Sheets)

const CLOUD_SHORT_DISABLE_GRACE_MS = 15 * 60 * 1000;
const CLOUD_REENABLE_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;
const CLOUD_TOKEN_INACTIVITY_DAYS = 30;
const CLOUD_ELIGIBILITY_CACHE_MS = 15 * 60 * 1000;
const CLOUD_MAX_TEMPLATES = 200;
const CLOUD_MAX_BODY = 50000;
const CLOUD_PAYLOAD_CHUNK_SIZE = 40000;

const CLOUD_MSG = {
  initializing: 'Требуется время на инициализацию (приблизительно 30 минут). Попробуйте позже. Если проблема сохранится, используйте форму обратной связи расширения.',
  cooldown: 'Сервис временно недоступен. Попробуйте через несколько дней снова. Если проблема сохранится, используйте форму обратной связи расширения.',
  unavailable: 'Облачный обмен шаблонов сейчас недоступен. Попробуйте позже или используйте импорт из файла.',
  tokenExpired: 'Токен недействителен или истёк. Запросите новый у коллеги.',
  tokenHint: 'Токен действует 30 дней с последнего использования. Передайте его коллеге в личном чате.'
};

// ==================== СОСТОЯНИЕ ====================

async function getContributorState() {
  const result = await chrome.storage.local.get(['contributorState']);
  return result.contributorState || {
    analyticsFirstEnabledAt: null,
    analyticsLastEnabledAt: null,
    analyticsLastDisabledAt: null,
    lastLongDisableEndedAt: null,
    analyticsReenabledAt: null,
    hadCloudAccess: false,
    successfulFlushCount: 0,
    lastSuccessfulFlushAt: null,
    lastEligibilityCheck: null,
    cachedEligibility: null,
    lastCloudToken: null,
    lastCloudTokenExpiresAt: null
  };
}

async function saveContributorState(state) {
  await chrome.storage.local.set({ contributorState: state });
}

async function recordAnalyticsToggle(enabled) {
  const state = await getContributorState();
  const now = Date.now();

  if (enabled) {
    if (!state.analyticsFirstEnabledAt) state.analyticsFirstEnabledAt = now;
    state.analyticsLastEnabledAt = now;

    if (state.analyticsLastDisabledAt) {
      const disableDuration = now - state.analyticsLastDisabledAt;
      if (disableDuration > CLOUD_SHORT_DISABLE_GRACE_MS) {
        state.analyticsReenabledAt = now;
        state.lastLongDisableEndedAt = now;
      }
      state.analyticsLastDisabledAt = null;
    }
  } else {
    state.analyticsLastDisabledAt = now;
  }

  state.cachedEligibility = null;
  await saveContributorState(state);
}

async function recordSuccessfulFlush() {
  const state = await getContributorState();
  state.successfulFlushCount = (state.successfulFlushCount || 0) + 1;
  state.lastSuccessfulFlushAt = Date.now();
  if (state.successfulFlushCount >= 1) state.hadCloudAccess = true;
  state.cachedEligibility = null;
  await saveContributorState(state);
}

function buildContributorSnapshot(state, analyticsEnabled) {
  return {
    analyticsEnabled: analyticsEnabled !== false,
    analyticsFirstEnabledAt: state.analyticsFirstEnabledAt,
    analyticsLastDisabledAt: state.analyticsLastDisabledAt,
    analyticsReenabledAt: state.analyticsReenabledAt,
    lastLongDisableEndedAt: state.lastLongDisableEndedAt,
    hadCloudAccess: !!state.hadCloudAccess,
    successfulFlushCount: state.successfulFlushCount || 0,
    lastSuccessfulFlushAt: state.lastSuccessfulFlushAt
  };
}

function evaluateLocalEligibility(state, analyticsEnabled) {
  const now = Date.now();
  const enabled = analyticsEnabled !== false;

  if (!enabled) {
    if (state.hadCloudAccess && state.analyticsLastDisabledAt
        && (now - state.analyticsLastDisabledAt) < CLOUD_SHORT_DISABLE_GRACE_MS) {
      return { eligible: true, reason: 'grace_disable' };
    }
    return { eligible: false, reason: 'unavailable', message: CLOUD_MSG.unavailable };
  }

  if (state.analyticsReenabledAt && state.lastLongDisableEndedAt) {
    const sinceReenable = now - state.analyticsReenabledAt;
    if (sinceReenable < CLOUD_REENABLE_COOLDOWN_MS) {
      return { eligible: false, reason: 'cooldown', message: CLOUD_MSG.cooldown };
    }
  }

  const flushCount = state.successfulFlushCount || 0;
  if (flushCount < 1) {
    return { eligible: false, reason: 'initializing', message: CLOUD_MSG.initializing };
  }

  return { eligible: true, reason: 'ok' };
}

async function postCloudAction(action, extra = {}) {
  if (!isApiConfigured()) {
    return { success: false, error: 'not_configured', message: CLOUD_MSG.unavailable };
  }

  const [profileId, installId, state, settingsResult] = await Promise.all([
    getProfileId(),
    getInstallId(),
    getContributorState(),
    chrome.storage.local.get(['settings'])
  ]);

  const analyticsEnabled = settingsResult.settings?.analyticsEnabled !== false;
  const manifest = chrome.runtime.getManifest();

  try {
    const response = await fetch(SHEETS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        secret: API_SECRET,
        action,
        profileId: profileId || '',
        installId,
        version: manifest.version,
        contributor: buildContributorSnapshot(state, analyticsEnabled),
        ...extra
      })
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, error: 'invalid_response', message: CLOUD_MSG.unavailable };
    }

    if (data.successfulFlushCount !== undefined) {
      const cs = await getContributorState();
      cs.successfulFlushCount = Math.max(cs.successfulFlushCount || 0, data.successfulFlushCount);
      if (cs.successfulFlushCount >= 1) cs.hadCloudAccess = true;
      await saveContributorState(cs);
    }

    if (data.eligible) {
      const cs = await getContributorState();
      cs.hadCloudAccess = true;
      cs.cachedEligibility = { eligible: true, reason: 'ok', checkedAt: Date.now() };
      cs.lastEligibilityCheck = Date.now();
      await saveContributorState(cs);
    }

    return data;
  } catch (error) {
    return { success: false, error: error.message, message: CLOUD_MSG.unavailable };
  }
}

async function checkCloudEligibility(force = false) {
  const [state, settingsResult] = await Promise.all([
    getContributorState(),
    chrome.storage.local.get(['settings'])
  ]);

  const analyticsEnabled = settingsResult.settings?.analyticsEnabled !== false;
  const local = evaluateLocalEligibility(state, analyticsEnabled);

  if (!local.eligible) {
    return { success: true, eligible: false, reason: local.reason, message: local.message };
  }

  if (!force && state.cachedEligibility?.eligible
      && state.lastEligibilityCheck
      && (Date.now() - state.lastEligibilityCheck) < CLOUD_ELIGIBILITY_CACHE_MS) {
    return { success: true, eligible: true, reason: 'cached' };
  }

  const result = await postCloudAction('cloudEligibility');

  if (result.success === false && result.eligible === undefined) {
    if (local.eligible && state.successfulFlushCount >= 1) {
      return { success: true, eligible: true, reason: 'local_fallback' };
    }
    return { success: false, eligible: false, reason: 'error', message: result.message || CLOUD_MSG.unavailable };
  }

  if (!result.eligible) {
    const cs = await getContributorState();
    cs.cachedEligibility = {
      eligible: false,
      reason: result.reason,
      message: result.message,
      checkedAt: Date.now()
    };
    cs.lastEligibilityCheck = Date.now();
    await saveContributorState(cs);
    return result;
  }

  return result;
}

function sanitizeCloudTemplates(templates) {
  if (!Array.isArray(templates)) return [];
  return templates
    .filter((t) => t && t.selected !== false)
    .map((t) => ({
      name: String(t.name || '').trim(),
      body: String(t.body ?? ''),
      group: String(t.group || '').trim()
    }))
    .filter((t) => t.name && t.body && t.body.length <= CLOUD_MAX_BODY)
    .slice(0, CLOUD_MAX_TEMPLATES);
}

async function cloudExportTemplates(templates, includeGroups) {
  const eligibility = await checkCloudEligibility(true);
  if (!eligibility.eligible) {
    return { success: false, message: eligibility.message || CLOUD_MSG.unavailable };
  }

  const sanitized = sanitizeCloudTemplates(templates);
  if (!sanitized.length) {
    return { success: false, message: 'Выберите хотя бы один шаблон' };
  }

  const groups = includeGroups
    ? [...new Set(sanitized.map((t) => t.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'))
    : [];

  const payload = sanitized.map((t) => {
    const entry = { name: t.name, body: t.body };
    if (includeGroups && t.group) entry.group = t.group;
    return entry;
  });

  const result = await postCloudAction('cloudExport', { templates: payload, groups });

  if (result.success && result.token) {
    const cs = await getContributorState();
    cs.lastCloudToken = result.token;
    cs.lastCloudTokenExpiresAt = result.expiresAt || null;
    await saveContributorState(cs);
    trackEvent('cloud_export');
  }

  return result;
}

async function cloudImportByToken(token) {
  const eligibility = await checkCloudEligibility(true);
  if (!eligibility.eligible) {
    return { success: false, message: eligibility.message || CLOUD_MSG.unavailable };
  }

  const normalized = String(token || '').trim().toUpperCase();
  if (!normalized || normalized.length < 8) {
    return { success: false, message: 'Введите корректный токен' };
  }

  const result = await postCloudAction('cloudImport', { token: normalized });

  if (result.success && result.templates) {
    trackEvent('cloud_import');
  }

  return result;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  const oldS = changes.settings.oldValue;
  const newS = changes.settings.newValue;
  if (oldS?.analyticsEnabled !== newS?.analyticsEnabled) {
    recordAnalyticsToggle(newS?.analyticsEnabled !== false);
  }
});