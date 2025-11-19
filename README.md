# typeFake

Chrome extension that makes typing look human. Paste some text, click a button, and it types it out with realistic delays and mistakes.

## What it does

Instead of pasting text (which some sites can detect), this extension actually types it character by character like a real person would. It adds random delays, makes occasional typos, then backspaces and fixes them.

## Installation

1. Download or clone this repo
2. Open Chrome and go to `chrome://extensions`
3. Turn on "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the typeFake folder
6. Done! The extension icon should show up in your toolbar

## How to use

1. Go to any website with a text input (like a form or text box)
2. Click inside the input field to focus it
3. Click the typeFake icon in your Chrome toolbar
4. Paste your text in the popup
5. Click "Type Out"
6. It'll start typing into the focused field

That's it. Make sure you have an input field focused before clicking "Type Out" or it won't work.

## How it works

- Types with random delays between 60-150ms per character
- Has a 7-10% chance to make a typo, then backspaces and fixes it
- Sends real keyboard events so websites can't tell it's automated
- Works with regular inputs, textareas, and contenteditable elements
- Handles multi-line text

Everything runs locally in your browser. No servers, no API calls, nothing fancy.

## Files

- `manifest.json` - Extension config
- `popup.html/css/js` - The UI you see when you click the icon
- `background.js` - Handles messages between popup and content script
- `content.js` - The actual typing simulator that runs on web pages

## Notes

Only works when an input field is focused. If nothing happens, make sure you clicked inside a text box first.

## License

Do whatever you want with it.
