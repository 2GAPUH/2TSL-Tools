// omnichat/state.js — общее состояние модуля
(function (O) {
  O.state = {
    isInitialized: false,
    isAdditionalTabActive: false,
    modalCloseObserver: null,
    groupFilterSelect: null,
    searchInput: null,
    searchInputHandler: null,
    currentSelectedGroup: '',
    isDarkTheme: false,
    currentLoadingId: 0,
    filterHost: null,
    searchHost: null,
    templatesOverlay: null,
    templatesGuardObserver: null,
    templatesGuardTimer: null,
    tabClasses: null,
    ttmLinksObservers: [],
    linkRootsWatcher: null,
    observedLinkRoots: new WeakSet(),
    contextInvalidated: false,
    scrollAppealsObserver: null,
    scrollAppealsHost: null,
    scrollAppealsBusy: false,
    scrollLastJumpKey: '',
    scrollLastJumpAt: 0,
    scrollJumpIndex: null,
    settings: {
      omnichatTemplates: true,
      ttmButton: true,
      omnichatTTMLinks: true,
      omnichatScrollToAppeal: true
    }
  };
})(window.OmnichatExt);