// Human typing simulator
(function() {
  'use strict';

  // Prevent multiple instances - if already loaded, remove old listener and reinitialize
  if (window.__typeFakeLoaded) {
    // Remove old message listener if it exists
    if (window.__typeFakeMessageListener) {
      chrome.runtime.onMessage.removeListener(window.__typeFakeMessageListener);
    }
  }

  // Global flag to track typing state
  window.__typeFakeIsTyping = false;
  window.__typeFakeStopFlag = false;
  window.__typeFakeLoaded = true;
  window.__typeFakeCurrentSession = null; // Track current typing session

  // Get random delay between min and max (inclusive)
function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

  // Get random character (for mistakes)
  function getRandomChar() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return chars[Math.floor(Math.random() * chars.length)];
}

  // Find the actual editable element (handles nested contenteditable, hidden textareas, etc.)
  function findEditableElement(element) {
    if (!element) return null;
    
    // Check if element itself is editable
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || 
        element.contentEditable === 'true' || element.isContentEditable) {
      return element;
    }
    
    // Check parent elements (up to 15 levels for deeply nested structures)
    let current = element;
    for (let i = 0; i < 15 && current; i++) {
      if (current.contentEditable === 'true' || current.isContentEditable) {
        return current;
      }
      current = current.parentElement;
    }
    
    return null;
  }

  // Find editable element using various strategies (for complex editors like CodeMirror, Monaco, etc.)
  function findEditableElementAdvanced() {
    // Strategy 1: Check active element
    let activeElement = document.activeElement;
    if (activeElement) {
      const editable = findEditableElement(activeElement);
      if (editable) return editable;
    }

    // Strategy 2: Look for common editor patterns
    // CodeMirror uses .CodeMirror-textarea
    const codeMirrorTextarea = document.querySelector('.CodeMirror-textarea, .CodeMirror textarea');
    if (codeMirrorTextarea) {
      return codeMirrorTextarea;
    }

    // Monaco Editor uses .monaco-editor textarea (can be hidden)
    const monacoTextarea = document.querySelector('.monaco-editor textarea, .monaco-editor .inputarea, textarea.monaco-mouse-cursor-text');
    if (monacoTextarea) {
      return monacoTextarea;
    }
    
    // Also check for Monaco editor container and find textarea within
    const monacoEditor = document.querySelector('.monaco-editor, [class*="monaco"]');
    if (monacoEditor) {
      const textarea = monacoEditor.querySelector('textarea');
      if (textarea) return textarea;
      // Monaco sometimes uses contenteditable divs
      const contentEditable = monacoEditor.querySelector('[contenteditable="true"]');
      if (contentEditable) return contentEditable;
    }

    // Ace Editor
    const aceTextarea = document.querySelector('.ace_text-input');
    if (aceTextarea) {
      return aceTextarea;
    }

    // Strategy 3: Look for any visible or hidden textarea/input in the viewport
    const allInputs = document.querySelectorAll('input[type="text"], input:not([type]), textarea, [contenteditable="true"]');
    for (const input of allInputs) {
      // Check if it's visible or commonly used by editors (even if hidden)
      const style = window.getComputedStyle(input);
      const rect = input.getBoundingClientRect();
      
      // Accept if visible, or if it's a textarea (many editors use hidden textareas)
      if (input.tagName === 'TEXTAREA' || 
          input.tagName === 'INPUT' ||
          input.contentEditable === 'true' ||
          input.isContentEditable) {
        // Check if it's in viewport or commonly used by editors
        if (rect.width > 0 && rect.height > 0) {
          return input;
        }
        // Even if hidden, if it's a textarea, it might be the editor's hidden input
        if (input.tagName === 'TEXTAREA' && input.offsetParent !== null) {
          return input;
        }
      }
    }

    // Strategy 4: Look for contenteditable elements
    const contentEditables = document.querySelectorAll('[contenteditable="true"]');
    for (const elem of contentEditables) {
      const rect = elem.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return elem;
      }
    }

    // Strategy 5: Look for elements with role="textbox" or role="textbox"
    const textboxes = document.querySelectorAll('[role="textbox"], [role="combobox"]');
    for (const textbox of textboxes) {
      if (textbox.contentEditable === 'true' || textbox.isContentEditable) {
        return textbox;
      }
      // Also check if it contains an input
      const innerInput = textbox.querySelector('input, textarea');
      if (innerInput) {
        return innerInput;
      }
    }

    // Strategy 6: Look for Zybooks-specific patterns (common class names)
    const zybooksPatterns = [
      '.code-input',
      '.editor-input',
      '.text-editor',
      '[data-editor]',
      '.ace_editor',
      '.CodeMirror'
    ];
    
    for (const pattern of zybooksPatterns) {
      try {
        const element = document.querySelector(pattern);
        if (element) {
          // Find input/textarea within
          const input = element.querySelector('input, textarea, [contenteditable="true"]');
          if (input) {
            return input;
          }
          // Or check if element itself is editable
          if (element.contentEditable === 'true' || element.isContentEditable) {
            return element;
          }
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }

    return null;
  }

  // Dispatch keyboard event with better compatibility (Arc & MacBook)
  function dispatchKeyEvent(element, eventType, key, keyCode, charCode) {
    // MacBook and Arc compatibility - ensure proper key codes
    let code = undefined;
    if (key.length === 1 && keyCode) {
      const upperKey = key.toUpperCase();
      if (upperKey >= 'A' && upperKey <= 'Z') {
        code = `Key${upperKey}`;
      } else if (upperKey >= '0' && upperKey <= '9') {
        code = `Digit${upperKey}`;
      }
    }
    
    const eventInit = {
    key: key,
    code: code,
    keyCode: keyCode,
      charCode: charCode,
      which: keyCode,
    bubbles: true,
    cancelable: true,
      view: window,
      // MacBook specific - ensure proper modifiers
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false
    };
    
    try {
      const event = new KeyboardEvent(eventType, eventInit);
      element.dispatchEvent(event);
    } catch (e) {
      // Fallback for older browsers
      const oldEvent = document.createEvent('KeyboardEvent');
      if (oldEvent.initKeyboardEvent) {
        oldEvent.initKeyboardEvent(eventType, true, true, window, key, 0, '', false, '');
        element.dispatchEvent(oldEvent);
      }
    }
  }
  
  // Dispatch input event
  function dispatchInputEvent(element) {
    const events = ['input', 'textInput', 'beforeinput'];
    events.forEach(eventType => {
      const event = new Event(eventType, {
    bubbles: true,
        cancelable: true
      });
      element.dispatchEvent(event);
    });
  }

  // Insert text at cursor for contenteditable (handles complex structures)
  function insertTextAtCursor(text, element) {
    // Use the element's document's selection API
    const elementDoc = element.ownerDocument;
    const elementWindow = elementDoc.defaultView;
    const sel = elementWindow.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = elementDoc.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // Type a single character (handles tabs, newlines, and special chars)
  async function typeCharacter(element, char, isContentEditable) {
    const isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
    
    // Handle special characters
      if (char === '\n') {
      // Newline/Enter
      const key = 'Enter';
      const keyCode = 13;
      
      dispatchKeyEvent(element, 'keydown', key, keyCode, keyCode);
      
      if (isInput) {
        const start = element.selectionStart || 0;
        const end = element.selectionEnd || 0;
        element.value = element.value.substring(0, start) + '\n' + element.value.substring(end);
        element.selectionStart = element.selectionEnd = start + 1;
        dispatchInputEvent(element);
      } else if (isContentEditable) {
        insertTextAtCursor('\n', element);
        dispatchInputEvent(element);
      }
      dispatchKeyEvent(element, 'keypress', key, keyCode, keyCode);
      dispatchKeyEvent(element, 'keyup', key, keyCode, keyCode);
      return;
    } else if (char === '\t') {
      // Tab character
      const key = 'Tab';
      const keyCode = 9;
      
      dispatchKeyEvent(element, 'keydown', key, keyCode, keyCode);
      
      if (isInput) {
        const start = element.selectionStart || 0;
        const end = element.selectionEnd || 0;
        // Insert tab (usually 2 or 4 spaces, but we'll use actual tab)
        element.value = element.value.substring(0, start) + '\t' + element.value.substring(end);
        element.selectionStart = element.selectionEnd = start + 1;
        dispatchInputEvent(element);
      } else if (isContentEditable) {
        insertTextAtCursor('\t', element);
        dispatchInputEvent(element);
      }
      dispatchKeyEvent(element, 'keypress', key, keyCode, keyCode);
      dispatchKeyEvent(element, 'keyup', key, keyCode, keyCode);
      return;
    }
    
    // Regular character
    const key = char;
    const keyCode = char.charCodeAt(0);
    
    // Get current value/position before inserting
    let valueBefore = '';
    let start = 0;
    if (isInput) {
      valueBefore = element.value || '';
      start = element.selectionStart || 0;
      const end = element.selectionEnd || 0;
      
      // Insert character
      element.value = valueBefore.substring(0, start) + char + valueBefore.substring(end);
      element.selectionStart = element.selectionEnd = start + 1;
      } else if (isContentEditable) {
        // For contenteditable, use selection API
        insertTextAtCursor(char, element);
      }
    
    // Dispatch events - but prevent them from inserting again
    const keydownEvent = new KeyboardEvent('keydown', {
      key: key,
      keyCode: keyCode,
      charCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      view: window
    });
    keydownEvent.preventDefault(); // Prevent default insertion
    element.dispatchEvent(keydownEvent);
    
    const keypressEvent = new KeyboardEvent('keypress', {
      key: key,
      keyCode: keyCode,
      charCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      view: window
    });
    keypressEvent.preventDefault(); // Prevent default insertion
    element.dispatchEvent(keypressEvent);
    
    // Input event (this is what sites listen to)
    dispatchInputEvent(element);
    
    const keyupEvent = new KeyboardEvent('keyup', {
      key: key,
      keyCode: keyCode,
      charCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      view: window
    });
    element.dispatchEvent(keyupEvent);
  }

  // Move cursor left with arrow key
  async function moveCursorLeft(element, isContentEditable) {
    const keyCode = 37; // Left arrow
    const isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
    const elementWindow = element.ownerDocument.defaultView;
    
    dispatchKeyEvent(element, 'keydown', 'ArrowLeft', keyCode, keyCode);
    
    if (isInput) {
      const start = element.selectionStart || 0;
      if (start > 0) {
        element.selectionStart = element.selectionEnd = start - 1;
      }
    } else if (isContentEditable) {
      const sel = elementWindow.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.collapse(true);
        // Move selection left
        const newRange = range.cloneRange();
        newRange.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    }
    
    dispatchKeyEvent(element, 'keyup', 'ArrowLeft', keyCode, keyCode);
  }

  // Move cursor right with arrow key
  async function moveCursorRight(element, isContentEditable) {
    const keyCode = 39; // Right arrow
    const isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
    const elementWindow = element.ownerDocument.defaultView;
    
    dispatchKeyEvent(element, 'keydown', 'ArrowRight', keyCode, keyCode);
    
    if (isInput) {
      const start = element.selectionStart || 0;
      const end = element.selectionEnd || 0;
      const value = element.value || '';
      if (end < value.length) {
        element.selectionStart = element.selectionEnd = end + 1;
      }
    } else if (isContentEditable) {
      const sel = elementWindow.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.collapse(false);
        // Move selection right
        const newRange = range.cloneRange();
        try {
          newRange.setStart(range.endContainer, Math.min(
            range.endContainer.textContent?.length || 0,
            range.endOffset + 1
          ));
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
        } catch (e) {
          // Fallback: just move to end
          range.collapse(false);
        }
      }
    }
    
    dispatchKeyEvent(element, 'keyup', 'ArrowRight', keyCode, keyCode);
  }

  // Backspace
  async function backspace(element, isContentEditable) {
    const keyCode = 8;
    const isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
    
    dispatchKeyEvent(element, 'keydown', 'Backspace', keyCode, keyCode);
    
    if (isInput) {
      const start = element.selectionStart || 0;
      const end = element.selectionEnd || 0;
      
      if (start === 0 && end === 0) {
        dispatchKeyEvent(element, 'keyup', 'Backspace', keyCode, keyCode);
        return;
      }

      const newStart = Math.max(0, start - 1);
      element.value = element.value.substring(0, newStart) + element.value.substring(end);
      element.selectionStart = element.selectionEnd = newStart;
    } else if (isContentEditable) {
      const elementWindow = element.ownerDocument.defaultView;
      const sel = elementWindow.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (range.collapsed) {
          // Cursor is collapsed, delete previous character
          range.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
        }
        range.deleteContents();
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    
    dispatchInputEvent(element);
    dispatchKeyEvent(element, 'keyup', 'Backspace', keyCode, keyCode);
  }

  // Restore cursor position
  function restoreCursorPosition(element, cursorInfo) {
    if (!cursorInfo) return false;
    
    const isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
    const isContentEditable = element.contentEditable === 'true' || element.isContentEditable;
    
    if (cursorInfo.type === 'input' && isInput) {
      element.focus();
      element.setSelectionRange(cursorInfo.selectionStart, cursorInfo.selectionEnd);
      return true;
    } else if (cursorInfo.type === 'contenteditable' && isContentEditable) {
      element.focus();
      const sel = window.getSelection();
      
      try {
        if (cursorInfo.textOffset !== undefined) {
          // Restore using text offset
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null
          );
          let textNode = walker.nextNode();
          let offset = 0;
          
          // Find the text node containing the cursor position
          while (textNode && offset + textNode.textContent.length < cursorInfo.textOffset) {
            offset += textNode.textContent.length;
            textNode = walker.nextNode();
          }
          
          if (textNode) {
            const nodeOffset = Math.min(
              cursorInfo.textOffset - offset,
              textNode.textContent.length
            );
            const range = document.createRange();
            range.setStart(textNode, nodeOffset);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return true;
          }
        }
      } catch (e) {
        // Fallback: set cursor to end if restoration fails
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      return true;
    }
    return false;
  }

  // Main typing function
  async function typeText(text, cursorInfo, sessionId, providedElement = null) {
    // Check if this session is still active
    if (sessionId && window.__typeFakeCurrentSession !== sessionId) {
      return; // This session was cancelled
    }
    
    // Use provided element if available, otherwise find it
    let activeElement = providedElement;
    
    if (!activeElement) {
      // Find focused element - try multiple methods
      activeElement = document.activeElement;
      
      // If no active element or it's not editable, try to find editable element
      if (!activeElement || 
          (activeElement.tagName !== 'INPUT' && 
           activeElement.tagName !== 'TEXTAREA' && 
           activeElement.contentEditable !== 'true' && 
           !activeElement.isContentEditable)) {
        
        // Try to find editable element from current element
        activeElement = findEditableElement(activeElement);
        
        // If still nothing, use advanced search
        if (!activeElement) {
          activeElement = findEditableElementAdvanced();
        }
        
        // If we found something, focus it
        if (activeElement) {
          activeElement.focus();
          // Small delay to ensure focus is set
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } else {
      // Ensure provided element is focused
      activeElement.focus();
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    if (!activeElement) {
      console.error('No editable element found. Make sure you click inside an input field first.');
      throw new Error('Could not find an editable field. Please click inside the text input area first.');
    }

    // Ensure element is focused - use the element's document context
    const elementDoc = activeElement.ownerDocument;
    const elementWindow = elementDoc.defaultView;
    
    if (activeElement !== elementDoc.activeElement) {
      activeElement.focus();
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Double-check that element is actually editable
    const isInput = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';
    const isContentEditable = activeElement.contentEditable === 'true' || activeElement.isContentEditable;
    
    // Special case: Monaco editor textareas can be hidden but still functional
    const isMonacoTextarea = activeElement.tagName === 'TEXTAREA' && 
      (activeElement.classList.contains('monaco-mouse-cursor-text') || 
       activeElement.closest('.monaco-editor') !== null);
    
    if (!isInput && !isContentEditable && !isMonacoTextarea) {
      // Last resort: try to find ANY editable element in the element's document context
      const elementDoc = activeElement.ownerDocument;
      const elementWindow = elementDoc.defaultView;
      
      // Search in the element's document (important for iframes)
      let fallback = null;
      
      // Try Monaco editor patterns in this document
      const monaco = elementDoc.querySelector('.monaco-editor textarea, .monaco-editor .inputarea, textarea.monaco-mouse-cursor-text');
      if (monaco) {
        fallback = monaco;
      } else {
        const monacoContainer = elementDoc.querySelector('.monaco-editor, [class*="monaco"]');
        if (monacoContainer) {
          const textarea = monacoContainer.querySelector('textarea');
          if (textarea) fallback = textarea;
          else {
            const contentEditable = monacoContainer.querySelector('[contenteditable="true"]');
            if (contentEditable) fallback = contentEditable;
          }
        }
      }
      
      // If still nothing, try general search in element's document
      if (!fallback) {
        fallback = elementDoc.querySelector('input[type="text"], input:not([type]), textarea, [contenteditable="true"]');
      }
      
      if (fallback && (fallback.tagName === 'INPUT' || fallback.tagName === 'TEXTAREA' || 
          fallback.contentEditable === 'true' || fallback.isContentEditable)) {
        console.log('typeFake: Using fallback element:', fallback.tagName, fallback.className);
        activeElement = fallback;
        activeElement.focus();
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        console.error('typeFake: Element is not editable:', activeElement);
        console.error('typeFake: Element details:', {
          tagName: activeElement.tagName,
          contentEditable: activeElement.contentEditable,
          isContentEditable: activeElement.isContentEditable,
          className: activeElement.className,
          id: activeElement.id,
          isMonaco: isMonacoTextarea,
          document: activeElement.ownerDocument === document ? 'main' : 'iframe'
        });
        alert('Could not find an editable field. The page might use a custom editor. Try clicking directly in the text input area.');
        return;
      }
    }

    // Restore cursor position if we have it
    if (cursorInfo) {
      restoreCursorPosition(activeElement, cursorInfo);
      // Small delay to ensure cursor is restored
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Set typing flag
    window.__typeFakeIsTyping = true;
    window.__typeFakeStopFlag = false;

    // Track mistake positions for delayed correction
    const mistakes = [];

    try {
      // Type each character
      for (let i = 0; i < text.length; i++) {
        // Check if this session is still active
        if (sessionId && window.__typeFakeCurrentSession !== sessionId) {
          console.log('Typing session cancelled');
          break;
        }
        
        // Check stop flag
        if (window.__typeFakeStopFlag) {
          console.log('Typing stopped by user');
          break;
        }
        
        const char = text[i];
        
        // Re-check focus in case it was lost - use element's document
        const elementDoc = activeElement.ownerDocument;
        if (elementDoc.activeElement !== activeElement) {
          activeElement.focus();
        }
        
        // Random delay between 60-150ms
        await new Promise(resolve => setTimeout(resolve, randomDelay(60, 150)));
        
        // Check stop flag again after delay
        if (window.__typeFakeStopFlag) {
          console.log('Typing stopped by user');
          break;
        }
        
        // Check if we need to correct a previous mistake (2-3 characters after)
        // Only correct if we haven't typed the current character yet
        if (mistakes.length > 0 && i > 0) {
          const uncorrectedMistakes = mistakes.filter(m => !m.corrected);
          if (uncorrectedMistakes.length > 0) {
            const lastMistake = uncorrectedMistakes[uncorrectedMistakes.length - 1];
            const charsSinceMistake = i - lastMistake.position;
            
            // Correct mistake after 2-3 characters
            if (charsSinceMistake >= 2 && charsSinceMistake <= 3) {
              const isInput = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';
              
              // Simple correction: move back, fix, move forward
              const charsToMoveBack = charsSinceMistake;
              
              // Move cursor back (quickly)
              for (let move = 0; move < charsToMoveBack; move++) {
                await new Promise(resolve => setTimeout(resolve, 8));
                if (isInput) {
                  const start = activeElement.selectionStart || 0;
                  if (start > 0) {
                    activeElement.selectionStart = activeElement.selectionEnd = start - 1;
                  }
                } else {
                  await moveCursorLeft(activeElement, isContentEditable);
                }
                if (window.__typeFakeStopFlag) break;
              }
              
              if (window.__typeFakeStopFlag) break;
              
              await new Promise(resolve => setTimeout(resolve, 25));
              
              // Backspace wrong char
              await backspace(activeElement, isContentEditable);
              await new Promise(resolve => setTimeout(resolve, 20));
              
              // Type correct char
              await typeCharacter(activeElement, lastMistake.correctChar, isContentEditable);
              await new Promise(resolve => setTimeout(resolve, 25));
              
              // Move forward
              for (let move = 0; move < charsToMoveBack; move++) {
                await new Promise(resolve => setTimeout(resolve, 8));
                if (isInput) {
                  const start = activeElement.selectionStart || 0;
                  const end = activeElement.selectionEnd || 0;
                  const value = activeElement.value || '';
                  if (end < value.length) {
                    activeElement.selectionStart = activeElement.selectionEnd = end + 1;
                  }
                } else {
                  await moveCursorRight(activeElement, isContentEditable);
                }
                if (window.__typeFakeStopFlag) break;
              }
              
              lastMistake.corrected = true;
              await new Promise(resolve => setTimeout(resolve, 25));
            }
          }
        }
        
        // Type the character - temporarily disable mistakes to fix the core issue
        await typeCharacter(activeElement, char, isContentEditable);
        
        // TODO: Re-enable mistake correction once basic typing is stable
        /*
        // 7-10% chance to make a mistake (but not for tabs, newlines, spaces, or punctuation)
        const mistakeChance = randomDelay(7, 10);
        const roll = Math.random() * 100;
        
        // Don't make mistakes on punctuation or special chars
        const isPunctuation = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(char);
        
        if (roll < mistakeChance && char !== '\n' && char !== ' ' && char !== '\t' && !isPunctuation) {
          // Make a mistake: type wrong character
          const wrongChar = getRandomChar();
          await typeCharacter(activeElement, wrongChar, isContentEditable);
          
          // Record the mistake for later correction
          mistakes.push({
            position: i,
            wrongChar: wrongChar,
            correctChar: char,
            corrected: false
          });
        } else {
          // Type normally
          await typeCharacter(activeElement, char, isContentEditable);
        }
        */
      }
    } finally {
      // Reset flags only if this is still the active session
      if (!sessionId || window.__typeFakeCurrentSession === sessionId) {
        window.__typeFakeIsTyping = false;
        window.__typeFakeStopFlag = false;
        // Don't clear session ID here - let it be cleared by new session or stop command
      }
    }
  }

  // Wait for ":" trigger to start typing (optional - can be skipped)
  function waitForColonTrigger(text, cursorInfo, skipWait = false) {
    return new Promise((resolve) => {
      // If skipWait is true, start immediately
      if (skipWait) {
        resolve();
        return;
      }
      
      let colonFound = false;
      
      const keydownHandler = (e) => {
        // Check if ":" was typed (keyCode 186 with shift, or key === ':')
        if (e.key === ':' || (e.keyCode === 186 && e.shiftKey)) {
          colonFound = true;
          
          // Prevent the colon from being typed
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          // Remove listener and start typing
          document.removeEventListener('keydown', keydownHandler, true);
          resolve();
        }
      };
      
      // Add listener with capture to catch it early
      document.addEventListener('keydown', keydownHandler, true);
      
      // Timeout after 5 seconds if no colon found - start anyway
      setTimeout(() => {
        if (!colonFound) {
          document.removeEventListener('keydown', keydownHandler, true);
          resolve(); // Start anyway if timeout
        }
      }, 5000);
    });
}

  // Wait for user to click where they want typing to start
  function waitForClickPosition() {
    return new Promise((resolve) => {
      let clicked = false;
      let clickTarget = null;
      let clickTime = null;
      
      const clickHandler = (e) => {
        if (clicked) return;
        
        // Store click info
        clickTarget = e.target;
        clickTime = Date.now();
        clicked = true;
        
        console.log('typeFake: Click detected on', clickTarget.tagName, clickTarget.className);
        
        // Remove listener immediately to prevent multiple clicks
        document.removeEventListener('click', clickHandler, true);
        document.body.removeEventListener('click', clickHandler, true);
        
        // Wait and retry finding editable element (Zybooks may need time to initialize)
        const findEditableWithRetry = (attempts = 0) => {
          if (attempts > 10) {
            // After 10 attempts (2 seconds), give up
            console.error('typeFake: Could not find editable element after click after', attempts, 'attempts');
            console.log('typeFake: Clicked element:', clickTarget);
            console.log('typeFake: Clicked element parent:', clickTarget.parentElement);
            resolve({ element: null, cursorInfo: null });
            return;
          }
          
          if (attempts > 0) {
            console.log('typeFake: Retry attempt', attempts, 'to find editable element');
          }
          
          // Try to find editable element
          let editableElement = findEditableElement(clickTarget);
          
          // If not found, try searching from click position up the DOM tree more thoroughly
          if (!editableElement) {
            let current = clickTarget;
            for (let i = 0; i < 20 && current; i++) {
              // Check if element or any child is editable
              if (current.contentEditable === 'true' || current.isContentEditable) {
                editableElement = current;
                break;
              }
              // Check for input/textarea in children
              const childInput = current.querySelector && current.querySelector('input, textarea');
              if (childInput) {
                editableElement = childInput;
                break;
              }
              current = current.parentElement;
            }
          }
          
          // Try advanced search
          if (!editableElement) {
            editableElement = findEditableElementAdvanced();
          }
          
          // Check iframes (Zybooks uses Coding Rooms in iframes)
          if (!editableElement) {
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
              try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc) {
                  // Check if click was inside this iframe
                  const iframeRect = iframe.getBoundingClientRect();
                  const clickWasInIframe = clickTarget && 
                    clickTarget.getBoundingClientRect &&
                    clickTarget.getBoundingClientRect().top >= iframeRect.top &&
                    clickTarget.getBoundingClientRect().left >= iframeRect.left &&
                    clickTarget.getBoundingClientRect().bottom <= iframeRect.bottom &&
                    clickTarget.getBoundingClientRect().right <= iframeRect.right;
                  
                  // Look for editable elements in iframe
                  let iframeEditable = iframeDoc.querySelector('input, textarea, [contenteditable="true"]');
                  
                  // If not found, try Coding Rooms specific patterns
                  if (!iframeEditable) {
                    // Coding Rooms uses Monaco editor - search more aggressively
                    const monaco = iframeDoc.querySelector('.monaco-editor textarea, .monaco-editor .inputarea, textarea.monaco-mouse-cursor-text, .monaco-editor [contenteditable="true"]');
                    if (monaco) {
                      iframeEditable = monaco;
                    } else {
                      // Try finding Monaco container first
                      const monacoContainer = iframeDoc.querySelector('.monaco-editor, [class*="monaco"]');
                      if (monacoContainer) {
                        const textarea = monacoContainer.querySelector('textarea');
                        if (textarea) iframeEditable = textarea;
                        else {
                          const contentEditable = monacoContainer.querySelector('[contenteditable="true"]');
                          if (contentEditable) iframeEditable = contentEditable;
                        }
                      }
                    }
                  }
                  
                  // Also check for any visible contenteditable
                  if (!iframeEditable) {
                    const allEditables = iframeDoc.querySelectorAll('[contenteditable="true"]');
                    for (const ed of allEditables) {
                      const rect = ed.getBoundingClientRect();
                      if (rect.width > 50 && rect.height > 20) { // Reasonable size
                        iframeEditable = ed;
                        break;
                      }
                    }
                  }
                  
                  if (iframeEditable) {
                    console.log('typeFake: Found editable element in iframe:', iframeEditable.tagName);
                    editableElement = iframeEditable;
                    // Store iframe reference for later use
                    editableElement.__typeFakeIframe = iframe;
                    break;
                  }
                }
              } catch (e) {
                // Cross-origin iframe - try to access via postMessage or other methods
                console.log('typeFake: Cross-origin iframe detected, cannot access directly');
                // For cross-origin, we might need to use postMessage, but for now skip
              }
            }
          }
          
          // Also check if clickTarget itself is in an iframe
          if (!editableElement && clickTarget) {
            try {
              let frame = clickTarget.ownerDocument.defaultView;
              if (frame && frame !== window) {
                // We're in an iframe, search in this document
                const iframeDoc = clickTarget.ownerDocument;
                editableElement = iframeDoc.querySelector('input, textarea, [contenteditable="true"]');
                if (!editableElement) {
                  // Try Monaco editor patterns
                  const monaco = iframeDoc.querySelector('.monaco-editor textarea, .monaco-editor .inputarea, textarea.monaco-mouse-cursor-text');
                  if (monaco) {
                    editableElement = monaco;
                  } else {
                    const monacoContainer = iframeDoc.querySelector('.monaco-editor, [class*="monaco"]');
                    if (monacoContainer) {
                      const textarea = monacoContainer.querySelector('textarea');
                      if (textarea) editableElement = textarea;
                      else {
                        const contentEditable = monacoContainer.querySelector('[contenteditable="true"]');
                        if (contentEditable) editableElement = contentEditable;
                      }
                    }
                  }
                }
                if (editableElement) {
                  console.log('typeFake: Found editable in iframe document:', editableElement.tagName);
                }
              }
            } catch (e) {
              console.log('typeFake: Error checking iframe context:', e);
            }
          }
          
          if (editableElement) {
            console.log('typeFake: Found editable element:', editableElement.tagName, editableElement.className);
            
            // If element is in an iframe, we need to work in that iframe's context
            const elementDoc = editableElement.ownerDocument;
            const elementWindow = elementDoc.defaultView;
            const isInIframe = elementWindow !== window;
            
            if (isInIframe) {
              console.log('typeFake: Element is in iframe, using iframe context');
              // We're in an iframe - the content script should be injected there too
              // But we need to make sure we're using the right document
            }
            
            // Found it! Now wait a bit for it to be ready, then get cursor position
            setTimeout(() => {
              editableElement.focus();
              
              // Additional wait for complex editors like Zybooks/Coding Rooms
              setTimeout(() => {
                // Get cursor position - use the element's document's selection API
                let cursorInfo = null;
                const isInput = editableElement.tagName === 'INPUT' || editableElement.tagName === 'TEXTAREA';
                const isContentEditable = editableElement.contentEditable === 'true' || editableElement.isContentEditable;
                
                // Use the correct window/selection for iframe context
                const selectionWindow = isInIframe ? elementWindow : window;
                const selection = selectionWindow.getSelection();
                
                if (isInput) {
                  cursorInfo = {
                    type: 'input',
                    selectionStart: editableElement.selectionStart || 0,
                    selectionEnd: editableElement.selectionEnd || 0
                  };
                } else if (isContentEditable) {
                  if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const walker = elementDoc.createTreeWalker(
                      editableElement,
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
                    cursorInfo = {
                      type: 'contenteditable',
                      textOffset: textOffset,
                      collapsed: range.collapsed
                    };
                  }
                }
                
                resolve({ element: editableElement, cursorInfo: cursorInfo });
              }, 300); // Longer wait for Coding Rooms/Monaco editor
            }, 150);
          } else {
            // Not found yet, retry after a short delay
            setTimeout(() => findEditableWithRetry(attempts + 1), 200);
          }
        };
        
        // Start retry loop
        findEditableWithRetry();
      };
      
      // Add click listener with capture to catch early
      document.addEventListener('click', clickHandler, true);
      
      // Also listen on document body as fallback
      document.body.addEventListener('click', clickHandler, true);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (!clicked) {
          document.removeEventListener('click', clickHandler, true);
          document.body.removeEventListener('click', clickHandler, true);
          // Try to find any editable element as fallback
          const fallbackElement = findEditableElementAdvanced();
          resolve({ element: fallbackElement, cursorInfo: null });
        }
      }, 30000);
    });
  }

  // Listen for messages from background script
  const messageListener = (message, sender, sendResponse) => {
    if (message.action === 'startTyping') {
      // Create unique session ID
      const sessionId = Date.now() + Math.random();
      
      // Stop any existing typing
      window.__typeFakeStopFlag = true;
      window.__typeFakeIsTyping = false;
      window.__typeFakeCurrentSession = null;
      
      // Wait for user to click where they want typing to start
      waitForClickPosition().then(({ element, cursorInfo }) => {
        // Only proceed if this is still the latest session request
        if (window.__typeFakeCurrentSession === null || window.__typeFakeCurrentSession < sessionId) {
          // Check if we have a valid element
          if (!element) {
            chrome.runtime.sendMessage({ action: 'typingComplete' }).catch(() => {});
            sendResponse({ success: false, error: 'No editable element found. Please click inside a text input area.' });
            return;
          }
          
          // Verify element is actually editable
          const isInput = element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
          const isContentEditable = element.contentEditable === 'true' || element.isContentEditable;
          const isMonacoTextarea = element.tagName === 'TEXTAREA' && 
            (element.classList.contains('monaco-mouse-cursor-text') || 
             element.closest('.monaco-editor') !== null);
          
          console.log('typeFake: Element validation:', {
            tagName: element.tagName,
            isInput: isInput,
            isContentEditable: isContentEditable,
            isMonacoTextarea: isMonacoTextarea,
            className: element.className,
            inIframe: element.ownerDocument !== document
          });
          
          if (!isInput && !isContentEditable && !isMonacoTextarea) {
            console.error('typeFake: Element failed validation:', element);
            chrome.runtime.sendMessage({ action: 'typingComplete' }).catch(() => {});
            sendResponse({ success: false, error: 'Clicked element is not editable. Please click inside a text input area.' });
            return;
          }
          
          window.__typeFakeCurrentSession = sessionId;
          
          // Reset flags
          window.__typeFakeStopFlag = false;
          window.__typeFakeIsTyping = false;
          
          // Use clicked element's cursor info
          const finalCursorInfo = cursorInfo || message.cursorInfo;
          
          // Notify that typing is starting
          chrome.runtime.sendMessage({ action: 'typingStarted' }).catch(() => {});
          
          // Ensure element is focused before starting
          element.focus();
          console.log('typeFake: Starting typing with element:', element.tagName, element.className);
          
          // Start typing at clicked position (pass element to ensure we use the right one)
          typeText(message.text, finalCursorInfo, sessionId, element).then(() => {
            // Only send response if this is still the active session
            if (window.__typeFakeCurrentSession === sessionId) {
              // Notify that typing is complete
              chrome.runtime.sendMessage({ action: 'typingComplete' }).catch(() => {});
              sendResponse({ success: true });
            }
          }).catch((error) => {
            console.error('Typing error:', error);
            if (window.__typeFakeCurrentSession === sessionId) {
              chrome.runtime.sendMessage({ action: 'typingComplete' }).catch(() => {});
              sendResponse({ success: false, error: error.message });
            }
          });
        }
      });
      
      return true; // Keep channel open for async response
    } else if (message.action === 'stopTyping') {
      window.__typeFakeStopFlag = true;
      window.__typeFakeIsTyping = false;
      window.__typeFakeCurrentSession = null;
      sendResponse({ success: true });
      return true;
    }
  };

  // Store listener reference so we can remove it if script reloads
  window.__typeFakeMessageListener = messageListener;
  chrome.runtime.onMessage.addListener(messageListener);
})();
