// content-ebz-spd.js
// Страница «Оборудование СПД»: если модель из ЕПД не попала в статью,
// открываем вкладку xDSL / FTTx / xPON по параметру tslTab.

(function () {
  'use strict';

  const TAB_IDS = {
    fttx: 'spd_fttb',
    xpon: 'spd_gpon',
    xdsl: 'spd_adsl'
  };

  const key = new URLSearchParams(location.search).get('tslTab');
  const id = TAB_IDS[key];
  if (!id) return;

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    const link = document.getElementById(id);
    const li = link?.closest('li');
    if (li?.classList.contains('active')) {
      clearInterval(timer);
      return;
    }
    if (link) link.click();
    if (li?.classList.contains('active') || tries >= 25) clearInterval(timer);
  }, 200);
})();
