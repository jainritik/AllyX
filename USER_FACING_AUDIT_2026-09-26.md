# AllyX user-facing product audit — 26 September 2026

Baseline: commit a676c2e, deployed at https://allyx.vercel.app.

## Scope and evidence

Reviewed login, OAuth callback, dashboard, resume setup, model selection, interview startup, entitlement checks, streamed answers, draft recovery, session completion, history, checkout, billing and public support. Opened the authenticated production setup and billing pages. Submitted one model-preview question (rejected before provider invocation); no payment, email, session start, or credit consumption was performed. Checked Vercel upload limits and W3C reflow guidance. Ran two small isolated code reproductions for checkout retry and setup timestamps.

This is a prioritized defect report, not a claim that every possible defect has been found. Native microphone/system-audio capture, receiver-side screen sharing, actual Google OAuth completion, payment capture/refund/webhooks, and a continuous one-hour desktop session were not exercised. No product fixes or deployment were performed in this audit.

## High priority — broken core actions and recovery

### H1. Model preview cannot work before a session (live reproduced)
- Evidence: `src/components/dashboard/model-chat.tsx`, handleSend; `src/lib/api-access.ts`, authorizeApi.
- The setup page offers “Test Drive Model” before starting. Its request lacks X-ALLYX-Session-ID, which the API requires. Production returned “Start an interview session before using AI features.” for “What is a goroutine?”.
- Fix: remove the nonfunctional preview from setup or implement an explicitly bounded preview entitlement/API. Never bypass billing authorization on the existing endpoint.

### H2. Paid users with an unused trial start a ten-minute session (confirmed in code)
- Evidence: `supabase_credit_reservation_migration.sql:62`, begin_interview_access; `src/app/dashboard/new/how-to-use/page.tsx`, handleStart.
- SQL checks unused trial before interview credits. There is no trial/paid choice. Live Billing showed 9,999 credits alongside an unused trial for the owner's account.
- A user who has bought credits can unexpectedly be stopped after ten minutes. Fix: present an explicit choice or prioritize a paid session with clear confirmation of credit use.

### H3. Checkout retry can remain stuck (isolated reproduction)
- Evidence: `src/components/purchase-button.tsx:13`, loadCheckout.
- A failed script element remains in the document. A subsequent attempt attaches load/error listeners to that already-failed element. Neither event fires again; there is no deadline.
- Reproduction: mocked initial script error, retried loader; promise stayed pending. Fix: remove failed scripts, share an in-flight loader, add a deadline and retry state.

### H4. Draft recovery uses an unstable setup version (isolated reproduction)
- Evidence: `src/lib/interview-context.ts:20,56`; `src/app/interview/page.tsx:149`.
- Every saveInterviewContext call replaces savedAt with Date.now(), including a cloud read of unchanged setup. Draft restoration requires exact equality with that value.
- Reproduction: identical setup saved twice produced versions 101 and 102, so the draft match failed. Navigating through setup/how-to-use before resuming can invalidate an otherwise valid draft.
- Fix: preserve the persisted setup version; use account + session ID as the recovery identity and deliberately handle actual context changes.

### H5. Ending a session can silently fail to release it (confirmed in code)
- Evidence: `src/app/interview/page.tsx:1578,1616`.
- finish errors are caught with console.error, then local session/draft references are removed and the user navigates away. The server can retain an active reservation and a later start resumes it unexpectedly. An unused credit refund can also remain pending.
- Fix: distinguish history saved from session closed; retain the session ID and show a retryable completion state until the server confirms closure.

### H6. Accepted upload sizes exceed the hosting limit (confirmed platform mismatch)
- Evidence: `src/app/support/report-bug/page.tsx:25,53`, `src/app/api/support/public-bug-reports/route.ts:38`; `src/app/api/parse-resume/route.ts`; `src/app/api/transcribe/route.ts`.
- Public support offers 10 MB attachments, resumes allow 5 MB, and transcription allows nearly 15 MB, all passing through Vercel request bodies. Vercel documents a 4.5 MB request limit, including multipart overhead. Large accepted files fail before handler validation.
- Logged-in bug reports already upload directly to Supabase Storage; the public form does not.
- Fix: use securely authorized direct storage uploads for attachments; align resume/audio payloads with transport limits, chunk audio where appropriate, and provide friendly 413 handling.

### H7. Partially received AI answers disappear after a stream failure (confirmed in code)
- Evidence: `src/app/interview/page.tsx:555`, generate response catch block.
- The UI displays streamed text, but on a later error a normal answer is replaced with an error string and its continuation state is cleared. Q&A history is only appended on success.
- Fix: preserve received text, mark it interrupted, and expose Continue/Retry. Save partial content distinctly.

## Medium priority — first-use friction and misleading states

### M1. Start button text overflows its container (screenshot confirmed)
- Evidence: `src/components/ui/button.tsx:7` whitespace-nowrap; `src/app/dashboard/new/page.tsx:508,520` fixed height, large font, long label and icon inside a narrow five-column card with large padding.
- Fix: shorter label such as “Review setup”, responsive padding/type, min-width:0, controlled wrapping and flexible height. Verify narrow windows and zoom, not just the outer desktop breakpoint. The guide's long start/download buttons have the same layout risk.

### M2. Login can show an unbounded checking spinner (confirmed in code)
- Evidence: `src/app/login/page.tsx:28,69`; `src/app/auth/callback/page.tsx`; `src/app/dashboard/layout.tsx:126`.
- Several network operations gate the entire screen without a UI deadline/retry affordance. Callback, server proxy and dashboard also perform sequential user checks.
- Fix: bounded loading/error states and removal of redundant client validation after verified server entry; retain server authorization. The user's Google-page delay itself is not diagnosed by this finding.

### M3. Changing OTP email can make Continue appear broken (confirmed in code)
- Evidence: `src/app/login/page.tsx:40,115`.
- Change email does not clear or explain the previous resend countdown. sendCode returns silently while resendSeconds > 0, but the email step's Continue button is enabled and shows no countdown.
- Fix: keep the cooldown visible and disable with an explanation; implement per-address cooldown if desired without weakening rate limiting.

### M4. Browser guide offers an action that cannot open the app (confirmed in code)
- Evidence: `src/app/dashboard/new/how-to-use/page.tsx:114,217`.
- “Open in AllyX desktop app” only sets an error; it neither opens the app nor downloads it. The browser instructions also describe a practice camera even though sessions are blocked in browsers.
- Fix: show a real download/open-app action and browser-appropriate instructions before the user reaches a dead end.

### M5. Initial cloud load can overwrite newly typed setup (confirmed race in code)
- Evidence: `src/app/dashboard/new/page.tsx:140`.
- Fields are editable while the cloud request runs; its completion unconditionally replaces resume/context/model state. There is no dirty-state or stale-response guard.
- Fix: only hydrate untouched fields; ignore stale account/unmounted responses; show a clear initial loading state.

### M6. Resume readiness can be announced before validation succeeds (confirmed in code)
- Evidence: `src/app/dashboard/new/page.tsx`, handleFileUpload; `src/app/api/parse-resume/route.ts`.
- Parser accepts exactly 10 characters; setup requires at least 11. Upload reports “ready” before checking the same readiness rule. Starting is also allowed during a new upload when previous text is valid, so the old resume can be persisted.
- Fix: use shared validation and block setup submission while upload is in progress; make success text reflect actual readiness.

### M7. Hidden daily usage caps can stop paying users (confirmed in code)
- Evidence: `src/lib/api-access.ts:5`; `supabase_beta_migration.sql`.
- 300 generation / 1,200 transcription requests per UTC day apply across models and paid sessions. Billing shows credits but not these counters. Changing model cannot bypass the common quota.
- Correction to the earlier account message: 9,999 interview credits did NOT make API usage unlimited. Only existing counters were reset; daily caps remain.
- Fix: disclose usage and reset time, and implement an explicit admin override if intended. Unlimited session duration is not unlimited API usage.

### M8. Checkout recovery can claim credits added after refund/dispute (confirmed in code)
- Evidence: `src/components/purchase-button.tsx:45,85`.
- Reconciliation treats refund_pending, partially_refunded, refunded and disputed as success and displays the original pack's credits as newly added.
- Fix: display each payment state accurately; use authoritative current balance/net credits instead of the original pack quantity.

### M9. History loses code formatting and truncates context (confirmed in code)
- Evidence: `src/app/dashboard/history/page.tsx`, qa.answer paragraph and job_description.slice(0,500).
- Answers are rendered as ordinary paragraphs, collapsing whitespace and displaying markdown literally; technical code answers become difficult to read. Context is cut at 500 characters with no expand control.
- Fix: reuse the answer markdown renderer, preserve code blocks, and provide an expandable full context.

### M10. AI model cards cannot be selected with the keyboard (confirmed in code)
- Evidence: `src/app/dashboard/new/page.tsx:433` clickable divs without keyboard semantics.
- Fix: native radios or buttons with visible focus and selected state. Audit unnamed icon buttons, associated labels and focus handling alongside this.

## Lower priority and clarity improvements

- Setup always waits an artificial 800 ms after saving (`src/app/dashboard/new/page.tsx:233`). Remove the delay and show navigation progress.
- Setup/model-preview auto-scroll can move the page on mount and model changes (`src/components/dashboard/model-chat.tsx`, scrollIntoView). Scroll only the preview's own container.
- OAuth error text recommends password login although the current primary UI uses email codes (`src/lib/auth-callback.ts:21`). Give instructions matching available actions.
- Fallback banner says “Paid model unavailable” even when a Groq model fell back (`src/app/interview/page.tsx:519`). Use provider-neutral wording and show the actual model.
- Public bug attachment picker shows no selected filename, removal option or upload progress (`src/app/support/report-bug/page.tsx:53`). Users cannot confirm what will be sent.
- “Reset App Data” clears local setup but cloud setup is restored on the next load (`src/components/settings-dialog.tsx`, `src/lib/interview-context.ts`). Explain local-only behavior clearly or provide an intentional cloud reset action.
- Model “PAID” labeling does not explain whether the customer pays extra beyond credits. Clarify actual billing behavior; do not imply a separate charge without one.
- Old zedx-private-demo host returned DEPLOYMENT_NOT_FOUND in the previous deployment verification. That is not a working permanent redirect; bookmarks and old links need a Vercel alias/redirect if they are to remain useful.

## Fix and acceptance order

1. Start button reflow and broken model preview.
2. Trial versus paid start, visible quota behavior, session completion and draft recovery.
3. Checkout retry and payment status messages.
4. Upload transport limits and partial-answer preservation.
5. Login/OTP loading and recovery, setup hydration races, browser handoff.
6. History formatting, accessibility, support feedback and copy consistency.

For each fix exercise success, validation failure, network error and retry. Test layouts at 320/390/768/1024/1440 CSS pixels and with increased zoom/text. Real desktop acceptance must include microphone denial, system audio, OCR cancellation, network loss, sleep/wake, end/save retry and a one-hour run. Test real payments only in the chosen authorized test flow; do not equate page rendering with verified capture/refund behavior.

## Primary references

- Vercel function limits: https://vercel.com/docs/functions/limitations
- Vercel oversized request behavior: https://vercel.com/docs/errors/function_payload_too_large
- W3C reflow guidance: https://www.w3.org/WAI/WCAG21/Understanding/reflow
