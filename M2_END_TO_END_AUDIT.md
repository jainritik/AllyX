# ALLYX M2 MacBook end-to-end audit

## Target and scope

Target: MacBook Pro 13-inch (2022), Apple M2, 16 GB RAM, macOS Tahoe 26.6.2, installed ALLYX 1.2.0. The machine serial number is not needed and is intentionally excluded.

The scope is the existing private demo from login through session completion, history, and logout. Cross-platform packaging and monetization are deferred. This is a diagnostic report; no production code, account configuration, or customer records were changed.

The installed application's main process, preload, and capture-privacy module were compared byte-for-byte with the current desktop-safe source and match. That validates those native source findings against the installed binary. The application loads the hosted website, so local React and API findings do not establish which web revision is deployed. There is no release handshake in the current app to resolve this automatically.

The native accessibility inspection exposed the ALLYX window shell, not its web controls. The research fetch of the hosted login page was also unavailable. Accordingly, this report does not claim a completed live login-to-save walkthrough. Existing owner-reported Meet and Teams visibility successes are retained as reported tests. Authentication provider settings, live RLS/grants, email templates, and production environment variables remain uninspected.

## Evidence labels

- **Installed:** read from the installed app or matched native code.
- **Reproduced:** executed actual extracted source logic with synthetic data and isolated mocks.
- **Source:** directly identified in code, with no claim that the live symptom was reproduced.
- **Configuration-dependent:** requires the corresponding deployed setting to establish current impact.

High priority means a core flow can fail, capture can outlive the intended session, data can be lost, or authorization is inadequate. Medium means a meaningful incorrect result or recovery/UX defect. Low means polish or engineering hygiene. Missing functionality is distinguished from a defect.

## Journey overview

```text
Launch installed app
  → load hosted dashboard → login if needed
  → email/password or provider authentication
  → dashboard → resume + job description + language + model
  → instruction page → interview page
  → microphone / system audio → utterance transcription
  → automatic or manual AI answer
  → optional OCR / camera
  → end session → save → dashboard/history
  → logout / quit / next session
```

There are three independent concerns: window capture privacy, audio/video recording, and account/session persistence. Passing the privacy test does not validate recording or saving. Conversely, successfully logging in does not establish backend authorization.

## 1. Launch and release coordination

**L1 — High; Installed/Source. Remote renderer is not versioned with desktop.** `electron/main.js` loads the private Vercel URL; bundled `.next` output is not the active UI. Local fixes to `src/app/interview/page.tsx` require a web deployment before they affect this installation. Add an explicit app/bridge/web version handshake, or bundle the desktop renderer. Acceptance: identify the running web revision and reject incompatible bridge requirements before starting a recording.

**L2 — Medium; Installed/Source. App quit lifecycle is unsafe.** The `before-quit` listener nulls `mainAppWindow`, while the close listener prevents closing and dereferences that variable. This can throw or interfere with normal termination. Reproduce in an isolated GUI lifecycle test, then use an `isQuitting` flag and permit normal destruction. Do not use hide-on-close logic for app termination.

**L3 — Medium; Source. Startup/load failure has incomplete recovery.** The main process emits `load-error` into the page that failed to load, but does not switch the main window to the bundled loading/retry screen. Test offline launch and expired Vercel protection. A retry action must remain accessible when the remote page cannot run JavaScript.

**L4 — Medium; Installed. Unsigned app and ambiguous copies.** Multiple copies exist in Applications, build output, and mounted DMGs with the same bundle ID. The audit had to select the Applications path explicitly. This complicates knowing which build is running; it is not proof of a malfunction. Provide a visible build identity and a single installation instruction. Signing/notarization remains necessary for predictable distribution.

## 2. Login, signup and recovery

**A1 — High; Source and earlier local reproduction. Cookie is not real authentication.** `src/proxy.ts:35` accepts any 32–36-character matching string. Login writes a prefix of the JWT, with a random UUID fallback (`src/app/login/page.tsx:116`, `:155`). Neither proves identity. The page gate can be passed with a fabricated cookie; Supabase RLS still needs separate evaluation before claiming database access. Replace the gate with verified server-side identity.

**A2 — Medium; Configuration-dependent. Signup assumes email OTP.** `login/page.tsx:104` always changes to a verification-code form after signup. Supabase email templates can contain a confirmation link or token, and a signup configuration can return a session immediately. The code does not branch on these results. Match the UI to the chosen email flow and handle immediate sessions. The earlier screenshot showed a link-only email; the current template was not inspected. [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)

**A3 — Medium; Source. Resend repeats signup instead of using resend.** `login/page.tsx:134` calls `signUp` again. This conflates account creation with confirmation delivery and has no explicit resend cooldown. Use the documented signup-confirmation resend operation and surface rate-limit errors. [Supabase resend](https://supabase.com/docs/reference/javascript/auth-resend)

**A4 — Low; Source. Signup success notice is cleared by the mode transition.** The signup handler sets success and switches mode; the mode effect clears success. Show the confirmation instruction in the verification state, independent of a transient message.

**A5 — Medium; Source. Requested destination is ignored.** The proxy passes `from`, but login/callback always navigate to `/dashboard`. A session timeout on an interview route cannot recover the intended destination. Validate and honor an internal return path, while preserving any draft separately.

**A6 — Medium; Missing flow. Password recovery is not implemented.** The reviewed login/auth code has no complete forgot-password request and reset screen. Acceptance: request a reset, open its link, set a new password, reject expired links, and return to the desktop app without creating a fake session cookie.

**A7 — Medium; Source. Provider login has no complete desktop handoff.** Google OAuth uses Supabase defaults, and the desktop has no dedicated external-browser return protocol. Browser and Electron storage are separate. A confirmation completed in Chrome therefore does not automatically establish an Electron session. The current provider behavior needs a live test; use one intentional password/email or system-browser/PKCE return design. [Supabase redirect/deep-link guidance](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)

**A8 — Medium; Source. Session/logout state is inconsistent.** The auth listener sets the routing cookie only for non-null sessions; the desktop title-bar sign-out calls Supabase directly without clearing that cookie. Other logout controls do clear it. Centralize logout and clear account-scoped session context. A stale cookie does not prove a valid Supabase session but causes inconsistent routing.

**A9 — Medium; Source. Session checks lack consistent error recovery.** Dashboard layout waits on `getSession` without handling errors or providing a retry state. Repeated `checkSession` calls also register auth listeners without disposing previous ones. Test token expiry, temporary auth failure, and logout in another window. Server authorization should use verified identity, not a stored session object. [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [Supabase getSession](https://supabase.com/docs/reference/javascript/auth-getsession)

## 3. Resume and session setup

**S1 — High for shared accounts; Source. Resume/JD context is not account-scoped.** `interview_context_*` survives ordinary logout. A second account on the same Electron profile can inherit the previous person's context. Namespace data by authenticated account and erase active drafts on logout according to a clear recovery policy.

**S2 — Medium; Source. Setup continues after context persistence fails.** `dashboard/new/page.tsx:152` writes several localStorage keys; the catch only logs and navigation continues. Quota or storage errors can lead to a stale or partially updated context. Save one validated context object atomically, and block Start on failure.

**S3 — Medium; Source. Resume parsing success can hide cloud-save failure.** Upload sets success before `createResume`; save errors are only logged. Distinguish text extracted for this session from resume saved to the account. When the ten-resume limit is reached, the user should know which operation succeeded.

**S4 — Medium; Source. Resume quota is not atomic.** A client-side count followed by insert can exceed ten with simultaneous requests. If the limit matters, enforce it transactionally in the backend/database. Live constraints were not checked.

**S5 — Medium; Source. Model test is simulated.** `ModelChat`, rendered by the new-session page, waits and returns canned responses instead of calling a model. It cannot validate a provider, key, selected model, or actual answer quality. Replace it with a real authenticated test or explicitly label it a UI preview.

**S6 — Medium; Source. Parsing and format failures are inconsistently classified.** `/api/parse-resume` has a size check, but trusts a cast to File and returns server errors for some user-input problems. Image-only PDF rejection is currently an explicit limitation, not working OCR. Validate the file shape and provide useful responses for invalid, encrypted, empty, and image-only PDFs.

## 4. Microphone and system audio on this Mac

**R1 — High; Installed plus official documentation. System-audio usage description is missing.** `/Applications/AllyX.app/Contents/Info.plist` has no `NSAudioCaptureUsageDescription`. Electron's documentation says the Core Audio tap path used from Electron 39 requires this on macOS 14.2+ and may create a dead stream without displaying an error when the entry is absent. This matches the installed Electron generation and target OS. Actual silence was not recorded in this audit. Add the declaration to the active package configuration and test with headphones and a known synthetic playback signal. [Electron desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer)

**R2 — High; Installed/Source. Permission policy is set on the wrong Electron session.** The main window uses `persist:main`, while initialization modifies `defaultSession`. Configure the actual session with an origin-aware permission handler and verify grant, denial, and revocation. A microphone permission is distinct from system-audio and screen-recording permission.

**R3 — High; Source. Pending capture can start after Stop.** The microphone/camera acquisition promises are not guarded after `await`. If the user stops or navigates while a permission prompt is open, resolving it later can create a stream after the intended lifecycle ended. Add a generation token/cancellation check that immediately stops stale streams.

**R4 — Medium; Source. Failed microphone start can still show Recording.** `startDesktopSTT` catches its failure and returns normally; `toggleRecording` then sets recording and auto mode true. Return an explicit result or throw, and derive UI state from active capture.

**R5 — High; Source. Speech recognition instances and retries outlive state transitions.** The effect depending on `isRecording` creates a fresh recognition instance without cleanup of the previous one or scheduled retry callbacks. This can orphan a running recognizer or restart after a stop. A single owned instance with timer disposal is required. Whether Web Speech actually works in this Electron installation remains a runtime question.

**R6 — High; Source. Stop paths are not unified.** Normal microphone Stop does not stop screen audio; local-hide handling stops some streams but leaves camera state untouched. End Interview does not invoke either desktop or screen cleanup. The native stop-system-audio handler merely returns success. Define separately what Stop Microphone, Stop All, Hide, End, and Quit do, then route them through one resource owner.

**R7 — Medium; Source. Recorder work is not fully owned.** The VAD recorder and animation-frame loop are local variables, without a complete cancellation/flush mechanism. Closing the audio context is not an explicit final-recording flush. Test short final utterances and stopping while speech is active; choose whether the last audio is sent or intentionally discarded and reflect that in session saving.

## 5. Transcription and answers

**T1 — High; Reproduced. Valid speech is discarded by phrase matching.** The blacklist uses substring matching. Actual extracted logic discarded both “Thank you, explain your database design” and “Our system stores copyright metadata.” Remove broad phrase deletion and use evidence-based silence/hallucination handling.

**T2 — High for affected languages; Source. Offered languages are explicitly filtered out.** Chinese, Japanese, and Korean appear in the language selector, but `interview/page.tsx:508` rejects text containing their scripts. Test each offered language and remove the contradiction. Arabic recognition also collapses variants to `ar-EG` rather than preserving the selected variant.

**T3 — Medium; Source. Transcription failures can look like silence.** Exhausted retries only log errors and return; the visible user can remain in Recording with no transcript. Surface disconnected, rate-limited, and configuration-failure states. Chat and transcription also read different environment-variable names, so validate both separately.

**T4 — High; Source and earlier mocked reproduction. Provider routes lack verified user authorization.** Generation, streaming, and transcription accept requests without server-side identity checks or per-user quotas. Use verified user sessions, limits, and payload validation before exposing the service. A deployment-access gate is not user authorization.

**T5 — Medium; Source. Answer requests are not an ordered, cancellable session queue.** `getAiAnswer` clears transcript before the response arrives and restores the old transcript on error. New speech arriving during the request can be overwritten by that restoration. Pending responses can also complete after End. Use request IDs, session cancellation, and separate pending/committed transcript segments.

**T6 — Medium; Source. Answers lack prior-turn conversation context.** Each generation request sends one current question with static resume/JD context. Follow-ups such as “why did you choose that?” do not receive the earlier assistant answer. Preserve a bounded conversation history and test follow-up coherence.

**T7 — Medium; Source. Main interview answers do not use streaming.** The interview calls `/api/generate`, not the streaming endpoint; it waits for the entire response. The streaming endpoint independently has the previously reproduced partial-chunk bug. Fixing that endpoint alone will not improve the main interview until the UI is connected to it.

**T8 — Medium; Source. Fallback model selection is not disclosed in the interview UI.** The backend returns `modelUsed`, but the interview reads only `content`. If the requested model fails, the UI should display which model actually answered. Never equate a selected card with verified provider execution.

**T9 — Medium; Source. Transcript is a rolling buffer, not a complete session record.** Incoming text is limited to 4,000 characters, clears between questions, and repeated transcripts are deduplicated. Useful for context control, but unsuitable as the sole source of full session history. Store ordered segments separately from the AI context window.

## 6. OCR, camera and capture privacy

**O1 — Medium; Installed/Source. Scanner display selection is incorrect for general layouts.** Main process takes source zero and primary display scaling; renderer uses global crop coordinates directly. Even on the target Mac this matters when an external display is connected. Resolve the matching display and convert coordinates relative to it.

**O2 — Medium; Source. OCR cleanup only covers success.** If video readiness, canvas access, or Tesseract recognition fails, streams/workers may remain active because cleanup is not in `finally`. Add a timeout and unconditional cleanup.

**O3 — Medium; Source. OCR is fixed to English.** The selected interview language does not configure the worker. Document that limitation or support selected OCR languages; do not imply parity with the full language selector.

**O4 — Validation limit. Privacy behavior remains configuration-specific.** Owner-reported Meet/Teams results are positive and are not invalidated by this report. Tests must nevertheless cover auxiliary windows and the actual receiving view. Native permission prompts/menu surfaces are not automatically covered by the BrowserWindow hook. Preserve the working privacy path while fixing unrelated session defects.

## 7. Ending, history and next session

**E1 — High; Reproduced. Trailing unanswered text is omitted from the saved session.** With an existing Q&A pair and a final unanswered question, the extracted End handler saved only the earlier Q&A. Append all unsaved transcript segments and wait for or cancel in-flight work according to a documented stop policy.

**E2 — High; Reproduced. Failed save still navigates away.** A synthetic database failure invoked navigation to `/dashboard` with no success toast, retry state, or durable draft. Keep the session recoverable, show an actionable error, and retry with an idempotent session ID.

**E3 — High; Reproduced handler control flow. Empty-session exit skips cleanup.** The short/empty branch immediately navigates away, and no capture-stop calls occur in that handler. This is a control-flow reproduction, not a real microphone recording test. End must stop capture even when there is nothing to save.

**E4 — Medium; Source. Duplicate saves lack an idempotent identity.** Each service call inserts a new row. UI loading can reduce repeated clicks but does not prevent uncertain-network retries from creating duplicates. Allocate a session ID at start and use it consistently for save/retry.

**E5 — Low/Medium; Source. Duration measures page time.** Duration starts when the interview component mounts and includes setup/pause time. It is rounded to minutes; dashboard treats zero minutes as one. Choose and label either elapsed session time or active recording time, and calculate consistently.

**E6 — Missing functionality. Stored Q&A is not post-session evaluation.** The analysis structure stores questions, answers, language and duration. There is no completed separate feedback generation flow measuring the user's performance. Keep this out of the first reliability fix, but do not call it implemented.

**E7 — Medium; Source. Logout does not define draft and capture ownership.** Several independent logout handlers exist. Session context, pending uploads, capture resources, auth subscriptions, and routing cookies need one shutdown/reset path. Acceptance: account B must not receive account A's context or pending response after switching accounts.

## Reproduction record

Actual component arrow-function/constant initializers were extracted with the TypeScript AST and evaluated using synthetic state. No customer transcripts, credentials, live DB writes, or paid model calls were used.

| Experiment | Result |
|---|---|
| Installed main/preload/privacy files versus local files | All three matched |
| Installed audio usage-description key | Missing |
| End with prior Q&A plus new final question | Saved only prior Q&A |
| End with mocked save throwing offline error | Navigated to dashboard despite failure |
| End with empty content and cleanup spies | Navigated; no cleanup calls |
| Blacklist applied to legitimate “thank you” sentence | Dropped |
| Blacklist applied to technical “copyright metadata” sentence | Dropped |

Prior audit evidence remains applicable to unchanged code: unauthenticated mocked generation reaches the provider; fragmented SSE loses the event; seven privacy/controller tests pass. These are not substitute evidence for successful login, audible system capture, or live history persistence.

## Fix order and acceptance gates

**Step 1: login and release identity.** Define the actual email flow, verify server sessions, consolidate logout, identify web/desktop versions, and provide a usable retry screen. Test fresh signup, wrong password, confirmation, expired links, resend, existing-account login, session expiry, restart, and logout. Use an isolated test account and record the deployed settings. Do not advance while successful browser login can leave desktop stuck.

**Step 2: session setup.** Make context account-scoped and atomic; distinguish parsed text from saved resumes; remove the simulated model test. Test valid TXT/PDF, oversized/invalid/image-only files, save failure, missing context, and switching accounts.

**Step 3: capture on the M2.** Add the correct Mac audio declaration and session permissions, then build a single recording lifecycle. Test the built-in microphone, headphones plus synthetic system playback, permission denial/regrant, start-then-cancel, stop while speaking, screen-audio toggle, camera toggle, sleep/wake, and quit. Verify actual signal and stream shutdown rather than only UI labels.

**Step 4: transcription and answers.** Remove valid-speech deletion, propagate provider errors, introduce ordered/cancellable requests, and preserve complete transcript segments. Test legitimate acknowledgments, selected languages, rapid consecutive questions, retries, a model fallback, and ending while a response is pending.

**Step 5: end and recovery.** Stop all resources first, retain trailing speech, preserve drafts, and make save idempotent. Test empty session, successful save, failed save, uncertain retry, reload, history display, deletion, and the next session.

**Step 6: regression on the same Mac.** Repeat the owner-reported Meet and Teams receiver tests with Capture Privacy enabled. Record meeting/browser versions and display selection. This ensures reliability fixes have not regressed the already-observed privacy behavior.

## Remaining verification boundaries

Live auth/email/provider configuration, RLS/grants, web deployment identity, real audio signal, and complete UI walkthrough are still pending. These are explicit audit gaps, not presumed failures. The report identifies findings available from installed artifacts, source, official documentation, and isolated reproduction; it does not claim exhaustive absence of further defects.

## Sources

1. Supabase. [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates). Defines confirmation URLs and OTP templates.
2. Supabase. [Resend](https://supabase.com/docs/reference/javascript/auth-resend). Dedicated signup confirmation resend operation.
3. Supabase. [getUser](https://supabase.com/docs/reference/javascript/auth-getuser). Verified user lookup.
4. Supabase. [getSession](https://supabase.com/docs/reference/javascript/auth-getsession). Stored session limitations.
5. Supabase. [Native redirect/deep-link guidance](https://supabase.com/docs/guides/auth/native-mobile-deep-linking). Return-flow design principles; not a claim that this app already implements a desktop flow.
6. Electron. [desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer). Mac audio declaration, Electron 39 tap default and silent-failure caveat.
7. Local installed artifact: `/Applications/AllyX.app/Contents/Info.plist` and `Contents/Resources/app.asar`.
8. Local source: desktop-safe project, specifically login/auth, session setup, interview, history, API routes, Electron main/preload, and packaging configuration. Line references refer to this audit's source revision.
