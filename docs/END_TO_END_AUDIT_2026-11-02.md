# AllyX verification — 2026-11-02

## Code and delivery

- GitHub main and local tracked source matched commit 3d8443b at audit start.
- 192 automated tests, TypeScript, scoped source lint, and production web build passed.
- Public site reports renderer version 1.3.43. All three installer and three checksum URLs for that release returned HTTP 200.
- Installed app was 1.3.42. Updated it to the verified local 1.3.44 bundle and verified its signature. Previous app preserved at /private/tmp/AllyX-before-1.3.44-audit.app.
- 1.3.44 remains a local Apple Silicon testing build; it is not the public website release.

## Live test

Used exactly one newly authorized interview credit: balance 9974 before, 9973 after. Used synthetic resume/context, not the user's resume, for the test session.

- Pasted question through overlay Ask: returned all 20 numbered points, code, and requested QA_END_20261102 ending marker. This checks stream completion, not independent compilation or correctness of every generated statement.
- Scan opened without the old startup error. Window picker selected the controlled Chrome fixture. Cropping below browser chrome yielded only the fixture content; tabs/bookmarks were absent from OCR.
- Captured arithmetic question automatically generated 42. OCR inserted a space into CAPTURE_QA_COMPLETE, demonstrating residual OCR imperfections.
- Local cursor button toggled. Automated shortcut injection did not visibly toggle it; after the user reported a physical Command+Shift+P keypress, the overlay state was observed changed back to hidden. Global scrolling was not independently verified live.
- Meeting audio started after Refresh displays and stopped on End Interview. Independent audio transcription remains unverified: Chrome audio fixture did not render after reload; macOS speech synthesis produced a zero-duration audio file, which QuickTime could not open. These fixture failures do not establish an AllyX transcription bug.
- End Interview completed without save error. History showed one new saved interview containing the two questions and both ending markers. Overlay/audio shut down and dashboard loaded.

## Remaining

Publish 1.3.44 for all desktop targets and update website links. Validate microphone and independent audio transcription with a real speaker, global scrolling, physical network interruptions, very long provider continuation, and remote-viewer cursor visibility. Payment checkout/refunds still need valid sandbox credentials (last gateway test rejected local credentials). Trusted release signing/notarization and broader live OS/browser coverage remain separate from successful build checks.

No extra credits, real payments, or privacy-permission resets were used. Test setup uses a synthetic profile; the saved resume library was not modified. This report does not claim all product scenarios are covered.
