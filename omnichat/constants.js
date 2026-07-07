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
    modalCategoriesCol: '.sc-frssml',
    modalSearchRow: '.sc-jBOuCM',
    modalSorting: '[data-testid="sorting"]'
  };

  O.SIDEBAR_ACCOUNT_PANEL_TITLES = [
    'Вопрос по лицевому счету',
    'Лицевые счета'
  ];

  O.CSS = {
    nativeHidden: 'omnichat-ext-native-hidden',
    customTemplate: 'omnichat-custom-template',
    ttmLink: 'tsl-ttm-link',
    textWrapper: 'tsl-text-wrapper'
  };
})(window.OmnichatExt);