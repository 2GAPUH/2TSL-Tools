// omnichat/scroll-appeals.js — кнопка «вверх» к блокам «Обращение #… создано»
(function (O) {
  const { state, SELECTORS, CSS } = O;

  const MAX_LOAD_ATTEMPTS = 8;
  const LOAD_WAIT_MS = 550;
  const STICK_OFFSET_PX = 56;
  const ON_HEADER_SLACK_PX = 28;
  // Нативная «вниз»: left:20px, 32×32.
  // «Вверх» всегда в этом слоте (left:20). Когда «вниз» видна — сдвигаем её
  // вправо на 36px, но только один раз (не left и translateX вместе — test.txt).
  const NATIVE_DOWN_LEFT_PX = 20;
  const BTN_SIZE_PX = 32;
  const BTN_GAP_PX = 4;
  const UP_LEFT_PX = NATIVE_DOWN_LEFT_PX; // 20 — слот «вверх»
  const DOWN_TARGET_LEFT_PX = NATIVE_DOWN_LEFT_PX + BTN_SIZE_PX + BTN_GAP_PX; // 56
  const DOWN_SHIFT_PX = BTN_SIZE_PX + BTN_GAP_PX; // 36
  const LAST_JUMP_TTL_MS = 8000;
  // Как у нативной стрелки (omnichat_dark / light)
  const NATIVE_FILL_DARK = '#ffffff99';
  const NATIVE_FILL_LIGHT = '#10182880';

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

  /**
   * Стили «вверх» = как у native «вниз» (test.txt / omnichat_dark):
   * прозрачный/тот же фон круга + fill #ffffff99 (dark) / #10182880 (light).
   */
  function applyUpButtonNativeLook(btn, nativeCircle) {
    if (!btn) return;
    const svg = btn.querySelector('svg');
    O.detectTheme();

    let bg = 'transparent';
    let fill = state.isDarkTheme ? NATIVE_FILL_DARK : NATIVE_FILL_LIGHT;

    if (nativeCircle) {
      try {
        const st = window.getComputedStyle(nativeCircle);
        const nbg = st.backgroundColor;
        // Не подставляем «серый прямоугольник», если native фактически прозрачный
        if (
          nbg &&
          nbg !== 'rgba(0, 0, 0, 0)' &&
          nbg !== 'transparent' &&
          !/^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/i.test(nbg)
        ) {
          bg = nbg;
        }
        const nativeSvg = nativeCircle.querySelector('svg');
        if (nativeSvg) {
          const attrFill = nativeSvg.getAttribute('fill');
          if (attrFill && attrFill !== 'none' && !attrFill.startsWith('url')) {
            fill = attrFill;
          } else {
            const cf = window.getComputedStyle(nativeSvg).fill;
            if (cf && cf !== 'none' && cf !== 'rgba(0, 0, 0, 0)') fill = cf;
          }
        }
      } catch (e) { /* ignore */ }
    }

    btn.style.background = bg;
    btn.style.boxShadow = 'none';
    if (state.isDarkTheme) {
      btn.classList.add('dark-theme');
    } else {
      btn.classList.remove('dark-theme');
    }
    if (svg) {
      svg.style.fill = fill;
      svg.setAttribute('fill', fill);
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

    applyUpButtonNativeLook(btn, nativeCircle);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpToPreviousAppeal();
    });

    return btn;
  }

  /**
   * Бейдж «N новых» рядом со scroll-down: absolute sibling в #Actions-button.
   * Сдвигаем вместе с «вниз», чтобы цифра не висела у «вверх».
   */
  function findUnreadCountBadges(actions, wrapper, circle) {
    if (!actions) return [];
    const out = [];
    const skip = (el) =>
      el.closest('[data-omnichat-scroll-up-host]') ||
      el.closest('[data-testid="close-appeal"]') ||
      el.closest('[data-testid="transfer-appeal"]');

    actions.querySelectorAll('div, span').forEach((el) => {
      if (skip(el)) return;
      if (wrapper && wrapper.contains(el) && el !== wrapper) return;
      if (circle && circle.contains(el) && el !== circle) return;

      const text = (el.textContent || '').replace(/\s+/g, '').trim();
      if (!/^\d{1,3}$/.test(text)) return;
      if (el.childElementCount > 2) return;

      try {
        const r = el.getBoundingClientRect();
        if (r.width < 6 || r.height < 6 || r.width > 48 || r.height > 48) return;
        const aRect = actions.getBoundingClientRect();
        if (r.left - aRect.left > 120) return;
      } catch (e) {
        return;
      }
      out.push(el);
    });
    return out;
  }

  function clearShiftStyles(el) {
    if (!el) return;
    el.style.removeProperty('transform');
    el.style.removeProperty('left');
    el.removeAttribute('data-omnichat-down-shifted');
  }

  function clearNativeDownShift(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-omnichat-down-shifted]').forEach(clearShiftStyles);
  }

  /**
   * Сдвинуть элемент так, чтобы его left относительно actions ≈ targetLeftPx.
   * Используем transform (безопасно для position:fixed), без повторного left.
   */
  function shiftToTargetLeft(el, actions, targetLeftPx) {
    if (!el || !actions) return;
    // Снять наш прошлый сдвиг, чтобы замерить «натуральную» позицию
    clearShiftStyles(el);
    try {
      const aLeft = actions.getBoundingClientRect().left;
      const cur = el.getBoundingClientRect().left - aLeft;
      const delta = Math.round(targetLeftPx - cur);
      if (Math.abs(delta) < 3) return; // уже на месте (например, поехала вместе с wrapper)
      el.setAttribute('data-omnichat-down-shifted', 'true');
      el.style.setProperty('transform', `translateX(${delta}px)`, 'important');
    } catch (e) {
      el.setAttribute('data-omnichat-down-shifted', 'true');
      el.style.setProperty('transform', `translateX(${DOWN_SHIFT_PX}px)`, 'important');
    }
  }

  /**
   * «Вверх» на left:20. Native «вниз» — на left:56 (один сдвиг).
   * Wrapper absolute: left → 56. Circle fixed: только догоняющий translateX,
   * если после сдвига wrapper ещё не на 56 (избегаем double-shift из test.txt).
   */
  function syncNativeDownShift(wrapper, circle) {
    const actions = getActionsBar();
    const nativeVisible = isElementVisible(circle) || isElementVisible(wrapper);

    if (!actions) return;

    if (!nativeVisible) {
      clearNativeDownShift(actions);
      return;
    }

    const keep = new Set();
    if (wrapper) keep.add(wrapper);
    if (circle) keep.add(circle);

    const badges = findUnreadCountBadges(actions, wrapper, circle);
    badges.forEach((b) => keep.add(b));

    // Снять сдвиг с узлов, которые больше не актуальны
    actions.querySelectorAll('[data-omnichat-down-shifted]').forEach((el) => {
      if (!keep.has(el)) clearShiftStyles(el);
    });

    // 1) Wrapper (absolute left:20 → 56). Без transform — иначе fixed-потомок
    //    меняет containing block.
    if (wrapper) {
      clearShiftStyles(wrapper);
      wrapper.setAttribute('data-omnichat-down-shifted', 'true');
      wrapper.style.setProperty('left', `${DOWN_TARGET_LEFT_PX}px`, 'important');
    }

    // 2) Circle: только если визуально ещё не уехал вправо после wrapper
    if (circle && circle !== wrapper) {
      if (wrapper && wrapper.contains(circle)) {
        // Снять старый translate, замерить после left у wrapper
        clearShiftStyles(circle);
        shiftToTargetLeft(circle, actions, DOWN_TARGET_LEFT_PX);
      } else {
        shiftToTargetLeft(circle, actions, DOWN_TARGET_LEFT_PX);
      }
    }

    // 3) Бейджи вне wrapper
    badges.forEach((badge) => {
      if (badge === wrapper || badge === circle) return;
      if (wrapper && wrapper.contains(badge)) return;
      if (circle && circle.contains(badge)) return;
      shiftToTargetLeft(badge, actions, DOWN_TARGET_LEFT_PX);
    });
  }

  function updateHostPosition(host, actions, wrapper, circle) {
    // «Вверх» всегда в слоте native left:20
    host.style.left = `${UP_LEFT_PX}px`;

    try {
      // top по wrapper до/без transform; если wrapper уже с left:56 — top тот же
      const alignEl = (wrapper && document.contains(wrapper)) ? wrapper
        : (circle && isElementVisible(circle)) ? circle
          : null;
      if (alignEl && (isElementVisible(circle) || isElementVisible(wrapper))) {
        const aRect = actions.getBoundingClientRect();
        const wRect = alignEl.getBoundingClientRect();
        if (wRect.height > 0 && aRect.height > 0) {
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

      // В DOM слева от «вниз» (как и визуально)
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
      if (btn) applyUpButtonNativeLook(btn, circle);
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
