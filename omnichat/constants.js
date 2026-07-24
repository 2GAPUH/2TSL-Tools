// omnichat/constants.js — селекторы и CSS-классы расширения
(function (O) {
  O.SELECTORS = {
    tabsGroup: '[data-testid="test-tabsgroup"]',
    wrapperTabs: '[data-testid="wrapper-tabs"]',
    modal: '[data-testid="modal"]',
    scrollBoxRoot: '#scroll-box-root',
    tabFavorites: '[data-testid="tab-favorites"]',
    tabAllTemplate: '[data-testid="tab-all-template"]',
    tabAdditional: '[data-testid="tab-additional"]',
    searchTemplate: '[data-testid="search-template"]',
    replyTemplate: '[data-testid="reply-template"]',
    replyTitle: '[data-testid="reply-title"]',
    collapsableText: '[data-testid="collapsable-text"]',
    iconContainer: '[data-testid="iconContainer"]',
    titleModal: '[data-testid="title-modal"]',
    appealPreview: '[data-testid="appeal-preview"]',
    chatMessage: '[data-messageid]',
    draftEditorContent: '.public-DraftEditor-content[contenteditable="true"]',
    // sc-* классы styled-components нестабильны (ломаются при обновлении Omnichat).
    // layout ищется структурно в getModalLayout() по data-testid.
    listElement: '[data-testid="list-element"]',
    modalSorting: '[data-testid="sorting"]',
    // Нижняя панель чата: кнопка «прокрутить вниз» + Закрыть/Передать
    actionsButton: '#Actions-button'
  };

  O.SIDEBAR_ACCOUNT_PANEL_TITLES = [
    'Вопрос по лицевому счету',
    'Лицевые счета'
  ];

  O.CSS = {
    nativeHidden: 'omnichat-ext-native-hidden',
    customTemplate: 'omnichat-custom-template',
    ttmLink: 'tsl-ttm-link',
    textWrapper: 'tsl-text-wrapper',
    scrollUpHost: 'omnichat-ext-scroll-up-host',
    scrollUpBtn: 'omnichat-ext-scroll-up-btn'
  };

  /** Текст системного баннера начала обращения (якорь прокрутки вверх). */
  O.APPEAL_CREATED_RE = /Обращение\s*[#№]?\s*\d+\s*создано/i;
})(window.OmnichatExt);