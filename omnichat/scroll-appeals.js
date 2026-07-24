// omnichat/scroll-appeals.js — кнопка «вверх» к блокам «Обращение #… создано»
(function (O) {
  const { state, SELECTORS, CSS } = O;

  const MAX_LOAD_ATTEMPTS = 8;
  const LOAD_WAIT_MS = 550;
  const STICK_OFFSET_PX = 56;
  const ON_HEADER_SLACK_PX = 28;
  // Нативная «вниз»: left:20px, 32×32.
  // «Вверх» занимает этот слот; когда «вниз» видна — сдвигаем её правее (не двигаем «вверх»).
  const NATIVE_DOWN_LEFT_PX = 20;
  const BTN_SIZE_PX = 32;
  const BTN_GAP_PX = 4;
  const UP_LEFT_PX = NATIVE_DOWN_LEFT_PX; // 20 — слот «вниз»
  const DOWN_SHIFT_PX = BTN_SIZE_PX + BTN_GAP_PX - 16; // 36 — сдвиг native вправо
  const LAST_JUMP_TTL_MS = 8000;

  // Та же стрелка, что у нативной «вниз», path из #Actions-button
  const CHEVRON_DOWN_PATH =
    'M11.4692 15.5339L5.99718 10.0609L7.05794 9.00031L11.9996 13.9429L16.9412 9.00031L18.0019 10.0609L12.5299 15.5339C12.3893 15.6746 12.1985 15.7537 11.9996 15.7537C11.8006 15.7537 11.6098 15.6746 11.4692 15.5339Z';

  function log(...args) {
    console.log('[Omnichat:scroll-up]', ...args);
  }

  function appealCreatedRe() {
    return O.APPEAL_CREATED_RE || /Обращение\s*[#№]?\s*\d+\s*создано/i;
  }

  function isAppealCreatedText(text) {
    if (!text || text.length < 12) return false;
    return appealCreatedRe().test(text);
  }

  function getActionsBar() {
    return document.querySelector(SELECTORS.actionsButton);
  }

  /**
   * Реальный scroll-parent ленты: #scroll-box-root с сообщениями
   * или ближайший предок с overflow + реальной прокруткой.
   */
  function getChatScrollContainer() {
    const root = O.getChatMessagesContainer();
    if (!root) return null;

    if (root.scrollHeight > root.clientHeight + 2) return root;

    let el = root.parentElement;
    while (el && el !== document.body) {
      try {
        const st = window.getComputedStyle(el);
        const oy = st.overflowY;
        if (
          (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
          el.scrollHeight > el.clientHeight + 2
        ) {
          return el;
        }
      } catch (e) { /* ignore */ }
      el = el.parentElement;
    }

    return root;
  }

  /**
   * Нативная кнопка «вниз»: SVG-шеврон внутри #Actions-button,
   * не внутри button[data-testid] (Закрыть/Передать) и не наша.
   */
  function findNativeScrollDown(actions) {
    if (!actions) return { circle: null, wrapper: null };

    const svgs = actions.querySelectorAll('svg');
    for (const svg of svgs) {
      if (svg.closest('button[data-testid]')) continue;
      if (svg.closest('[data-omnichat-scroll-up-host]')) continue;
      if (svg.closest('.' + CSS.scrollUpHost)) continue;
      if (!svg.querySelector('path')) continue;

      let circle = svg.parentElement;
      let node = svg.parentElement;
      while (node && node !== actions) {
        try {
          if (window.getComputedStyle(node).cursor === 'pointer') {
            circle = node;
            break;
          }
        } catch (e) { /* ignore */ }
        node = node.parentElement;
      }

      let wrapper = circle;
      while (wrapper?.parentElement && wrapper.parentElement !== actions) {
        wrapper = wrapper.parentElement;
      }

      return { circle, wrapper };
    }

    return { circle: null, wrapper: null };
  }

  function isElementVisible(el) {
    if (!el || !document.contains(el)) return false;
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function getOffsetTopInContainer(container, el) {
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    return eRect.top - cRect.top + container.scrollTop;
  }

  /**
   * Якоря «Обращение … создано» в ленте (сверху вниз = старые → новые).
   * Ищем по textContent сообщения — текст часто разбит на узлы.
   */
  function collectAppealCreatedAnchors(root) {
    if (!root) return [];

    const seen = new Set();
    const list = [];

    const pushAnchor = (el) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      list.push(el);
    };

    // 1) Сообщения чата
    root.querySelectorAll(SELECTORS.chatMessage).forEach((msg) => {
      if (!isAppealCreatedText(msg.textContent || '')) return;

      // Более узкий узел с текстом баннера (если есть)
      let tight = null;
      const nodes = msg.querySelectorAll('div, span');
      for (const el of nodes) {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t.length >= 12 && t.length < 180 && isAppealCreatedText(t)) {
          tight = el;
          // берём самый глубокий подходящий
        }
      }
      pushAnchor(tight || msg);
    });

    // 2) Fallback: любые узлы с фразой (на случай другой вёрстки)
    if (list.length === 0) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          if (node.closest('button, input, textarea, .DraftEditor-root')) {
            return NodeFilter.FILTER_REJECT;
          }
          const t = (node.textContent || '').replace(/\s+/g, ' ').trim();
          if (t.length < 12 || t.length > 180) return NodeFilter.FILTER_SKIP;
          if (!isAppealCreatedText(t)) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      while (walker.nextNode()) {
        pushAnchor(walker.currentNode);
      }
    }

    list.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    return list;
  }

  function getAnchorKey(el) {
    const text = (el?.textContent || '').replace(/\s+/g, ' ').trim();
    const m = text.match(/Обращение\s*[#№]?\s*(\d+)\s*создано/i);
    if (m) return `appeal:${m[1]}`;
    return text.slice(0, 120);
  }

  function isRecentJumpActive() {
    return (
      state.scrollJumpIndex != null &&
      Date.now() - (state.scrollLastJumpAt || 0) < LAST_JUMP_TTL_MS
    );
  }

  /**
   * Последовательные прыжки по индексу (старые…новые = 0…n-1).
   * После недавнего jump всегда index−1 — без ложных load more и «в начало».
   * С viewport — только если серии ещё не было (первый клик / после ручного скролла).
   */
  function findJumpTarget(container, anchors) {
    if (!container) return { target: null, reason: 'no-container' };
    if (!anchors.length) return { target: null, reason: 'empty' };

    // 1) Серия кликов: строго предыдущий по списку
    if (isRecentJumpActive()) {
      // Пересчитать index, если DOM пересобрался (по ключу)
      let idx = state.scrollJumpIndex;
      if (state.scrollLastJumpKey) {
        const byKey = anchors.findIndex((el) => getAnchorKey(el) === state.scrollLastJumpKey);
        if (byKey >= 0) idx = byKey;
      }

      const next = (typeof idx === 'number' ? idx : 0) - 1;
      if (next >= 0 && next < anchors.length) {
        return {
          target: anchors[next],
          reason: 'seq-prev',
          index: next,
          current: idx
        };
      }
      // Уже на самом старом загруженном — догрузка
      return {
        target: null,
        reason: 'need-load',
        index: -1,
        current: 0
      };
    }

    // 2) Первый клик / сброс серии — от положения viewport
    const cRect = container.getBoundingClientRect();
    const stickY = cRect.top + STICK_OFFSET_PX;

    let current = -1;
    for (let i = 0; i < anchors.length; i++) {
      if (anchors[i].getBoundingClientRect().top <= stickY) {
        current = i;
      }
    }

    // Внизу чата (все якоря выше / ни один не «достиг» линии) → новейший
    if (current < 0) {
      const idx = anchors.length - 1;
      return {
        target: anchors[idx],
        reason: 'to-newest',
        index: idx,
        current: -1
      };
    }

    const curTop = anchors[current].getBoundingClientRect().top;
    const onHeader =
      curTop >= cRect.top - 12 &&
      curTop <= stickY + ON_HEADER_SLACK_PX;

    if (onHeader) {
      const next = current - 1;
      if (next >= 0) {
        return {
          target: anchors[next],
          reason: 'prev-on-header',
          index: next,
          current
        };
      }
      return { target: null, reason: 'need-load', index: -1, current };
    }

    // Проскроллили ниже заголовка — сначала к нему (начало текущего обращения)
    return {
      target: anchors[current],
      reason: 'to-current',
      index: current,
      current
    };
  }

  function snapshotChat(container) {
    const first = container.querySelector(SELECTORS.chatMessage);
    return {
      scrollHeight: container.scrollHeight,
      childCount: container.querySelectorAll(SELECTORS.chatMessage).length,
      firstId: first?.getAttribute('data-messageid') || null,
      scrollTop: Math.round(container.scrollTop)
    };
  }

  function chatGrew(container, before) {
    if (!before) return true;
    const after = snapshotChat(container);
    return (
      after.scrollHeight > before.scrollHeight + 8 ||
      after.childCount > before.childCount ||
      (after.firstId && after.firstId !== before.firstId)
    );
  }

  function waitForChatChange(container, before, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (grew) => {
        if (done) return;
        done = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve(grew);
      };

      const observer = new MutationObserver(() => {
        if (chatGrew(container, before)) finish(true);
      });
      observer.observe(container, { childList: true, subtree: true });

      const timer = setTimeout(() => {
        finish(chatGrew(container, before));
      }, timeoutMs);
    });
  }

  function scrollToAnchor(container, el, index) {
    const top = Math.max(0, getOffsetTopInContainer(container, el) - 8);
    const key = getAnchorKey(el);
    log('scrollTo', {
      top: Math.round(top),
      index,
      key: key.slice(0, 80)
    });

    // instant — иначе при smooth повторный клик попадает в тот же якорь
    try {
      container.scrollTo({ top, behavior: 'auto' });
    } catch (e) {
      container.scrollTop = top;
    }

    state.scrollLastJumpKey = key;
    state.scrollLastJumpAt = Date.now();
    if (typeof index === 'number' && index >= 0) {
      state.scrollJumpIndex = index;
    }
  }

  /**
   * Догрузка истории с сохранением позиции якоря (не «телепорт» в начало ленты навсегда).
   */
  async function tryLoadOlderHistory(container) {
    const before = snapshotChat(container);
    log('load more history…', before);

    const root = O.getChatMessagesContainer() || container;
    const firstMsg = root.querySelector(SELECTORS.chatMessage);
    const keepId = firstMsg?.getAttribute('data-messageid') || null;
    const keepOffset = firstMsg
      ? getOffsetTopInContainer(container, firstMsg) - container.scrollTop
      : 0;

    // Триггер infinite-scroll
    container.scrollTop = 0;

    let grew = await waitForChatChange(container, before, LOAD_WAIT_MS);
    if (!grew) {
      await new Promise((r) => setTimeout(r, 280));
      grew = chatGrew(container, before);
    }

    // Вернуть визуальную позицию к тому же сообщению (prepend сдвигает layout)
    if (keepId) {
      const el = root.querySelector(`${SELECTORS.chatMessage}[data-messageid="${keepId}"]`)
        || container.querySelector(`[data-messageid="${keepId}"]`);
      if (el) {
        const newTop = getOffsetTopInContainer(container, el);
        container.scrollTop = Math.max(0, newTop - keepOffset);
      }
    }

    return grew;
  }

  async function jumpToPreviousAppeal() {
    if (state.scrollAppealsBusy) {
      log('busy, skip');
      return;
    }
    if (!O.isContextValid()) {
      O.handleContextInvalidated();
      return;
    }

    const container = getChatScrollContainer();
    if (!container) {
      log('нет контейнера сообщений');
      return;
    }

    state.scrollAppealsBusy = true;
    const btn = state.scrollAppealsHost?.querySelector('button');
    if (btn) btn.disabled = true;

    try {
      for (let attempt = 0; attempt < MAX_LOAD_ATTEMPTS; attempt++) {
        const root = O.getChatMessagesContainer() || container;
        const anchors = collectAppealCreatedAnchors(root);
        const jump = findJumpTarget(container, anchors);

        log('attempt', attempt, {
          anchors: anchors.length,
          reason: jump.reason,
          index: jump.index,
          current: jump.current,
          seqIndex: state.scrollJumpIndex,
          sample: anchors.map((el) => getAnchorKey(el)).slice(-5)
        });

        if (jump.target) {
          scrollToAnchor(container, jump.target, jump.index);
          return;
        }

        // Догрузка только empty / need-load
        if (jump.reason !== 'empty' && jump.reason !== 'need-load') {
          log('неожиданный reason без target', jump.reason);
          break;
        }

        const grew = await tryLoadOlderHistory(container);
        if (!grew && attempt >= 1) {
          log('история больше не подгружается');
          break;
        }

        // После догрузки: если серия шла к более старому — прыгаем к новому «самому старому»
        // в загруженном куске только если он реально новый (не тот же index 0).
        if (jump.reason === 'need-load') {
          const anchors2 = collectAppealCreatedAnchors(O.getChatMessagesContainer() || container);
          if (anchors2.length) {
            // Новый первый элемент = более старое обращение, если prepend сработал
            const firstKey = getAnchorKey(anchors2[0]);
            if (firstKey && firstKey !== state.scrollLastJumpKey) {
              scrollToAnchor(container, anchors2[0], 0);
              return;
            }
          }
        }
      }

      const root = O.getChatMessagesContainer() || container;
      const anchors = collectAppealCreatedAnchors(root);
      const jump = findJumpTarget(container, anchors);
      if (jump.target) {
        scrollToAnchor(container, jump.target, jump.index);
      } else {
        log('якорь «создано» выше не найден', {
          anchors: anchors.length,
          reason: jump.reason
        });
      }
    } finally {
      state.scrollAppealsBusy = false;
      if (btn) btn.disabled = false;
    }
  }

  function createUpButton(nativeCircle) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = CSS.scrollUpBtn;
    btn.title = 'К началу обращения';
    btn.setAttribute('aria-label', 'Прокрутить к блоку «Обращение создано»');
    btn.setAttribute('data-omnichat-scroll-up', 'true');

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.transform = 'rotate(180deg)';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('clip-rule', 'evenodd');
    path.setAttribute('d', CHEVRON_DOWN_PATH);
    svg.appendChild(path);
    btn.appendChild(svg);

    O.detectTheme();
    if (state.isDarkTheme) {
      // Контраст: светлая стрелка на тёмном круге (не копируем fill native — он тоже тёмный)
      btn.classList.add('dark-theme');
      btn.style.background = 'rgb(61, 74, 92)';
      svg.style.fill = 'rgba(255, 255, 255, 0.92)';
    } else if (nativeCircle) {
      try {
        const st = window.getComputedStyle(nativeCircle);
        if (st.backgroundColor && st.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          btn.style.background = st.backgroundColor;
        }
        const nativeSvg = nativeCircle.querySelector('svg');
        if (nativeSvg) {
          const fill = window.getComputedStyle(nativeSvg).fill;
          if (fill) svg.style.fill = fill;
        }
      } catch (e) { /* ignore */ }
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpToPreviousAppeal();
    });

    return btn;
  }

  function clearNativeDownShift(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-omnichat-down-shifted]').forEach((el) => {
      el.style.removeProperty('transform');
      el.style.removeProperty('left');
      el.removeAttribute('data-omnichat-down-shifted');
    });
  }

  /**
   * «Вверх» на месте «вниз» (left:20).
   * Когда native «вниз» видна — сдвигаем её вправо, чтобы не перекрывать нашу.
   */
  function syncNativeDownShift(wrapper, circle) {
    const nativeVisible = isElementVisible(circle) || isElementVisible(wrapper);

    // Снять сдвиг с устаревших узлов (React мог пересоздать кнопку)
    const actions = getActionsBar();
    if (actions) {
      actions.querySelectorAll('[data-omnichat-down-shifted]').forEach((el) => {
        if (el !== wrapper && el !== circle) {
          el.style.removeProperty('transform');
          el.style.removeProperty('left');
          el.removeAttribute('data-omnichat-down-shifted');
        }
      });
    }

    if (!nativeVisible) {
      if (wrapper?.hasAttribute('data-omnichat-down-shifted')) {
        wrapper.style.removeProperty('transform');
        wrapper.style.removeProperty('left');
        wrapper.removeAttribute('data-omnichat-down-shifted');
      }
      if (circle?.hasAttribute('data-omnichat-down-shifted')) {
        circle.style.removeProperty('transform');
        circle.style.removeProperty('left');
        circle.removeAttribute('data-omnichat-down-shifted');
      }
      return;
    }

    // wrapper absolute left:20 → 20+36; circle часто position:fixed — translateX
    if (wrapper) {
      wrapper.setAttribute('data-omnichat-down-shifted', 'true');
      wrapper.style.setProperty('left', `${NATIVE_DOWN_LEFT_PX + DOWN_SHIFT_PX}px`, 'important');
    }
    if (circle && circle !== wrapper) {
      circle.setAttribute('data-omnichat-down-shifted', 'true');
      try {
        const pos = window.getComputedStyle(circle).position;
        if (pos === 'fixed') {
          circle.style.setProperty('transform', `translateX(${DOWN_SHIFT_PX}px)`, 'important');
        } else {
          circle.style.setProperty('left', `${NATIVE_DOWN_LEFT_PX + DOWN_SHIFT_PX}px`, 'important');
        }
      } catch (e) {
        circle.style.setProperty('transform', `translateX(${DOWN_SHIFT_PX}px)`, 'important');
      }
    }
  }

  function updateHostPosition(host, actions, wrapper, circle) {
    // Всегда слот native «вниз» — не наезжаем на чат слева
    host.style.left = `${UP_LEFT_PX}px`;

    try {
      const alignEl = (wrapper && isElementVisible(wrapper)) ? wrapper
        : (circle && isElementVisible(circle)) ? circle
          : null;
      if (alignEl) {
        const aRect = actions.getBoundingClientRect();
        const wRect = alignEl.getBoundingClientRect();
        // top до сдвига transform — для fixed с translate top совпадает
        if (wRect.height > 0 && aRect.height > 0) {
          // если уже сдвинут translateX, top всё равно верный
          host.style.top = `${Math.round(wRect.top - aRect.top)}px`;
        } else {
          host.style.top = '';
        }
      } else {
        host.style.top = '';
      }
    } catch (e) {
      host.style.top = '';
    }

    syncNativeDownShift(wrapper, circle);
  }

  function ensureScrollUpButton() {
    if (!state.settings.omnichatScrollToAppeal) return;
    if (!O.isContextValid()) return;

    document.querySelectorAll('[data-omnichat-scroll-up-host]').forEach((el) => {
      if (!el.closest(SELECTORS.actionsButton)) el.remove();
    });

    const actions = getActionsBar();
    if (!actions) {
      state.scrollAppealsHost = null;
      return;
    }

    O.injectBaseStyles();

    let host = actions.querySelector('[data-omnichat-scroll-up-host]');
    const { circle, wrapper } = findNativeScrollDown(actions);

    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-omnichat-scroll-up-host', 'true');
      host.className = CSS.scrollUpHost;
      host.appendChild(createUpButton(circle));

      // В DOM тоже слева от «вниз»
      if (wrapper && wrapper.parentElement === actions) {
        actions.insertBefore(host, wrapper);
      } else {
        actions.insertBefore(host, actions.firstChild);
      }

      state.scrollAppealsHost = host;
      log('кнопка смонтирована', { native: Boolean(circle) });
    } else {
      state.scrollAppealsHost = host;
      const btn = host.querySelector('button');
      if (btn) {
        O.detectTheme();
        const svg = btn.querySelector('svg');
        if (state.isDarkTheme) {
          btn.classList.add('dark-theme');
          btn.style.background = 'rgb(61, 74, 92)';
          if (svg) svg.style.fill = 'rgba(255, 255, 255, 0.92)';
        } else if (circle) {
          btn.classList.remove('dark-theme');
          try {
            const st = window.getComputedStyle(circle);
            if (st.backgroundColor && st.backgroundColor !== 'rgba(0, 0, 0, 0)') {
              btn.style.background = st.backgroundColor;
            }
            const nativeSvg = circle.querySelector('svg');
            if (svg && nativeSvg) {
              const fill = window.getComputedStyle(nativeSvg).fill;
              if (fill) svg.style.fill = fill;
            }
          } catch (e) { /* ignore */ }
        }
      }
    }

    updateHostPosition(host, actions, wrapper, circle);
  }

  function removeScrollUpButton() {
    clearNativeDownShift(document);
    document.querySelectorAll('[data-omnichat-scroll-up-host]').forEach((el) => el.remove());
    state.scrollAppealsHost = null;
  }

  O.initScrollToAppeal = function () {
    if (!state.settings.omnichatScrollToAppeal) return;
    if (state.scrollAppealsObserver) return;

    O.injectBaseStyles();
    ensureScrollUpButton();

    let debounce = null;
    state.scrollAppealsObserver = new MutationObserver(() => {
      if (!state.settings.omnichatScrollToAppeal || !O.isContextValid()) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        ensureScrollUpButton();
      }, 120);
    });
    state.scrollAppealsObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    setTimeout(ensureScrollUpButton, 400);
    setTimeout(ensureScrollUpButton, 1500);

    log('init');
  };

  O.disableScrollToAppeal = function () {
    if (state.scrollAppealsObserver) {
      state.scrollAppealsObserver.disconnect();
      state.scrollAppealsObserver = null;
    }
    removeScrollUpButton();
    state.scrollAppealsBusy = false;
    state.scrollLastJumpKey = '';
    state.scrollLastJumpAt = 0;
    state.scrollJumpIndex = null;
    log('disabled');
  };
})(window.OmnichatExt);
