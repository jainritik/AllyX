# ZEDX AI

ZEDX AI is a Next.js and Electron practice assistant. It authenticates users with Supabase, transcribes microphone or supported desktop audio through Groq, generates context-aware answers, stores completed practice sessions, and presents answers in a compact desktop overlay.

This repository contains the private beta source. Payment and subscription checkout are intentionally outside the current beta scope.

## Current beta capabilities

- Email signup, confirmation, login, logout, resend confirmation, forgot password, and password reset.
- Resume/context upload and interview setup.
- Manual and automatic question submission.
- Groq transcription and answer generation with bounded requests and timeouts.
- Recoverable session drafts and saved session history.
- Electron shell for macOS and Windows.
- Always-on-top translucent answer overlay.
- Adjustable overlay opacity and text size.
- Click-through mode so users can type in the application underneath.
- Electron capture-exclusion request for application windows.

## Architecture

```text
Electron desktop shell
  ├── Main authenticated Next.js application
  ├── Transparent answer overlay
  ├── Optional OCR selection window
  └── Native audio/window IPC

Next.js application
  ├── Supabase authentication and database
  ├── Groq transcription endpoint
  ├── Groq answer-generation endpoint
  └── Vercel-hosted renderer
```

The packaged Electron application loads the configured hosted renderer. Desktop and web versions must therefore remain compatible. The application checks `/api/desktop-compat` before loading a packaged session.

## Requirements

- Node.js 22
- npm
- A Supabase project
- A Groq API key
- A hosted Next.js renderer for packaged desktop builds
- macOS on Apple Silicon for the local build command below

## Environment configuration

Create `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
GROQ_API_KEY=YOUR_SERVER_SIDE_GROQ_KEY
```

Optional deployment/build variables:

```dotenv
NEXT_PUBLIC_MAC_ARM64_DOWNLOAD_URL=https://example.com/ZEDX-AI-arm64.dmg
NEXT_PUBLIC_MAC_X64_DOWNLOAD_URL=https://example.com/ZEDX-AI-x64.dmg
NEXT_PUBLIC_WINDOWS_X64_DOWNLOAD_URL=https://example.com/ZEDX-AI-Setup.exe
ZEDX_APP_URL=https://your-hosted-renderer.example.com
```

Never place the Groq secret in a `NEXT_PUBLIC_` variable. Rotate any credentials shared through chat or committed to source before a public beta.

## Database setup

Apply the SQL in this order through the Supabase SQL editor:

1. `supabase_schema.sql`
2. `supabase_beta_migration.sql`

The beta migration contains the server-side usage ledger, account-bound profile rules, and atomic resume-limit enforcement used by the current application.

Configure the production site URL and allowed redirect URLs in Supabase Authentication. Configure a transactional SMTP provider for reliable confirmation and password-reset email delivery.

## Local development

```bash
npm install
npm run electron:dev
```

The development shell loads `http://localhost:3000`. Authentication, Groq calls, and database operations still require valid environment configuration and network access.

## Desktop overlay

Generated questions and answers are forwarded from the interview page to a separate transparent Electron window. A new answer opens the overlay automatically.

| Control | macOS | Windows |
| --- | --- | --- |
| Toggle overlay interaction/click-through | `Command+Shift+O` | `Ctrl+Shift+O` |
| Hide/restore all ZEDX windows locally | `Command+Shift+H` | `Ctrl+Shift+H` |

Use the overlay header to:

- Enable click-through mode.
- Open the full application.
- Switch between expanded and compact layouts.
- Hide only the overlay.
- Change opacity and answer text size.

In click-through mode, mouse input goes to the editor or application below the overlay. Use the keyboard shortcut to make the overlay interactive again.

## Capture privacy

Capture Privacy asks Electron and the operating system to exclude ZEDX BrowserWindows from supported capture paths. The request is applied to the main window, overlay, scanner, and future Electron windows.

This is an operating-system API request, not proof of what a remote participant receives. Native menus, permission prompts, notifications, and system dialogs are outside the BrowserWindow request. Browser, meeting-client, macOS, and Windows updates can change capture behavior.

Before each supported release:

1. Join the meeting from a second device/account.
2. Share the entire display.
3. Confirm ZEDX is absent from the receiver view.
4. Repeat with window/tab sharing.
5. Test Meet, Teams, and Zoom separately.
6. Test multiple monitors, overlay movement, settings, OCR, sleep/wake, and restart.
7. Turn Capture Privacy off for one control run and confirm the receiver can then see the window.

Do not describe a configuration as verified until a second participant has observed and recorded the result.

## Validation

```bash
npm run lint
npx tsc --noEmit
node --test tests/*.test.cjs electron/*.test.cjs
npm run build
```

## Build Apple Silicon macOS package

```bash
npm run build
npx electron-builder --mac --arm64
```

The DMG is written to `dist/ZEDX-AI-<version>-arm64.dmg`.

The current beta build is unsigned. macOS may require Control-clicking the application and choosing **Open**. A public release should use an Apple Developer ID certificate, hardened runtime, notarization, and an owner-controlled update/download channel.

## Repository layout

```text
electron/                    Electron main process, preload bridge and native tests
src/app/                     Next.js routes and application screens
src/app/api/                 Authenticated Groq and document-processing routes
src/app/desktop/overlay/     Transparent desktop answer overlay
src/lib/                     Authentication, context and persistence helpers
tests/                       Web/auth/service regression tests
supabase_schema.sql          Base database schema
supabase_beta_migration.sql  Beta security, quota and consistency migration
```

## Beta release boundaries

- Payment, checkout, recurring billing, and subscription entitlements are not implemented.
- Capture exclusion requires receiver-side verification for each supported OS and meeting application.
- The unsigned test DMG is suitable for private testing, not public distribution.
- Changes to the hosted renderer are not present in production until separately deployed.
