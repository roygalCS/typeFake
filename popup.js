document.addEventListener('DOMContentLoaded', async () => {
  const textInput = document.getElementById('textInput');
  const typeOutBtn = document.getElementById('typeOutBtn');
  const status = document.getElementById('status');
  let isTyping = false;

  // Check if typing is in progress
  async function checkTypingStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            return window.__typeFakeIsTyping || false;
          }
        });
        return result[0]?.result || false;
      }
    } catch (error) {
      console.error('Error checking typing status:', error);
    }
    return false;
  }

  // Update button state
  async function updateButtonState() {
    isTyping = await checkTypingStatus();
    if (isTyping) {
      typeOutBtn.textContent = 'Stop Typing';
      typeOutBtn.classList.add('stop');
      status.textContent = 'Typing in progress...';
    } else {
      typeOutBtn.textContent = 'Start Typing';
      typeOutBtn.classList.remove('stop');
      status.textContent = '';
    }
  }

  // Initial check
  await updateButtonState();

  // Capture cursor position when popup opens
  let cursorInfo = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      cursorInfo = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Try to find the actual editable element (handles complex editors)
          let activeElement = document.activeElement;
          
          // Helper to find editable element
          function findEditable(elem) {
            if (!elem) return null;
            if (elem.tagName === 'INPUT' || elem.tagName === 'TEXTAREA' || 
                elem.contentEditable === 'true' || elem.isContentEditable) {
              return elem;
            }
            let current = elem;
            for (let i = 0; i < 15 && current; i++) {
              if (current.contentEditable === 'true' || current.isContentEditable) {
                return current;
              }
              current = current.parentElement;
            }
            return null;
          }
          
          // Try active element first
          let editable = findEditable(activeElement);
          
          // If not found, try common editor patterns
          if (!editable) {
            const codeMirror = document.querySelector('.CodeMirror-textarea, .CodeMirror textarea');
            if (codeMirror) editable = codeMirror;
          }
          
          if (!editable) {
            const monaco = document.querySelector('.monaco-editor textarea, .monaco-editor .inputarea');
            if (monaco) editable = monaco;
          }
          
          if (!editable) {
            const ace = document.querySelector('.ace_text-input');
            if (ace) editable = ace;
          }
          
          // Last resort: find any visible textarea or input
          if (!editable) {
            const inputs = document.querySelectorAll('textarea, input[type="text"], input:not([type]), [contenteditable="true"]');
            for (const input of inputs) {
              const rect = input.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                editable = input;
                break;
              }
            }
          }
          
          if (!editable) return null;
          
          const isInput = editable.tagName === 'INPUT' || editable.tagName === 'TEXTAREA';
          const isContentEditable = editable.contentEditable === 'true' || editable.isContentEditable;
          
          if (isInput) {
            return {
              type: 'input',
              selectionStart: editable.selectionStart || 0,
              selectionEnd: editable.selectionEnd || 0
            };
          } else if (isContentEditable) {
            const sel = window.getSelection();
            if (sel.rangeCount > 0) {
              const range = sel.getRangeAt(0);
              // Calculate text offset from start of element
              const walker = document.createTreeWalker(
                editable,
                NodeFilter.SHOW_TEXT,
                null
              );
              let textOffset = 0;
              let node = walker.nextNode();
              while (node && node !== range.startContainer) {
                textOffset += node.textContent.length;
                node = walker.nextNode();
              }
              if (node === range.startContainer) {
                textOffset += range.startOffset;
              }
              
              return {
                type: 'contenteditable',
                textOffset: textOffset,
                collapsed: range.collapsed
              };
            }
          }
          return null;
        }
      });
      if (cursorInfo && cursorInfo[0]) {
        cursorInfo = cursorInfo[0].result;
      }
    }
  } catch (error) {
    console.error('Error capturing cursor:', error);
  }

  typeOutBtn.addEventListener('click', async () => {
    if (isTyping) {
      // Stop typing
      try {
        await chrome.runtime.sendMessage({
          action: 'stopTyping'
        });
        status.textContent = 'Stopping...';
        isTyping = false; // Update local state immediately
        typeOutBtn.textContent = 'Start Typing';
        typeOutBtn.classList.remove('stop');
        setTimeout(() => {
          updateButtonState();
          status.textContent = '';
        }, 200);
      } catch (error) {
        console.error('Error stopping:', error);
      }
    } else {
      // Start typing - try clipboard first, then textarea
      let text = textInput.value;
      
      // Try to read from clipboard if textarea is empty
      if (!text || text.trim().length === 0) {
        try {
          const clipboardText = await navigator.clipboard.readText();
          if (clipboardText && clipboardText.trim().length > 0) {
            text = clipboardText;
            textInput.value = text; // Update textarea with clipboard content
          }
        } catch (error) {
          console.error('Error reading clipboard:', error);
        }
      }
      
      if (!text || text.trim().length === 0) {
        alert('Please enter some text to type or copy text to clipboard.');
        return;
      }

      try {
        // Update UI immediately
        isTyping = true;
        typeOutBtn.textContent = 'Stop Typing';
        typeOutBtn.classList.add('stop');
        status.textContent = 'Starting...';
        
        // Send message to background script with cursor info
        await chrome.runtime.sendMessage({
          action: 'typeText',
          text: text,
          cursorInfo: cursorInfo
        });
        
        status.textContent = 'Click where you want typing to start...';
        
        // Listen for typing status updates
        const statusListener = (message) => {
          if (message.action === 'typingStarted') {
            status.textContent = 'Typing in progress...';
          } else if (message.action === 'typingComplete') {
            isTyping = false;
            typeOutBtn.textContent = 'Start Typing';
            typeOutBtn.classList.remove('stop');
            status.textContent = 'Typing complete!';
            chrome.runtime.onMessage.removeListener(statusListener);
            
            // Clear status after 2 seconds
            setTimeout(() => {
              status.textContent = '';
            }, 2000);
          }
        };
        
        chrome.runtime.onMessage.addListener(statusListener);
        
        // Don't close popup - keep it open so user can stop
      } catch (error) {
        console.error('Error sending message:', error);
        alert('Error: Could not send text to active tab.');
        // Reset UI on error
        isTyping = false;
        typeOutBtn.textContent = 'Start Typing';
        typeOutBtn.classList.remove('stop');
        status.textContent = '';
      }
    }
  });
});
