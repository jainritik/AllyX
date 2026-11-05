# ALLYX desktop presentation-safe mode

Use **Safe Mode** in the desktop title bar or press **Ctrl+Shift+H** on Windows and **Command+Shift+H** on macOS before presenting.

Safe mode immediately:

- hides every ALLYX window from the local display;
- closes the OCR scanner;
- stops microphone transcription, speech recognition, and system-audio capture; and
- rejects new OCR and audio-capture requests until safe mode is exited.

Use the same shortcut or the tray menu to exit safe mode. The app cannot reliably detect every browser and meeting application's sharing state, so the shortcut and tray control are the dependable cross-platform controls.

The packaged app loads `https://allyx-private-demo.vercel.app` by default. Set `ALLYX_APP_URL` before launching to use another deployment.

## Build installers

- macOS ARM: `npm run build && npx electron-builder --mac --arm64`
- macOS Intel: `npm run build && npx electron-builder --mac --x64`
- Windows x64: `npm run build && npx electron-builder --win --x64`

The GitHub Actions workflow in `.github/workflows/desktop-installers.yml` builds all three native artifacts. Public distribution still requires Apple Developer ID signing/notarization and a Windows code-signing certificate.
