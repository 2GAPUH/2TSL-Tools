// omnichat/templates-modal.js — вкладка «Дополнительно» в нативной вёрстке модалки
(function (O) {
  const { state, SELECTORS, CSS } = O;

  function getTemplateClasses() {
    const modal = O.getModal();
    const sample = modal?.querySelector(SELECTORS.replyTemplate);
    return {
      container: sample?.className || 'custom-template-item',
      title: modal?.querySelector(SELECTORS.replyTitle)?.className || '',
      name: modal?.querySelector(SELECTORS.replyTitle)?.className || '',
      content: modal?.querySelector(SELECTORS.collapsableText)?.className || ''
    };
  }

  function cacheTabClasses(wrapperTabs, { force = false } = {}) {
    if (!wrapperTabs) return;

    // Кэшируем стили только когда среди нативных вкладок есть и active, и inactive.
    // Иначе (уже на «Дополнительно») обе нативные вкладки inactive — «active» классы
    // перезапишутся inactive-стилями и подчёркивание пропадёт при повторном клике.
    const nativeTabs = Array.from(
      wrapperTabs.querySelectorAll(`${SELECTORS.tabFavorites}, ${SELECTORS.tabAllTemplate}`)
    );
    let active = nativeTabs.find((btn) => btn.getAttribute('aria-selected') === 'true') || null;
    let inactive = nativeTabs.find((btn) => btn.getAttribute('aria-selected') !== 'true') || null;

    if (!active || !inactive) {
      if (state.tabClasses?.activeBtn && state.tabClasses?.inactiveBtn && !force) {
        return;
      }
      // Первичная инициализация: берём «Все шаблоны» как active-образец, «Избранные» как inactive
      active = wrapperTabs.querySelector(`${SELECTORS.tabAllTemplate}[aria-selected="true"]`)
        || wrapperTabs.querySelector(SELECTORS.tabAllTemplate)
        || nativeTabs[1]
        || nativeTabs[0];
      inactive = wrapperTabs.querySelector(`${SELECTORS.tabFavorites}[aria-selected="false"]`)
        || wrapperTabs.querySelector(SELECTORS.tabFavorites)
        || nativeTabs.find((btn) => btn !== active)
        || nativeTabs[0];
    }

    if (!active || !inactive) return;

    state.tabClasses = {
      inactiveBtn: inactive.className || '',
      inactiveSpan: inactive.querySelector('span')?.className || '',
      activeBtn: active.className || '',
      activeSpan: active.querySelector('span')?.className || ''
    };
  }

  function getWrapperTabs() {
    return document.querySelector(SELECTORS.wrapperTabs);
  }

  function applyTabButtonStyle(button, active) {
    if (!button || !state.tabClasses) return;
    button.className = active ? state.tabClasses.activeBtn : state.tabClasses.inactiveBtn;
    const span = button.querySelector('span');
    if (span) span.className = active ? state.tabClasses.activeSpan : state.tabClasses.inactiveSpan;
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  }

  function setNativeTabsInactive() {
    const wrapperTabs = getWrapperTabs();
    if (!wrapperTabs) return;
    wrapperTabs.querySelectorAll(`${SELECTORS.tabFavorites}, ${SELECTORS.tabAllTemplate}`).forEach((btn) => {
      applyTabButtonStyle(btn, false);
    });
  }

  function setAdditionalTabSelected(selected) {
    const btn = document.querySelector(SELECTORS.tabAdditional);
    if (!btn) return;

    const wrapperTabs = getWrapperTabs();
    wrapperTabs?.classList.toggle('omnichat-ext-additional-mode', selected);

    if (selected) {
      // Не пересчитываем классы, если нативные вкладки уже все inactive
      if (wrapperTabs) cacheTabClasses(wrapperTabs, { force: false });
      if (!state.tabClasses) return;
      setNativeTabsInactive();
      applyTabButtonStyle(btn, true);
      return;
    }

    if (!state.tabClasses) return;
    applyTabButtonStyle(btn, false);
  }

  function getTemplatesListContainer() {
    return state.templatesOverlay;
  }

  function refreshTemplatesList() {
    const layout = O.getModalLayout();
    hideNativeTemplateContent(layout?.templates, true);
    state.templatesOverlay?.classList.remove(CSS.nativeHidden);

    const list = getTemplatesListContainer();
    if (!list) return;
    const query = state.searchInput?.value || '';
    O.loadAndDisplayCustomTemplates(list, query, state.currentSelectedGroup);
  }

  function stopTemplatesGuard() {
    // Важно: сбрасывать отложенный setTimeout, иначе после ухода с «Дополнительно»
    // таймер снова скроет нативный список и покажет оверлей своих шаблонов.
    if (state.templatesGuardTimer) {
      clearTimeout(state.templatesGuardTimer);
      state.templatesGuardTimer = null;
    }
    if (state.templatesGuardObserver) {
      state.templatesGuardObserver.disconnect();
      state.templatesGuardObserver = null;
    }
  }

  function startTemplatesGuard(templatesBox) {
    stopTemplatesGuard();
    if (!templatesBox) return;

    state.templatesGuardObserver = new MutationObserver(() => {
      if (!state.isAdditionalTabActive) return;
      if (state.templatesGuardTimer) clearTimeout(state.templatesGuardTimer);
      state.templatesGuardTimer = setTimeout(() => {
        state.templatesGuardTimer = null;
        if (!state.isAdditionalTabActive) return;
        hideNativeTemplateContent(templatesBox, true);
        state.templatesOverlay?.classList.remove(CSS.nativeHidden);
      }, 0);
    });

    state.templatesGuardObserver.observe(templatesBox, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }

  function buildFilterHost(categoriesCol) {
    let host = categoriesCol.querySelector('[data-omnichat-filter-host]');
    if (host) return host;

    host = document.createElement('div');
    host.setAttribute('data-omnichat-filter-host', 'true');
    host.className = 'omnichat-ext-filter-host';
    categoriesCol.appendChild(host);

    O.detectTheme();
    const classes = getTemplateClasses();

    const title = document.createElement('div');
    title.className = classes.title;
    const titleSpan = document.createElement('span');
    titleSpan.className = classes.name;
    titleSpan.textContent = 'Фильтр по группам';
    title.appendChild(titleSpan);
    host.appendChild(title);

    const select = document.createElement('select');
    select.className = 'group-filter-select';

    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Все группы';
    select.appendChild(defaultOpt);

    O.storageGet(['groups']).then((result) => {
      (result.groups || []).forEach((group) => {
        const opt = document.createElement('option');
        opt.value = group;
        opt.textContent = group;
        select.appendChild(opt);
      });
      if (state.currentSelectedGroup) select.value = state.currentSelectedGroup;
    }).catch(() => {});

    select.addEventListener('change', (e) => {
      state.currentSelectedGroup = e.target.value;
      refreshTemplatesList();
    });
    host.appendChild(select);
    state.groupFilterSelect = select;

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'group-filter-reset';
    resetBtn.textContent = 'Сбросить фильтр';
    resetBtn.addEventListener('click', () => {
      select.value = '';
      state.currentSelectedGroup = '';
      if (state.searchInput) state.searchInput.value = '';
      refreshTemplatesList();
    });
    host.appendChild(resetBtn);

    if (state.isDarkTheme) host.classList.add('dark-theme');
    state.filterHost = host;
    return host;
  }

  function isProtectedLayoutNode(node) {
    if (!node || node.nodeType !== 1) return true;
    if (node.hasAttribute('data-omnichat-templates-overlay')) return true;
    if (node.hasAttribute('data-omnichat-search-host')) return true;
    if (node.hasAttribute('data-omnichat-filter-host')) return true;
    if (node.matches?.(SELECTORS.tabsGroup) || node.matches?.(SELECTORS.wrapperTabs)) return true;
    if (node.matches?.(SELECTORS.tabAdditional) || node.matches?.(SELECTORS.tabFavorites) || node.matches?.(SELECTORS.tabAllTemplate)) return true;
    if (node.id === 'scroll-box-root' || node.matches?.(SELECTORS.scrollBoxRoot)) return true;
    if (node.querySelector?.(SELECTORS.tabsGroup) || node.querySelector?.(SELECTORS.wrapperTabs)) return true;
    if (node.querySelector?.('[data-omnichat-templates-overlay]')) return true;
    return false;
  }

  function hideNativeTemplateContent(templatesBox, hidden) {
    if (!templatesBox) return;
    // Сам scroll-box шаблонов никогда не скрываем — только нативные children
    templatesBox.classList.remove(CSS.nativeHidden);
    templatesBox.querySelectorAll(':scope > *').forEach((child) => {
      if (child.hasAttribute('data-omnichat-templates-overlay')) return;
      child.classList.toggle(CSS.nativeHidden, hidden);
    });
  }

  /** Полностью убрать UI «Дополнительно» из колонки шаблонов и вернуть нативный список. */
  function restoreNativeTemplatesView(templatesBox) {
    if (!templatesBox) return;

    templatesBox.querySelectorAll('[data-omnichat-templates-overlay]').forEach((overlay) => {
      overlay.textContent = '';
      overlay.classList.add(CSS.nativeHidden);
    });

    templatesBox.classList.remove(CSS.nativeHidden);
    templatesBox.querySelectorAll(':scope > *').forEach((child) => {
      if (child.hasAttribute('data-omnichat-templates-overlay')) return;
      child.classList.remove(CSS.nativeHidden);
    });

    // На случай, если nativeHidden остался на вложенных нативных узлах
    templatesBox.querySelectorAll(`.${CSS.nativeHidden}`).forEach((el) => {
      if (el.hasAttribute('data-omnichat-templates-overlay')) return;
      if (el.hasAttribute('data-omnichat-search-host')) return;
      if (el.hasAttribute('data-omnichat-filter-host')) return;
      el.classList.remove(CSS.nativeHidden);
    });
  }

  function ensureTemplatesOverlay(templatesBox) {
    if (!templatesBox) return null;

    templatesBox.classList.remove(CSS.nativeHidden);

    const savedHeight = templatesBox.offsetHeight;
    if (savedHeight > 0) {
      templatesBox.style.minHeight = `${savedHeight}px`;
    }

    templatesBox.style.position = 'relative';

    let overlay = templatesBox.querySelector('[data-omnichat-templates-overlay]');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.setAttribute('data-omnichat-templates-overlay', 'true');
      overlay.className = 'omnichat-ext-templates-overlay';
      templatesBox.appendChild(overlay);
    }

    hideNativeTemplateContent(templatesBox, true);
    overlay.classList.remove(CSS.nativeHidden);
    state.templatesOverlay = overlay;
    return overlay;
  }

  function hideNativeSearchRow(searchRow) {
    if (!searchRow) return;
    // Нельзя скрывать вкладки / scroll-box шаблонов, если searchRow оказался слишком широким
    searchRow.querySelectorAll(':scope > *').forEach((child) => {
      if (isProtectedLayoutNode(child)) return;
      child.classList.add(CSS.nativeHidden);
    });
  }

  function showNativeSearchRow(searchRow) {
    if (!searchRow) return;
    searchRow.querySelectorAll(':scope > *').forEach((child) => {
      if (child.hasAttribute('data-omnichat-search-host')) return;
      if (isProtectedLayoutNode(child)) return;
      child.classList.remove(CSS.nativeHidden);
    });
  }

  function ensureSearchHost(searchRow) {
    let host = searchRow.querySelector('[data-omnichat-search-host]');
    if (host) return host;

    host = document.createElement('div');
    host.setAttribute('data-omnichat-search-host', 'true');
    host.className = 'omnichat-ext-search-host';

    const sampleInput = searchRow.querySelector(SELECTORS.searchTemplate)
      || O.getModal()?.querySelector(SELECTORS.searchTemplate);
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'omnichat-ext-search-input';
    input.placeholder = 'Поиск в моих шаблонах...';
    if (sampleInput?.className) {
      input.className += ` ${sampleInput.className}`;
    }

    host.appendChild(input);
    searchRow.appendChild(host);
    state.searchHost = host;
    return host;
  }

  function resolveSearchMount(searchRow) {
    if (searchRow && !searchRow.matches?.(SELECTORS.tabsGroup) && !searchRow.querySelector?.(SELECTORS.tabsGroup)) {
      return searchRow;
    }

    const layout = O.getModalLayout();
    const narrow = layout?.searchRow;
    if (narrow && !narrow.querySelector?.(SELECTORS.tabsGroup)) return narrow;

    const nativeSearch = layout?.modal?.querySelector(SELECTORS.searchTemplate);
    return nativeSearch?.parentElement?.parentElement || nativeSearch?.parentElement || null;
  }

  function setupAdditionalSearch(searchRow) {
    const mount = resolveSearchMount(searchRow);
    if (!mount) return;

    hideNativeSearchRow(mount);

    const host = ensureSearchHost(mount);
    host.classList.remove(CSS.nativeHidden);

    const input = host.querySelector('input');
    if (!input) return;

    if (state.searchInput && state.searchInputHandler) {
      state.searchInput.removeEventListener('input', state.searchInputHandler);
    }

    state.searchInput = input;
    state.searchInput.value = '';
    state.searchInputHandler = () => refreshTemplatesList();
    state.searchInput.addEventListener('input', state.searchInputHandler);
  }

  function restoreAdditionalSearch(searchRow) {
    const mount = resolveSearchMount(searchRow) || searchRow;
    if (!mount) return;

    if (state.searchInput && state.searchInputHandler) {
      state.searchInput.removeEventListener('input', state.searchInputHandler);
    }

    state.searchInput = null;
    state.searchInputHandler = null;
    mount.querySelector('[data-omnichat-search-host]')?.classList.add(CSS.nativeHidden);
    // Хост мог остаться в другом mount после смены вёрстки
    state.searchHost?.classList.add(CSS.nativeHidden);
    showNativeSearchRow(mount);
  }

  O.activateAdditionalTab = function () {
    const layout = O.getModalLayout();
    if (!layout?.templates) return;

    // Вкладки должны оставаться видимыми всегда
    layout.tabsGroup?.classList.remove(CSS.nativeHidden);
    layout.tabsGroup?.querySelector(SELECTORS.wrapperTabs)?.classList.remove(CSS.nativeHidden);

    if (layout.categoriesCol && !layout.categoriesCol.closest(SELECTORS.titleModal)) {
      buildFilterHost(layout.categoriesCol);
      state.filterHost?.classList.remove(CSS.nativeHidden);
    }
    layout.categories?.classList.add(CSS.nativeHidden);

    setupAdditionalSearch(layout.searchRow);

    ensureTemplatesOverlay(layout.templates);
    startTemplatesGuard(layout.templates);

    state.isAdditionalTabActive = true;
    setAdditionalTabSelected(true);
    refreshTemplatesList();
    setTimeout(() => state.searchInput?.focus(), 100);
  };

  O.deactivateAdditionalTab = function () {
    if (!state.isAdditionalTabActive) return;

    // Сразу снимаем флаг и гард, чтобы отложенный setTimeout не вернул оверлей.
    state.isAdditionalTabActive = false;
    stopTemplatesGuard();
    state.currentLoadingId++;

    const layout = O.getModalLayout();

    state.filterHost?.classList.add(CSS.nativeHidden);
    layout?.categories?.classList.remove(CSS.nativeHidden);
    layout?.tabsGroup?.classList.remove(CSS.nativeHidden);

    restoreNativeTemplatesView(layout?.templates);
    if (state.templatesOverlay) {
      state.templatesOverlay.textContent = '';
      state.templatesOverlay.classList.add(CSS.nativeHidden);
    }

    restoreAdditionalSearch(layout?.searchRow);
    setAdditionalTabSelected(false);
  };

  function createTemplateElement(template, classes) {
    const div = document.createElement('div');
    div.setAttribute('data-omnichat-custom-template', template.id || template.name);
    div.className = `${classes.container} custom-template-item ${CSS.customTemplate}`;
    if (state.isDarkTheme) div.classList.add('dark-theme');

    const titleDiv = document.createElement('div');
    titleDiv.className = `${classes.title} custom-template-title-wrapper`;
    titleDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

    const titleSpan = document.createElement('span');
    titleSpan.className = classes.name;
    titleSpan.textContent = template.name;
    titleSpan.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;';
    titleDiv.appendChild(titleSpan);

    if (template.group) {
      const badge = document.createElement('span');
      badge.className = 'template-group-badge';
      badge.textContent = template.group;
      badge.style.cssText = `color:${state.isDarkTheme ? '#ccc' : '#666'};background:${state.isDarkTheme ? '#444' : '#f0f0f0'};`;
      titleDiv.appendChild(badge);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'custom-template-content-wrapper';

    const bodyDiv = document.createElement('div');
    bodyDiv.className = classes.content;
    bodyDiv.textContent = template.body;
    bodyDiv.style.cssText = 'word-wrap:break-word;overflow-wrap:break-word;';
    contentDiv.appendChild(bodyDiv);

    div.appendChild(titleDiv);
    div.appendChild(contentDiv);

    div.addEventListener('click', () => {
      O.insertTemplateIntoChat(template.body);
      setTimeout(() => O.resetTemplatesState(), 300);
    });

    return div;
  }

  function renderTemplatesMessage(wrapper, classes, title, body) {
    wrapper.textContent = '';
    const empty = document.createElement('div');
    empty.className = `${classes.container} custom-template-item`;
    const emptyTitle = document.createElement('div');
    emptyTitle.className = `${classes.title} custom-template-title-wrapper`;
    const emptyTitleSpan = document.createElement('span');
    emptyTitleSpan.className = classes.name;
    emptyTitleSpan.textContent = title;
    emptyTitle.appendChild(emptyTitleSpan);
    empty.appendChild(emptyTitle);

    const emptyBodyWrap = document.createElement('div');
    emptyBodyWrap.className = 'custom-template-content-wrapper';
    const emptyBody = document.createElement('div');
    emptyBody.className = classes.content;
    emptyBody.textContent = body;
    emptyBodyWrap.appendChild(emptyBody);
    empty.appendChild(emptyBodyWrap);
    wrapper.appendChild(empty);
  }

  O.loadAndDisplayCustomTemplates = function (container, searchQuery = '', groupFilter = '') {
    if (!container) return;

    O.detectTheme();
    const classes = getTemplateClasses();
    const thisLoadingId = ++state.currentLoadingId;

    container.textContent = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-templates-wrapper';
    if (state.isDarkTheme) wrapper.classList.add('dark-theme');
    container.appendChild(wrapper);

    if (!O.isContextValid()) {
      renderTemplatesMessage(wrapper, classes, 'Нужно обновить страницу', 'Расширение было перезагружено. Нажмите F5 на странице Omnichat.');
      return;
    }

    renderTemplatesMessage(wrapper, classes, 'Загрузка...', 'Получаем ваши шаблоны');

    O.storageGet(['templates']).then((result) => {
      if (thisLoadingId !== state.currentLoadingId) return;

      let templates = result.templates || [];
      if (groupFilter) templates = templates.filter((t) => t.group === groupFilter);
      const filtered = searchQuery ? O.exactSearch(searchQuery, templates) : templates;

      if (filtered.length === 0) {
        renderTemplatesMessage(
          wrapper,
          classes,
          searchQuery || groupFilter ? 'Ничего не найдено' : 'Нет шаблонов',
          searchQuery
            ? 'Измените запрос'
            : groupFilter
              ? 'Измените фильтр'
              : 'Создайте шаблоны в расширении'
        );
        return;
      }

      wrapper.textContent = '';
      filtered.forEach((template) => wrapper.appendChild(createTemplateElement(template, classes)));
    }).catch(() => {
      if (thisLoadingId !== state.currentLoadingId) return;
      renderTemplatesMessage(
        wrapper,
        classes,
        'Не удалось загрузить шаблоны',
        'Обновите страницу Omnichat (F5) и откройте модалку снова.'
      );
    });
  };

  function addAdditionalButton() {
    return O.safelyExecute(() => {
      const tabsGroup = document.querySelector(SELECTORS.tabsGroup);
      const wrapperTabs = tabsGroup?.querySelector(SELECTORS.wrapperTabs);
      if (!wrapperTabs) return false;

      document.querySelector(SELECTORS.tabAdditional)?.remove();
      cacheTabClasses(wrapperTabs);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-testid', 'tab-additional');
      btn.setAttribute('aria-selected', 'false');
      btn.className = state.tabClasses?.inactiveBtn || '';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Повторный клик по уже активной вкладке — только восстановить подсветку, без re-cache
        if (state.isAdditionalTabActive) {
          setAdditionalTabSelected(true);
          return;
        }
        O.trackEvent('omnichat_templates_tab_open');
        O.activateAdditionalTab();
      });

      const span = document.createElement('span');
      span.className = state.tabClasses?.inactiveSpan || '';
      span.textContent = 'Дополнительно';
      btn.appendChild(span);

      wrapperTabs.appendChild(btn);

      if (!wrapperTabs.dataset.omnichatTabsBound) {
        wrapperTabs.dataset.omnichatTabsBound = 'true';
        wrapperTabs.addEventListener('click', (e) => {
          if (e.target.closest(SELECTORS.tabAdditional)) return;
          const nativeTab = e.target.closest(`${SELECTORS.tabFavorites}, ${SELECTORS.tabAllTemplate}`);
          if (!nativeTab) return;

          const wasAdditional = state.isAdditionalTabActive;
          O.deactivateAdditionalTab();

          // Подсветка нативных вкладок; при уходе с «Дополнительно» ещё раз
          // гарантируем показ нативного списка (после возможного React re-render).
          applyTabButtonStyle(nativeTab, true);
          wrapperTabs.querySelectorAll(`${SELECTORS.tabFavorites}, ${SELECTORS.tabAllTemplate}`).forEach((btn) => {
            if (btn !== nativeTab) applyTabButtonStyle(btn, false);
          });

          if (wasAdditional) {
            requestAnimationFrame(() => {
              const layout = O.getModalLayout();
              restoreNativeTemplatesView(layout?.templates);
            });
          }
        }, true);
      }

      return true;
    }, 'Ошибка добавления кнопки');
  }

  O.resetTemplatesState = function () {
    O.deactivateAdditionalTab();
    state.isInitialized = false;
    state.currentSelectedGroup = '';
    state.searchInput = null;
    state.searchInputHandler = null;
    state.groupFilterSelect = null;
    state.tabClasses = null;
    state.currentLoadingId++;

    getWrapperTabs()?.classList.remove('omnichat-ext-additional-mode');
    document.querySelector(SELECTORS.tabAdditional)?.remove();
    stopTemplatesGuard();
    state.filterHost?.remove();
    state.searchHost?.remove();
    state.templatesOverlay?.remove();
    state.filterHost = null;
    state.searchHost = null;
    state.templatesOverlay = null;

    const layout = O.getModalLayout();
    layout?.categories?.classList.remove(CSS.nativeHidden);
    layout?.tabsGroup?.classList.remove(CSS.nativeHidden);
    layout?.templates?.classList.remove(CSS.nativeHidden);
    hideNativeTemplateContent(layout?.templates, false);
    restoreAdditionalSearch(layout?.searchRow);

    // На всякий случай снимаем ошибочно навешанные hidden с вкладок
    document.querySelectorAll(
      `${SELECTORS.tabsGroup}.${CSS.nativeHidden}, ${SELECTORS.wrapperTabs}.${CSS.nativeHidden}`
    ).forEach((el) => el.classList.remove(CSS.nativeHidden));
  };

  function observeModalClose() {
    if (state.modalCloseObserver) return;

    state.modalCloseObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        for (const node of mutation.removedNodes) {
          if (node.nodeType !== 1 || !node.querySelector) continue;
          if (
            node.querySelector(SELECTORS.tabsGroup) ||
            node.querySelector(SELECTORS.modal) ||
            node.matches?.(SELECTORS.modal)
          ) {
            O.resetTemplatesState();
          }
        }
      }
    });

    state.modalCloseObserver.observe(document.body, { childList: true, subtree: true });
  }

  O.initializeTemplatesModal = function () {
    if (state.isInitialized || !state.settings.omnichatTemplates) return;

    O.safelyExecute(() => {
      if (!O.isModalReady()) return;

      O.injectBaseStyles();
      O.detectTheme();
      if (!addAdditionalButton()) return;

      state.isInitialized = true;
      observeModalClose();
    }, 'Ошибка инициализации шаблонов');
  };

  O.disableOmnichatTemplates = function () {
    O.resetTemplatesState();
    console.log('[Omnichat] Шаблоны отключены');
  };
})(window.OmnichatExt);