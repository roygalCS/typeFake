// Human typing simulator
(function() {
  'use strict';

  // Get random delay between min and max (inclusive)
  function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Get random character (for mistakes)
  function getRandomChar() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return chars[Math.floor(Math.random() * chars.length)];
  }

  // Dispatch keyboard event
  function dispatchKeyEvent(element, eventType, key, keyCode, charCode) {
    const event = new KeyboardEvent(eventType, {
      key: key,
      code: keyCode ? `Key${key.toUpperCase()}` : undefined,
      keyCode: keyCode,
      charCode: charCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      view: window
    });
    
    element.dispatchEvent(event);
  }

  // Dispatch input event
  function dispatchInputEvent(element) {
    const event = new Event('input', {
      bubbles: true,
      cancelable: true
    });
    element.dispatchEvent(event);
  }

  // Type a single character
  async function typeCharacter(element, char, isTextarea) {
    const key = char === '\n' ? 'Enter' : char;
    const keyCode = char === '\n' ? 13 : char.charCodeAt(0);
    
    // Keydown
    dispatchKeyEvent(element, 'keydown', key, keyCode, keyCode);
    
    // For Enter key, handle specially
    if (char === '\n') {
      if (isTextarea) {
        // Insert newline in textarea
        const start = element.selectionStart;
        const end = element.selectionEnd;
        const value = element.value;
        element.value = value.substring(0, start) + '\n' + value.substring(end);
        element.selectionStart = element.selectionEnd = start + 1;
        dispatchInputEvent(element);
      }
      dispatchKeyEvent(element, 'keypress', key, keyCode, keyCode);
      dispatchKeyEvent(element, 'keyup', key, keyCode, keyCode);
      return;
    }
    
    // Keypress
    dispatchKeyEvent(element, 'keypress', key, keyCode, keyCode);
    
    // Update value
    const start = element.selectionStart || 0;
    const end = element.selectionEnd || 0;
    const value = isTextarea ? element.value : element.textContent || '';
    
    if (isTextarea || element.tagName === 'INPUT') {
      element.value = value.substring(0, start) + char + value.substring(end);
      element.selectionStart = element.selectionEnd = start + 1;
    } else {
      element.textContent = value.substring(0, start) + char + value.substring(end);
      // Update selection for contenteditable
      const range = document.createRange();
      const sel = window.getSelection();
      range.setStart(element.childNodes[0] || element, start + 1);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    
    dispatchInputEvent(element);
    
    // Keyup
    dispatchKeyEvent(element, 'keyup', key, keyCode, keyCode);
  }

  // Backspace
  async function backspace(element, isTextarea) {
    const keyCode = 8;
    
    dispatchKeyEvent(element, 'keydown', 'Backspace', keyCode, keyCode);
    
    const start = element.selectionStart || 0;
    const end = element.selectionEnd || 0;
    
    if (start === 0 && end === 0) {
      dispatchKeyEvent(element, 'keyup', 'Backspace', keyCode, keyCode);
      return;
    }
    
    const value = isTextarea ? element.value : element.textContent || '';
    const newStart = Math.max(0, start - 1);
    
    if (isTextarea || element.tagName === 'INPUT') {
      element.value = value.substring(0, newStart) + value.substring(end);
      element.selectionStart = element.selectionEnd = newStart;
    } else {
      element.textContent = value.substring(0, newStart) + value.substring(end);
      const range = document.createRange();
      const sel = window.getSelection();
      range.setStart(element.childNodes[0] || element, newStart);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    
    dispatchInputEvent(element);
    dispatchKeyEvent(element, 'keyup', 'Backspace', keyCode, keyCode);
  }

  // Main typing function
  async function typeText(text) {
    // Find focused element
    const activeElement = document.activeElement;
    
    if (!activeElement) {
      console.error('No focused element found');
      return;
    }

    // Check if element is input/textarea or contenteditable
    const isInput = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';
    const isContentEditable = activeElement.contentEditable === 'true';
    
    if (!isInput && !isContentEditable) {
      console.error('Focused element is not an input, textarea, or contenteditable');
      return;
    }

    const isTextarea = activeElement.tagName === 'TEXTAREA' || isContentEditable;
    
    // Type each character
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      // Random delay between 60-150ms
      await new Promise(resolve => setTimeout(resolve, randomDelay(60, 150)));
      
      // 7-10% chance to make a mistake
      const mistakeChance = randomDelay(7, 10);
      const roll = Math.random() * 100;
      
      if (roll < mistakeChance && char !== '\n' && char !== ' ') {
        // Make a mistake: type wrong character
        const wrongChar = getRandomChar();
        await typeCharacter(activeElement, wrongChar, isTextarea);
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, randomDelay(100, 200)));
        
        // Backspace 1-3 times
        const backspaceCount = randomDelay(1, 3);
        for (let j = 0; j < backspaceCount; j++) {
          await new Promise(resolve => setTimeout(resolve, randomDelay(50, 100)));
          await backspace(activeElement, isTextarea);
        }
        
        // Type correct character
        await new Promise(resolve => setTimeout(resolve, randomDelay(50, 100)));
        await typeCharacter(activeElement, char, isTextarea);
      } else {
        // Type normally
        await typeCharacter(activeElement, char, isTextarea);
      }
    }
  }

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startTyping') {
      typeText(message.text).then(() => {
        sendResponse({ success: true });
      }).catch((error) => {
        console.error('Typing error:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep channel open for async response
    }
  });
})();
