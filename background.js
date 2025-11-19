chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'typeText') {
    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        console.error('No active tab found');
        return;
      }

      const tabId = tabs[0].id;

      // Inject content script and execute typing
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }, () => {
        // After injection, send the text to content script
        chrome.tabs.sendMessage(tabId, {
          action: 'startTyping',
          text: message.text
        }).catch((error) => {
          console.error('Error sending message to content script:', error);
        });
      });
    });

    sendResponse({ success: true });
    return true;
  }
});
