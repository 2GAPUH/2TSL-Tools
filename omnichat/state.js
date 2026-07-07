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
    tabClasses: null,
    ttmLinksObservers: [],
    linkRootsWatcher: null,
    observedLinkRoots: new WeakSet(),
    contextInvalidated: false,
    settings: {
      omnichatTemplates: true,
      ttmButton: true,
      omnichatTTMLinks: true
    }
  };
})(window.OmnichatExt);