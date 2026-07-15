// omnichat/ttm-links.js — кликабельные НЛС и номера заявок
(function (O) {
  const { state, CSS } = O;

  function openInTTM(searchValue) {
    if (!searchValue || !O.isContextValid()) {
      O.handleContextInvalidated();
      return;
    }

    const cleanValue = searchValue.replace(/\s+/g, '');
    // Вкладку создаёт background и только потом пишет ttmSearchData с targetTabId,
    // чтобы другие уже открытые TTM-вкладки не запускали поиск (антиспам TTM).
    O.sendExtensionMessage({
      action: 'openTtmSearch',
      url: 'https://www.ttm.rt.ru/',
      searchValue: cleanValue
    }).catch(() => {});
  }

  function createClickableLink(text, value, linkType = 'ticket') {
    const link = document.createElement('span');
    link.className = CSS.ttmLink;
    link.textContent = text;
    link.title = `Найти "${value}" в TTM`;
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      O.trackEvent(linkType === 'nls' ? 'omnichat_link_click_nls' : 'omnichat_link_click_ticket');
      openInTTM(value);
    });
    return link;
  }

  function collectLinkFragments(text) {
    const fragments = [];
    let lastIndex = 0;
    let hasMatches = false;
    let match;

    const nlsRegex = /\b(\d{3}[\s]?\d{3}[\s]?\d{3}[\s]?\d{3})\b/g;
    while ((match = nlsRegex.exec(text)) !== null) {
      const matchedText = match[0];
      const cleanValue = matchedText.replace(/\s+/g, '');
      if (!/^[234]/.test(cleanValue)) continue;

      hasMatches = true;
      if (match.index > lastIndex) {
        fragments.push(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      fragments.push(createClickableLink(matchedText, cleanValue, 'nls'));
      lastIndex = match.index + matchedText.length;
    }

    if (!hasMatches) {
      const ticketRegex = /(?:задание|заявк[аиуе]|номер\s+задания)\s*(\d{7,10})\b/gi;
      while ((match = ticketRegex.exec(text)) !== null) {
        hasMatches = true;
        if (match.index > lastIndex) {
          fragments.push(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        fragments.push(createClickableLink(match[1], match[1]));
        lastIndex = match.index + match[0].length;
      }
    }

    if (!hasMatches) {
      const appealRegex = /обращение\s*№?\s*(\d{7,10})\b/gi;
      while ((match = appealRegex.exec(text)) !== null) {
        hasMatches = true;
        if (match.index > lastIndex) {
          fragments.push(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        fragments.push(createClickableLink(match[1], match[1]));
        lastIndex = match.index + match[0].length;
      }
    }

    if (!hasMatches) return null;

    if (lastIndex < text.length) {
      fragments.push(document.createTextNode(text.slice(lastIndex)));
    }
    return fragments;
  }

  function processTextNode(textNode) {
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return false;

    const parent = textNode.parentElement;
    if (!parent || !O.isInAllowedLinkRoot(parent)) return false;
    if (O.isExcludedFromLinkProcessing(parent)) return false;

    const text = textNode.textContent;
    if (!text || text.length < 9 || !/\d/.test(text)) return false;

    const fragments = collectLinkFragments(text);
    if (!fragments || fragments.length === 0) return false;

    const span = document.createElement('span');
    span.className = CSS.textWrapper;
    fragments.forEach((f) => span.appendChild(f));

    try {
      if (!textNode.parentNode) return false;
      textNode.parentNode.replaceChild(span, textNode);
      return true;
    } catch (e) {
      console.warn('[Omnichat] Ошибка замены текстового узла:', e);
      return false;
    }
  }

  O.processElementForLinks = function (element) {
    if (!element || !state.settings.omnichatTTMLinks || !O.isContextValid()) return;

    const roots = O.getLinkProcessingRoots();
    const root = roots.find((item) => item === element || item.contains(element));
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const nodeParent = node.parentElement;
        if (!nodeParent || !O.isInAllowedLinkRoot(nodeParent)) return NodeFilter.FILTER_REJECT;
        if (O.isExcludedFromLinkProcessing(nodeParent)) return NodeFilter.FILTER_REJECT;

        const tag = nodeParent.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'iframe', 'input', 'textarea'].includes(tag)) {
          return NodeFilter.FILTER_REJECT;
        }

        const nodeText = node.textContent;
        if (!nodeText || nodeText.length < 9 || !/\d/.test(nodeText)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((node) => processTextNode(node));
  };

  function stopLinkObservers() {
    state.ttmLinksObservers.forEach((observer) => observer.disconnect());
    state.ttmLinksObservers = [];
    state.observedLinkRoots = new WeakSet();
  }

  function startLinkObserver(root) {
    if (!root || state.observedLinkRoots.has(root)) return;

    state.observedLinkRoots.add(root);
    let debounceTimer = null;
    const pendingNodes = new Set();

    const observer = new MutationObserver((mutations) => {
      if (!state.settings.omnichatTTMLinks || !O.isContextValid()) return;

      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) pendingNodes.add(node);
        });
      }

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        pendingNodes.forEach((node) => {
          if (document.contains(node)) O.processElementForLinks(node);
        });
        pendingNodes.clear();
      }, 200);
    });

    observer.observe(root, { childList: true, subtree: true });
    state.ttmLinksObservers.push(observer);
  }

  function bindLinkObservers() {
    if (!O.isContextValid()) return;
    stopLinkObservers();
    const roots = O.getLinkProcessingRoots();
    roots.forEach((root) => {
      startLinkObserver(root);
      O.processElementForLinks(root);
    });
  }

  O.initTTMLinks = function () {
    if (!state.settings.omnichatTTMLinks) return;

    setTimeout(bindLinkObservers, 500);
    setTimeout(bindLinkObservers, 2000);

    if (state.linkRootsWatcher) return;

    state.linkRootsWatcher = new MutationObserver(() => {
      if (!state.settings.omnichatTTMLinks || !O.isContextValid()) return;
      bindLinkObservers();
    });
    state.linkRootsWatcher.observe(document.body, { childList: true, subtree: true });
  };

  O.disableTTMLinks = function () {
    stopLinkObservers();

    if (state.linkRootsWatcher) {
      state.linkRootsWatcher.disconnect();
      state.linkRootsWatcher = null;
    }

    document.querySelectorAll('.' + CSS.ttmLink).forEach((link) => {
      const text = document.createTextNode(link.textContent);
      const wrapper = link.closest('.' + CSS.textWrapper);
      if (wrapper) {
        wrapper.replaceWith(...wrapper.childNodes);
      } else {
        link.replaceWith(text);
      }
    });
  };
})(window.OmnichatExt);