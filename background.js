// background.js
// Service worker для Manifest V3

// Обработка сообщений от content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openForm') {
    chrome.tabs.create({ url: request.url }, (tab) => {
      console.log('Открыта форма в новой вкладке:', tab.id);
    });
    sendResponse({ success: true });
  }
  return true;
});

console.log('Omnichat Templates - Background Service Worker загружен');
