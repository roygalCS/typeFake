document.addEventListener('DOMContentLoaded', () => {
  const textInput = document.getElementById('textInput');
  const typeOutBtn = document.getElementById('typeOutBtn');

  typeOutBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    
    if (!text) {
      alert('Please enter some text to type.');
      return;
    }

    try {
      // Send message to background script
      await chrome.runtime.sendMessage({
        action: 'typeText',
        text: text
      });
      
      // Close popup after sending message
      window.close();
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Error: Could not send text to active tab.');
    }
  });
});
