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

      // Inject content script into main page and all frames
      chrome.scripting.executeScript({
        target: { tabId: tabId, allFrames: true },
        files: ['content.js']
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error('Injection error:', chrome.runtime.lastError);
          safeSendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        
        // Wait a bit for script to initialize and cleanup, then send message to all frames
        setTimeout(() => {
          // Inject function to start typing in all frames (since sendMessage only goes to main frame)
          chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            func: (text, cursorInfo) => {
              // Trigger typing in this frame's context
              if (window.__typeFakeMessageListener) {
                const mockMessage = {
                  action: 'startTyping',
                  text: text,
                  cursorInfo: cursorInfo
                };
                const mockSender = {};
                let responseSent = false;
                const mockSendResponse = (response) => {
                  if (!responseSent) {
                    responseSent = true;
                    // Send response back to background
                    chrome.runtime.sendMessage({ 
                      action: 'typingResponse', 
                      success: response.success,
                      error: response.error 
                    }).catch(() => {});
                  }
                };
                window.__typeFakeMessageListener(mockMessage, mockSender, mockSendResponse);
              }
            },
            args: [message.text, message.cursorInfo]
          }).then(() => {
            safeSendResponse({ success: true });
          }).catch((error) => {
            // Also try regular sendMessage as fallback
            chrome.tabs.sendMessage(tabId, {
              action: 'startTyping',
              text: message.text,
              cursorInfo: message.cursorInfo
            }).then(() => {
              safeSendResponse({ success: true });
            }).catch((sendError) => {
              if (!sendError.message || !sendError.message.includes("Could not establish connection")) {
                console.error('Error sending message to content script:', sendError);
              }
              safeSendResponse({ success: false, error: sendError.message });
            });
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
