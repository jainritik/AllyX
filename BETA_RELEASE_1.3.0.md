# ALLYX 1.3.0 beta release record

Date: 2026-09-17
Web deployment: dpl_7kfBfwvveNqZ5mpCCgkpFFeQ7j6G (READY, protected production alias)
Database: `supabase_beta_migration.sql` applied to Supabase project eslcatxyhshjlgukkfhc; profile privileges and resume trigger verified via read-only queries.

## Fixed in this release

- AI generation, streaming, transcription, and resume parsing require a verified Supabase account. Groq-facing calls have bounded inputs; generation and transcription use an atomic daily request ledger (150 and 600 requests per account, respectively). Missing accounting fails closed.
- Removed browser grants that allowed a user to set `profiles.subscription_tier` or insert their own profile; profile reads remain owner-only.
- Desktop verifies the hosted renderer's minimum native version before loading. Foreign navigation and redirects are blocked, privileged IPC validates its sending frame and origin, and media permissions apply to the actual main-window session.
- Capture stop invalidates pending microphone, camera, and system-audio starts; the native stop request tells the renderer to stop its stream. OCR targets the matching display and releases its stream and worker on failure.
- Ending a session includes the final transcript after Q&A, keeps the user on the screen if cloud save fails, and keeps an account-scoped local draft for recovery. Sign-out and account changes clear private setup/draft context.
- Streaming SSE handles arbitrary chunk boundaries; denied microphone access cannot mark desktop recording active.
- The download page no longer links to the upstream author's old Windows installer. Upstream auto-update handlers and feed are disabled. One electron-builder configuration is authoritative; the Intel CI runner uses `macos-15-intel`.
- The model test now makes a real authenticated, quota-accounted provider request. A database trigger enforces the 10-resume cap under concurrent inserts. The Electron quit handler no longer dereferences a cleared window.

## Verification

- TypeScript, ESLint, Next production build, and 27 Node tests pass.
- The protected production deployment reports renderer/minimum desktop version 1.3.0. A credential-free POST to its generation route returns HTTP 401 without reaching Groq.
- Apple Silicon and Intel Mac DMGs pass `hdiutil verify`. Packaged executables have the expected arm64/x86_64 architecture; the Windows unpacked executable is x86-64.
- Real Electron API smoke test passes privacy property toggle; receiver-side exclusion was not tested in this release cycle.

## Artifacts (local, not public downloads)

- `dist/AllyX-1.3.0-arm64.dmg` — Apple Silicon, unsigned.
- `dist/AllyX-1.3.0-x64.dmg` — Intel Mac, unsigned.
- `dist/AllyX-1.3.0-Setup.exe` — Windows x64, unsigned.

## Launch gates still open

1. Vercel Authentication currently redirects ordinary visitors to Vercel SSO. The native app's compatibility check cannot pass for a market beta until the production domain is made accessible to app users. Keep preview deployments protected and keep Supabase account sign-in active.
2. Obtain a valid Apple Developer ID Application certificate and notarize both DMGs. Obtain a Windows code-signing certificate and sign the installer. Neither certificate is available on this machine; the previous Apple Development certificate is expired.
3. Execute receiver-side Meet, Teams, Zoom, browser, multi-monitor, microphone, OCR, and sleep/wake tests on the actual target Apple Silicon, Intel Mac, and Windows devices. A successful API property toggle is not proof of invisibility in every capture pipeline.
4. Paid beta subscriptions are not implemented: checkout, webhook validation, entitlement updates, and provider billing are still absent. Keep this a free/invite beta until those are built.
5. Do not publish architecture download URLs on the web page until signing and device QA pass. The page intentionally displays pending status when the owner-controlled URLs are unset.
