// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      // dataUrl is base64 encoded image
      const base64Data = dataUrl ? dataUrl.split(',')[1] : null;
      sendResponse({ screenshot: base64Data });
    });
    return true; // Keep message channel open for async response
  }
});
