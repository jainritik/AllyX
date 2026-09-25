# AllyX

AllyX is a Next.js and Electron practice assistant. It authenticates users with Supabase, transcribes microphone or supported desktop audio through Groq, generates context-aware answers, stores completed practice sessions, and presents answers in a compact desktop overlay.

## Current capabilities

- Email signup, confirmation, login, logout, resend confirmation, forgot password, and password reset.
- Resume/context upload and interview setup.
- Manual and automatic question submission.
- Groq transcription plus Groq/OpenAI answer generation with bounded requests, timeouts, and provider fallback.
- Recoverable session drafts and saved session history.
- Electron shell for macOS and Windows.
- Always-on-top translucent answer overlay.
- Adjustable overlay opacity and text size.
- Click-through mode so users can type in the application underneath.
- Electron capture-exclusion request for application windows.
- One account-level 10-minute trial enforced by the database.
- Razorpay interview-pack checkout with verified, idempotent credit allocation.

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
  ├── Groq/OpenAI answer-generation endpoint
  └── Vercel-hosted renderer
```

The packaged Electron application loads the configured hosted renderer. Desktop and web versions must therefore remain compatible. The application checks `/api/desktop-compat` before loading a packaged session.

## Requirements

- Node.js 22
- npm
- A Supabase project
- A Groq API key
- An OpenAI API key when the paid OpenAI model is enabled
- A hosted Next.js renderer for packaged desktop builds
- macOS on Apple Silicon for the local build command below

## Environment configuration

Create `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
GROQ_API_KEY=YOUR_SERVER_SIDE_GROQ_KEY
OPENAI_API_KEY=YOUR_SERVER_SIDE_OPENAI_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_SIDE_SERVICE_ROLE_KEY
RAZORPAY_KEY_ID=YOUR_RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_SEPARATE_WEBHOOK_SECRET
BREVO_SMTP_USER=YOUR_SMTP_LOGIN
BREVO_SMTP_PASS=YOUR_SMTP_KEY
ALLYX_EMAIL_FROM=AllyX <verified-sender@example.com>
BUG_REPORT_EMAIL_TO=owner@example.com
```

Optional deployment/build variables:

```dotenv
NEXT_PUBLIC_ALLYX_MAC_ARM64_URL=https://example.com/AllyX-arm64.dmg
NEXT_PUBLIC_ALLYX_MAC_X64_URL=https://example.com/AllyX-x64.dmg
NEXT_PUBLIC_ALLYX_WINDOWS_X64_URL=https://example.com/AllyX-Setup.exe
ALLYX_APP_URL=https://your-hosted-renderer.example.com
```

Never place Groq, OpenAI, Razorpay, webhook, or Supabase service-role secrets in a `NEXT_PUBLIC_` variable.

## Database setup

Apply the SQL in this order through the Supabase SQL editor:

1. `supabase_schema.sql`
2. `supabase_beta_migration.sql`
3. `supabase_trial_migration.sql`
4. `supabase_billing_migration.sql`
5. `supabase_billing_account_migration.sql`
6. `supabase_session_recovery_migration.sql`
7. `supabase_credit_reservation_migration.sql`
8. `supabase_payment_lifecycle_migration.sql`
9. `supabase_payment_email_migration.sql`
10. `supabase_billing_support_migration.sql`
11. `supabase_bug_reports_migration.sql`

These migrations contain the server-side usage ledger, account-bound profile rules, recoverable session updates, atomic resume limit, trial clock, payment ledger, interview credits, payment-email outbox, authenticated billing support, and private bug-report attachments. Apply them before deploying the matching API routes; missing accounting functions intentionally stop access rather than allowing uncounted use.

For Razorpay, enable automatic capture and add the public HTTPS webhook `/api/billing/webhook` with `payment.authorized`, `payment.captured`, `payment.failed`, `refund.created`, `refund.processed`, `refund.failed`, and all `payment.dispute.*` lifecycle events. Use a separate webhook secret and store it as `RAZORPAY_WEBHOOK_SECRET`. Begin with Razorpay Test Mode keys and replace them with Live Mode keys only after end-to-end payment testing.

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
| Hide/restore all AllyX windows locally | `Command+Shift+H` | `Ctrl+Shift+H` |

Use the overlay header to:

- Enable click-through mode.
- Open the full application.
- Switch between expanded and compact layouts.
- Hide only the overlay.
- Change opacity and answer text size.

In click-through mode, mouse input goes to the editor or application below the overlay. Use the keyboard shortcut to make the overlay interactive again.

## Capture privacy

Capture Privacy asks Electron and the operating system to exclude AllyX BrowserWindows from supported capture paths. The request is applied to the main window, overlay, scanner, and future Electron windows.

This is an operating-system API request, not proof of what a remote participant receives. Native menus, permission prompts, notifications, and system dialogs are outside the BrowserWindow request. Browser, meeting-client, macOS, and Windows updates can change capture behavior.

Before each supported release:

1. Join the meeting from a second device/account.
2. Share the entire display.
3. Confirm AllyX is absent from the receiver view.
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

The DMG is written to `dist/AllyX-<version>-arm64.dmg`.

The current direct-download build is unsigned. macOS may require Control-clicking the application and choosing **Open**. A signed public release should use an Apple Developer ID certificate, hardened runtime, notarization, and an owner-controlled update/download channel.

Tagged desktop releases use `.github/workflows/desktop-installers.yml`. A tag must exactly match `desktop-v<package version>`. The workflow refuses to publish unless both Mac builds have Developer ID signing and Apple notarization credentials and the Windows build has an Authenticode certificate. It verifies the resulting signatures, generates SHA-256 checksums, and publishes all three installers to one GitHub Release. A manual workflow run can explicitly publish an unsigned prerelease for direct testing; that release is labeled unsigned and includes operating-system warning text.

Required GitHub Actions secrets for a public desktop tag are `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `WIN_CSC_LINK`, and `WIN_CSC_KEY_PASSWORD`. Never add certificate data or passwords to the repository.

## Repository layout

```text
electron/                    Electron main process, static overlay, preload bridge and native tests
src/app/                     Next.js routes and application screens
src/app/api/                 Authenticated AI, transcription and document-processing routes
src/lib/                     Authentication, context and persistence helpers
tests/                       Web/auth/service regression tests
supabase_schema.sql          Base database schema
supabase_beta_migration.sql  Beta security, quota and consistency migration
supabase_bug_reports_migration.sql  Bug reports, private attachments and email outbox
```

## Release boundaries

- Billing code requires Razorpay credentials, applied database migrations, and Test Mode validation before activation.
- Capture exclusion requires receiver-side verification for each supported OS and meeting application.
- The unsigned test DMG is suitable for private testing, not public distribution.
- Changes to the hosted renderer are not present in production until separately deployed.
