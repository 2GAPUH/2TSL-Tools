// Страница формы ассистента, основной мир страницы.
// Ловит успешный AJAX WPForms и сообщает content-form.js.
// Ошибка валидации это событие не шлёт.
(function () {
  const EVENT_NAME = 'tsl-assistant-submit-success';
  let bound = false;

  function notify() {
    document.dispatchEvent(new CustomEvent(EVENT_NAME));
  }

  function hook() {
    if (bound) return true;
    const jq = window.jQuery;
    if (typeof jq !== 'function') return false;
    bound = true;
    jq(document).on('wpformsAjaxSubmitSuccess', notify);
    return true;
  }

  if (hook()) return;

  let tries = 0;
  const timer = window.setInterval(() => {
    tries += 1;
    if (hook() || tries >= 80) window.clearInterval(timer);
  }, 250);
})();
