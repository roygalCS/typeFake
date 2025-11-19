chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Helper to safely call sendResponse
  let responded = false;
  const safeSendResponse = (response) => {
    if (!responded) {
      responded = true;
      try {
        sendResponse(response);
      } catch (error) {
        console.error('Error sending response:', error);
      }
    }
  };

  if (message.action === 'typeText') {
    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        console.error('No active tab found');
        safeSendResponse({ success: false, error: 'No active tab found' });
        return;
      }

      const tabId = tabs[0].id;

      // First, try to stop any existing typing
      chrome.tabs.sendMessage(tabId, {
        action: 'stopTyping'
      }).catch(() => {
        // Ignore errors - script might not be loaded yet
      });

      // Inject content script and execute typing
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error('Injection error:', chrome.runtime.lastError);
          safeSendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        
        // Wait a bit for script to initialize and cleanup, then send message
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, {
            action: 'startTyping',
            text: message.text,
            cursorInfo: message.cursorInfo
          }).then(() => {
            safeSendResponse({ success: true });
          }).catch((error) => {
            // Only log if it's not a "receiving end doesn't exist" error (which is expected sometimes)
            if (!error.message || !error.message.includes("Could not establish connection")) {
              console.error('Error sending message to content script:', error);
            }
            safeSendResponse({ success: false, error: error.message });
          });
        }, 200); // Longer delay to ensure cleanup
      });
    });

    return true; // Keep channel open for async response
  } else if (message.action === 'typingStarted' || message.action === 'typingComplete') {
    // Forward status messages to popup if it's open
    chrome.runtime.sendMessage({ action: message.action }).catch(() => {});
    sendResponse({ success: true });
    return true;
  } else if (message.action === 'stopTyping') {
    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        safeSendResponse({ success: false, error: 'No active tab found' });
        return;
      }

      const tabId = tabs[0].id;
      
      // Send stop message
      chrome.tabs.sendMessage(tabId, {
        action: 'stopTyping'
      }).then(() => {
        safeSendResponse({ success: true });
      }).catch((error) => {
        // Only log if it's not a "receiving end doesn't exist" error
        if (!error.message || !error.message.includes("Could not establish connection")) {
          console.error('Error sending stop message:', error);
        }
        safeSendResponse({ success: false, error: error.message });
      });
    });

    return true; // Keep channel open for async response
  }
});
