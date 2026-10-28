// content-epd-model.js
// ЕПД, карточка «Технический учёт»: модель коммутатора открывает статью ЕБЗ.
// Каталог снят со страницы «Оборудование СПД» (ЮСУВ), вкладки xDSL / FTTx / xPON.

(function () {
  'use strict';

  const SPD_PAGE = 'https://bzbti.rt.ru/help/spd/';
  const MARK = 'data-tsl-ebz-model';
  const LINK_COLOR = '#3b82f6';
  const LINK_COLOR_HOVER = '#2563eb';

  const TAB_BY_KEY = {
    fttx: { hash: 'menu1', label: 'FTTx' },
    xpon: { hash: 'menu2', label: 'xPON' },
    xdsl: { hash: 'home', label: 'xDSL' }
  };

  // title — как на вкладке ЕБЗ, по нему ищется модель из ЕПД.
  const EBZ_CATALOG = {
    xdsl: [
      ['Alcatel 1540 LiteSpan', 'https://bzbti.rt.ru/help/alcatel-1540-litespan/'],
      ['Alcatel 7302/7330', 'https://bzbti.rt.ru/help/alcatel-7302-7330/'],
      ['Alcatel 7324RU', 'https://bzbti.rt.ru/help/alcatel-7324ru/'],
      ['Alcatel 7324RU R4', 'https://bzbti.rt.ru/help/alcatel-7324ru-r4/'],
      ['Genew iAN B1205VE/Photel PX-90V 008', 'https://bzbti.rt.ru/help/genew-ian-b1205ve-photel-px-90v-008/'],
      ['Huawei MA 5603/5600T/5608/5616/MSAN (VDSL)', 'https://bzbti.rt.ru/help/huawei-ma-5603-5600t-5608-5616-msan-vdsl/'],
      ['Huawei MA 5000/5603/5600/5616/MSAN (ADSL)', 'https://bzbti.rt.ru/help/huawei-ma-5000-5603-5600-5616-msan-adsl/'],
      ['Huawei MA 5100/5105/5605', 'https://bzbti.rt.ru/help/huawei-ma-5100-5105-5605/'],
      ['Huawei MA 5300', 'https://bzbti.rt.ru/help/huawei-ma-5300/'],
      ['Iskratel SI-3000 (MSAN)', 'https://bzbti.rt.ru/help/iskratel-si-3000-msan/'],
      ['Iskratel SI-3000 (UTA6044AD)', 'https://bzbti.rt.ru/help/iskratel-si-3000-uta6044ad/'],
      ['Nateks FlexGain ACE-120', 'https://bzbti.rt.ru/help/nateks-flexgain-ace-120/'],
      ['Nateks FlexGain ACE-16/D-Link DAS-3216', 'https://bzbti.rt.ru/help/nateks-flexgain-ace-16-d-link-das-3216/'],
      ['Nateks FlexGain ACE-24/48', 'https://bzbti.rt.ru/help/nateks-flexgain-ace-24-48/'],
      ['Nateks FlexGain ACE-24/48v1', 'https://bzbti.rt.ru/help/nateks-flexgain-ace-24-48v1/'],
      ['NEC (Новочеркасск)', 'https://bzbti.rt.ru/help/nec_novoch/'],
      ['Nokia D500', 'https://bzbti.rt.ru/help/nokia-d500/'],
      ['Opnet RT-1000', 'https://bzbti.rt.ru/help/opnet-rt-1000/'],
      ['Siemens (CGH плата xDSL)', 'https://bzbti.rt.ru/help/siemens-cgh-plata-xdsl/'],
      ['Siemens (IFX плата ADSL)', 'https://bzbti.rt.ru/help/siemens-ifx-plata-adsl/'],
      ['Siemens S5620 (small)', 'https://bzbti.rt.ru/help/siemens-s5620-small/'],
      ['Teledata BroadAccess РСТ', 'https://bzbti.rt.ru/help/teledata-broadaccess-rst/'],
      ['ZTE 9806V', 'https://bzbti.rt.ru/help/zte-9806v/'],
      ['ZTE C300/C320/C350', 'https://bzbti.rt.ru/help/zte-c300-c320-c350/'],
      ['ZTE Zxdsl 8426', 'https://bzbti.rt.ru/help/zte-zxdsl-8426/'],
      ['Zyxel IES-1000', 'https://bzbti.rt.ru/help/zyxel-ies-1000/'],
      ['Zyxel IES-1212-51/1248-51', 'https://bzbti.rt.ru/help/zyxel-ies-1212-51-1248-51/'],
      ['Zyxel IES-2000', 'https://bzbti.rt.ru/help/zyxel-ies-2000/'],
      ['Zyxel IES-5000/5005/6000', 'https://bzbti.rt.ru/help/zyxel-ies-5000-5005-6000/']
    ],
    fttx: [
      ['Cisco', 'https://bzbti.rt.ru/help/cisco_commands/'],
      ['D-Link DES-1228/3200/3526/3528', 'https://bzbti.rt.ru/help/d-link-des-3200-3526/'],
      ['D-Link DGS-3100-24TG', 'https://bzbti.rt.ru/help/d-link-dgs-3100-24tg/'],
      ['Edge-Core ES3528', 'https://bzbti.rt.ru/help/edge-core-es3528/'],
      ['Eltex MES1124M', 'https://bzbti.rt.ru/help/eltex_mes1124/'],
      ['Eltex MES2308', 'https://bzbti.rt.ru/help/eltex-mes2308/'],
      ['Eltex MES2324B', 'https://bzbti.rt.ru/help/eltex-mes2324b/'],
      ['Eltex MES2408P/MES2424/MES2428', 'https://bzbti.rt.ru/help/eltex-mes2408p-mes2424-mes2428/'],
      ['Eltex MES3324F', 'https://bzbti.rt.ru/help/eltex-mes3324f/'],
      ['H3C S3100-26TP-EI', 'https://bzbti.rt.ru/help/h3c-s3100-26tp-ei/'],
      ['Huawei 93xx (коммутатор агрегации)', 'https://bzbti.rt.ru/help/huawei-93xx-kommutator-agregacii/'],
      ['Huawei CX200', 'https://bzbti.rt.ru/help/huawei_cx200/'],
      ['Huawei S2309/2318/S2326/S2328/2350/S2352', 'https://bzbti.rt.ru/help/huawei-s2309-2318-s2326-s2328-2350-s2352/'],
      ['Iskratel IDL', 'https://bzbti.rt.ru/help/iskratel_idl/'],
      ['Orion Alpha-A10E', 'https://bzbti.rt.ru/help/orion-alpha-a10e/'],
      ['Qtech QSW-2800/3400 + Orion Alpha A26', 'https://bzbti.rt.ru/help/qtech-qsw-2800-3400/'],
      ['Qtech QSW-2850/3450/3470/3500/3580/3750/4610 + SNR-S2950/S2965/S2982/S2985', 'https://bzbti.rt.ru/help/qtech-qsw-2850-3450-3470-3500-3580-3750-4610-snr-s2950-s2965-s2982-s2985/'],
      ['Qtech QSW-2870-28T', 'https://bzbti.rt.ru/help/qtech-qsw-2870-28t/'],
      ['Qtech QSW-2910', 'https://bzbti.rt.ru/help/qtech-qsw-2910/'],
      ['Qtech QSW-3310-28F', 'https://bzbti.rt.ru/help/qtech-qsw-3310-28f/'],
      ['Qtech QSW-8200-28F (коммутатор агрегации)', 'https://bzbti.rt.ru/help/qtech-qsw-8200-28f-kommutator-agregacii/'],
      ['Raisecom ISCOM2110EA/ISCOM2118EA/ISCOM2128EA', 'https://bzbti.rt.ru/help/raisecom-iscom2110ea-iscom2118ea-iscom2128ea/'],
      ['Raisecom ISCOM2624G', 'https://bzbti.rt.ru/help/raisecom-iscom2624g/'],
      ['Rotek RS-I-2308FE-PoE', 'https://bzbti.rt.ru/help/rotek-rs-i-2308fe-poe/'],
      ['RUBY TECH ES-2310C/2410C', 'https://bzbti.rt.ru/help/ruby-tech-es-2310c-2410c/'],
      ['RUBY TECH FGS-2924R', 'https://bzbti.rt.ru/help/ruby-tech-fgs-2924r/'],
      ['TP-Link TL-SL2210', 'https://bzbti.rt.ru/help/tp-link-tl-sl2210/'],
      ['Zyxel ES-2108', 'https://bzbti.rt.ru/help/zyxeles2108/'],
      ['АЛСИТЕК ALS-24110P', 'https://bzbti.rt.ru/help/alsitek-als-24110p/'],
      ['Оборудование от «Радуга»', 'https://bzbti.rt.ru/help/spd_raduga/']
    ],
    xpon: [
      ['CDATA', 'https://bzbti.rt.ru/help/cdata/'],
      ['DASAN V5812G', 'https://bzbti.rt.ru/help/dasan-v5812g/'],
      ['Electra EL-108-G/EL-116-G', 'https://bzbti.rt.ru/help/electra-el-108-g-el-116-g/'],
      ['Eltex LTE-2X/4X/8X', 'https://bzbti.rt.ru/help/eltex-lte-2x-4x-8x/'],
      ['Eltex LTP-4X/LTP-8X', 'https://bzbti.rt.ru/help/eltex-ltp-4x-ltp-8x/'],
      ['Eltex LTP-8N/16N', 'https://bzbti.rt.ru/help/eltex-ltp-8n-16n/'],
      ['Eltex MA4000', 'https://bzbti.rt.ru/help/eltex4000/'],
      ['Huawei 5608/5600T/5800-X2/5603T/5801-GP08', 'https://bzbti.rt.ru/help/huawei5608/'],
      ['IMAQL (LUCHEZAR)', 'https://bzbti.rt.ru/help/imaql-luchezar/'],
      ['Zhone MXK-319 Волга', 'https://bzbti.rt.ru/help/zhone-mxk-319_volga/'],
      ['ZTE C300/C320/C350', 'https://bzbti.rt.ru/help/zte-c300-c320/'],
      ['ZTE C610/C620', 'https://bzbti.rt.ru/help/zte-c610-c620/']
    ]
  };

  let enabled = true;
  let observer = null;
  let debounceTimer = null;

  function compact(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '');
  }

  function addNeedle(set, value) {
    const needle = compact(value);
    if (needle.length >= 4) set.add(needle);
  }

  function modelNeedles(model) {
    const set = new Set();
    addNeedle(set, model);
    addNeedle(set, compact(model).replace(/[a-zа-яё]$/i, ''));

    String(model || '').split(/[^a-z0-9а-яё]+/i).forEach((part) => {
      addNeedle(set, part);
      addNeedle(set, part.replace(/[a-zа-яё]$/i, ''));
    });

    const family = String(model || '').match(/ma?\s*(\d{4})(t)?/i);
    if (family) {
      addNeedle(set, family[1]);
      if (family[2]) addNeedle(set, family[1] + family[2]);
      if (family[1].startsWith('568')) addNeedle(set, '5600');
    }

    return [...set];
  }

  function tabKeyFromTitle(title) {
    const match = String(title || '').match(/Технический уч[её]т\s+([A-Za-z0-9]+)/i);
    if (!match) return null;
    const type = match[1].toLowerCase();
    if (/pon|gpon|epon|gepon/.test(type)) return 'xpon';
    if (/ftt|ethernet/.test(type)) return 'fttx';
    if (/dsl|adsl|vdsl|shdsl/.test(type)) return 'xdsl';
    return null;
  }

  function pickWinner(candidates) {
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    const prefix = candidates.find((item) => {
      return candidates.every((other) => other === item || other.folded.startsWith(item.folded));
    });
    return prefix || null;
  }

  function scoreArticles(articles, needles) {
    let bestScore = 0;
    const scored = [];
    articles.forEach(([title, url]) => {
      const folded = compact(title);
      let score = 0;
      needles.forEach((needle) => {
        if (folded.includes(needle) && needle.length > score) score = needle.length;
      });
      if (score > bestScore) bestScore = score;
      if (score > 0) scored.push({ title, url, score, folded });
    });
    return { bestScore, scored };
  }

  function matchArticle(tabKey, vendor, model) {
    const articles = EBZ_CATALOG[tabKey];
    if (!articles) return null;

    const byModel = scoreArticles(articles, modelNeedles(model));
    if (byModel.bestScore >= 4) {
      const winners = byModel.scored.filter((item) => item.score === byModel.bestScore);
      const picked = pickWinner(winners);
      if (picked) return picked;
    }

    const vendorNeedle = compact(vendor);
    if (vendorNeedle.length < 4) return null;
    const byVendor = articles.filter(([title]) => compact(title).includes(vendorNeedle));
    if (byVendor.length !== 1) return null;
    return { title: byVendor[0][0], url: byVendor[0][1], score: vendorNeedle.length, folded: compact(byVendor[0][0]) };
  }

  function destination(tabKey, vendor, model) {
    const article = matchArticle(tabKey, vendor, model);
    if (article) return { url: article.url, label: article.title, exact: true };
    const tab = TAB_BY_KEY[tabKey];
    return {
      url: `${SPD_PAGE}?tslTab=${tabKey}#${tab.hash}`,
      label: `вкладка ${tab.label}`,
      exact: false
    };
  }

  function trackEvent(event) {
    try {
      chrome.runtime.sendMessage({ action: 'trackEvent', event });
    } catch (e) { /* service worker недоступен */ }
  }

  function techTitle(el) {
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const titles = node.querySelectorAll('[title^="Технический уч"]');
      if (titles.length === 1) return titles[0];
      node = node.parentElement;
    }
    return null;
  }

  function looksLikeVendor(text) {
    return /^[\p{L}][\p{L}\d .+-]{0,30}$/u.test(text);
  }

  function paint(row, color, underline) {
    row.querySelectorAll('span').forEach((span) => {
      span.style.color = color;
      span.style.textDecoration = underline ? 'underline' : 'none';
      span.style.transition = 'color 0.2s ease';
    });
  }

  function unbind(row) {
    if (row._tslEbzClick) {
      row.removeEventListener('click', row._tslEbzClick);
      row.removeEventListener('mouseenter', row._tslEbzEnter);
      row.removeEventListener('mouseleave', row._tslEbzLeave);
      row._tslEbzClick = null;
      row._tslEbzEnter = null;
      row._tslEbzLeave = null;
    }
    row.removeAttribute(MARK);
    row.style.cursor = '';
    row.title = '';
    paint(row, '', false);
  }

  function bindRow(row, vendor, model, tabKey) {
    const target = destination(tabKey, vendor, model);
    row.setAttribute(MARK, '1');
    row.style.cursor = 'pointer';
    row.title = `Открыть в ЕБЗ: ${target.label}`;
    paint(row, LINK_COLOR, false);

    row._tslEbzEnter = () => paint(row, LINK_COLOR_HOVER, true);
    row._tslEbzLeave = () => paint(row, LINK_COLOR, false);
    row._tslEbzClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      trackEvent('epd_switch_model_click');
      chrome.runtime.sendMessage({ action: 'openForm', url: target.url });
    };

    row.addEventListener('mouseenter', row._tslEbzEnter);
    row.addEventListener('mouseleave', row._tslEbzLeave);
    row.addEventListener('click', row._tslEbzClick);
  }

  function clearAll() {
    document.querySelectorAll(`[${MARK}]`).forEach(unbind);
  }

  function scan() {
    if (!enabled) {
      clearAll();
      return;
    }

    document.querySelectorAll('span.font-weight-bold').forEach((vendorEl) => {
      const row = vendorEl.parentElement;
      if (!row || row.getAttribute(MARK) === '1') return;

      const modelEl = vendorEl.nextElementSibling;
      if (!modelEl || modelEl.tagName !== 'SPAN') return;

      const vendor = vendorEl.textContent.replace(/\s+/g, ' ').trim();
      const model = modelEl.textContent.replace(/\s+/g, ' ').trim();
      if (!looksLikeVendor(vendor) || !/\d/.test(model) || model.length > 60) return;

      const titleEl = techTitle(row);
      const tabKey = tabKeyFromTitle(titleEl?.getAttribute('title') || '');
      if (!tabKey) return;

      bindRow(row, vendor, model, tabKey);
    });
  }

  function start() {
    scan();
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(scan, 300);
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  function stop() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    clearTimeout(debounceTimer);
    clearAll();
  }

  if (typeof globalThis !== 'undefined' && typeof chrome === 'undefined') {
    globalThis.__tslEpdModelTest = { matchArticle, tabKeyFromTitle, destination };
    return;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    const next = changes.settings.newValue || {};
    const was = enabled;
    enabled = next.epdSwitchModel !== false;
    if (was && !enabled) stop();
    else if (!was && enabled) start();
  });

  chrome.storage.local.get(['settings'], (result) => {
    if (chrome.runtime.lastError) return;
    enabled = result.settings?.epdSwitchModel !== false;
    if (enabled) start();
  });
})();
