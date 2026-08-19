# ConsoleCapture by E_The_Real

Tiny diagnostic Chrome extension. Records the current tab’s console and saves an HTML (plus JSON) file you can open or share.

Version **1.0.2**.

## Load unpacked

1. Download or clone this repository  
2. Open `chrome://extensions` → turn on **Developer mode**  
3. **Load unpacked** → this folder  
4. Reload the tab you want to capture  
5. Reproduce the issue  
6. Click the ConsoleCapture icon → **Save console to Downloads**

Files land in:

`Downloads/ConsoleCapture/<timestamp>_<host>.html`

The HTML includes a **JSON for Grok** block at the bottom with the same records.

## Notes

- Hooks `console.*`, `window.onerror`, and unhandled promise rejections **in the page**.
- Does **not** see Chrome’s own internal logs, or another extension’s service-worker console.
- Does **not** inject on grok.com / x.ai (those apps have their own Errors panel).
- Reload the tab after loading ConsoleCapture or it will miss earlier messages.

## Family

Made by E_The_Real alongside [DeskDrawer](https://github.com/E-The-Real-Dragon/DeskDrawer), [AdHaven](https://github.com/E-The-Real-Dragon/AdHaven), and [PageVault](https://github.com/E-The-Real-Dragon/pagevault).
