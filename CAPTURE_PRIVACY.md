# Capture Privacy 1.2.0

This desktop build requests OS capture exclusion while keeping the assistant visible locally. It is enabled at startup and applies before the assistant, floating icon, or scanner is shown. The native tray menu controls it; no web deployment is needed.

## macOS status

Experimental. Electron's documented content-protection API may be ignored by modern screen-capture applications using ScreenCaptureKit. Enabling the setting is not proof that Meet in Chrome omits the window. This build does not implement a verified workaround for that limitation.

## Test

1. Quit the old ALLYX app completely and launch version 1.2.0.
2. Open the ALLYX tray menu and confirm Capture Privacy (Experimental) is checked.
3. Join a test meeting from a second device. Share the entire Mac display.
4. Keep ALLYX open locally and inspect the second device's received image.
5. Test the assistant, floating icon, scanner, and dialogs separately. If any appear remotely, the requested exclusion does not work for that configuration.

The tray status dialog identifies the build and platform and reports OS request settings. It deliberately does not claim receiver verification.

Cmd+Shift+H remains a different action: it hides the app on your own display. Do not use that shortcut when testing whether capture exclusion keeps the local window visible.

## Verification scope

Node tests cover version classification, newly created windows, toggling, and native request errors. `electron/privacy-smoke.cjs` checks real Electron window protection and local visibility. Neither test establishes Meet, Zoom, or Teams receiver behavior. Windows runtime validation is separate.

References: [Electron content protection](https://www.electronjs.org/docs/latest/api/browser-window), [Microsoft display affinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity).
