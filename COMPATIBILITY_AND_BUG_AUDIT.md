# ALLYX private demo compatibility and bug audit

## Scope and conclusion

The current release is an experimental Apple Silicon demo, not an end-to-end cross-platform release. This audit inspected the desktop-safe source copy, the available packaged applications, platform documentation, and isolated local reproductions. It did not change application code, deploy anything, query customer data, or invoke a real AI provider.

The owner reported successful receiver-side visibility tests in Google Meet and Teams. These reports are useful evidence for those sessions; the exact Chrome/Teams versions, Teams desktop-versus-browser mode, full-display selection, monitor layout, and auxiliary-window coverage were not recorded. They cannot establish support for every application or device. Zoom, Safari-hosted meetings, other browsers, Intel Macs, and Windows receiver behavior remain untested in this audit.

No finite review can certify that all bugs have been found. Findings below are the confirmed and source-supported issues identified in this pass. Live Supabase policies, Vercel protection, deployed renderer revision, third-party dependency advisories, payment-provider state, and hardware combinations require additional validation.

## Requirement assessment

| Requirement | Current evidence | Verdict |
|---|---|---|
| Hidden in Google Meet | Owner reports another participant could not see ALLYX | Passed in the reported session; configuration needs recording |
| Hidden in Teams | Owner reports success | Passed in the reported session; desktop/browser mode unspecified |
| Hidden in Zoom | No receiver-side test | Not established |
| Hidden in Chrome/Safari/any browser meeting | No complete browser matrix | Not established |
| Works on Apple Silicon | 1.2.0 arm64 package exists; owner uses it | Demo available; not every model/OS validated |
| Works on Intel Mac | No x64 installer found; Intel CI references retired runner | Not delivered |
| Works on Windows | Existing installer is 1.1.2 and lacks capture protection | Latest requested behavior not delivered |
| Works on all MacBooks | Current app bundle requires macOS 12.0 minimum | Cannot include older machines unable to run a supported OS |
| Complete paid business | No implemented checkout/webhook/usage-entitlement flow found in reviewed app tree | Not implemented |

Apple Silicon and Intel are architecture targets, while macOS version, capture API, sharing source, and meeting-app version also affect compatibility. A successful test on one M-series Mac does not validate every OS/capture combination; separate testing of every marketing chip name is less important than testing those actual differences.

Electron documents that ScreenCaptureKit-based Mac capture can ignore `setContentProtection(true)`. Microsoft's Windows exclusion API is documented from Windows 10 version 2004, and Microsoft explicitly does not characterize it as an absolute security guarantee. The earlier product promise must therefore be phrased as tested compatibility, not invisibility across every application. [Electron](https://www.electronjs.org/docs/latest/api/browser-window), [Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)

The packaged Mac `LSMinimumSystemVersion` is 12.0. Intel support needs its own x64 package and a real Intel runtime check. Older MacBooks that cannot run the chosen OS are outside that release's support envelope. Changing a plist string cannot make an unsupported Electron runtime compatible.

## Local verification

- Seven existing Node capability/privacy tests passed. These test controller behavior, not real meeting visibility.
- A mocked call to the actual transpiled generation handler, with no authentication header or cookie, returned 200 and invoked the mocked provider once. No paid API was called.
- The actual streaming handler emitted `hello` with a complete input event; the same event divided into two chunks emitted nothing. This reproduces token loss without network access.
- The proxy's cookie predicate accepts 32 arbitrary alphanumeric characters. It does not cryptographically validate a session.
- Artifact inspection: Mac package version 1.2.0 imports the privacy module. Windows package version 1.1.2 contains neither that module nor `setContentProtection`.
- Source lint covered 60 files and reported 10 errors, all CommonJS import-rule conflicts in the recently added test/smoke files. These are tooling errors, not ten distinct runtime bugs.
- The earlier real Electron smoke test confirmed local visibility and protection property toggling. It did not confirm output received by Meet, Teams, or Zoom.

## High-priority findings

High means a public-release blocker, potential account/data exposure, unexpected capture, or substantial data loss. Severity is conditional on whether the affected local code/schema is deployed. Vercel access protection can reduce external reachability but does not supply application-level authorization or user quotas.

### H1. AI routes lack server-side authentication and per-user quotas

Evidence: `src/app/api/generate/route.ts:17`, `src/app/api/generate-stream/route.ts:8`, `src/app/api/transcribe/route.ts:3`; `src/proxy.ts` does not match `/api` routes. Generation was reproduced with a credential-free request and mocked provider.

Anyone who can reach these endpoints can request work billed to the configured provider account. Model selection and input are also caller-controlled. Add validated server-side sessions, account-level limits, payload bounds, and allowed models. Test anonymous access, expired tokens, quota exhaustion, and concurrent requests before opening the demo publicly.

### H2. Route protection accepts a fabricated cookie

Evidence: `src/proxy.ts:24` and `:35`; `src/lib/auth.ts` sets a truncated access-token prefix rather than a verifiable token. The format predicate accepts arbitrary values.

This bypasses the routing gate. It does not by itself prove access to other users' Supabase rows, because correctly configured database RLS can still protect them. Replace it with actual server-side identity validation, and keep database authorization independent.

### H3. Profile schema permits broad reads and owner edits of subscription tier

Evidence: `supabase_schema.sql:9`, `:41`, and `:47`. The supplied select policy is universally true, and owner update authorization has no column restriction on `subscription_tier`.

If deployed with the usual corresponding table grants, profile email/name data can be broadly readable and users can change their own tier. This audit did not read live grants or policies, so live exposure is not confirmed. Restrict profile reads and make commercial entitlements server-owned before relying on the tier field for billing.

### H4. Hosted UI and installer do not form a versioned release

Evidence: `electron/main.js` uses the private Vercel URL for packaged runs; `.next` is packaged but not used as the renderer. New capture-stop React code exists only in the local source until separately deployed.

Native privacy requests work independently, but a successful installer build does not establish the behavior of remote recording controls. Add a desktop bridge/renderer version handshake or bundle the renderer. Verify compatibility against the exact deployment before releasing a desktop binary.

### H5. Capture shutdown is incomplete and has asynchronous races

Evidence: `src/app/interview/page.tsx:137`, `:549`, `:715`, and `:1082`; `electron/main.js:379` returns success for stop-system-audio-capture without stopping a native resource.

End Session does not invoke the desktop stream cleanup before navigation. Pending microphone/camera permission promises can resolve after a stop, because their completion paths lack cancellation guards. Local-hide handling stops some streams but does not disable the camera state, and relies on the remote renderer listener being installed. Recording must be owned by one lifecycle controller that stops active resources and invalidates pending starts. A hidden window is not evidence that capture stopped.

### H6. Remote navigation and IPC trust are not constrained

Evidence: `electron/main.js` and `electron/preload.js` expose capture and app controls to the renderer without sender-origin checks. No explicit navigation allowlist or `setWindowOpenHandler` appears in the reviewed main process.

If the privileged window navigates to untrusted content, that content may gain access to the exposed bridge. This is a source-level trust-boundary risk; no malicious navigation was attempted. Validate sender/frame origins, restrict navigation, and send unrelated external links to the system browser.

### H7. Saved session can lose data

Evidence: `src/app/interview/page.tsx:1099` chooses Q&A pairs instead of appending the remaining transcript; `:1118` navigates away even when saving fails.

An unanswered final utterance can be omitted once a Q&A pair exists. A database or connectivity error discards the session screen without a retry/recovery path. Preserve a durable draft, include trailing transcript, and keep the user on a recoverable screen if saving fails.

### H8. Published download path installs unrelated, older software

Evidence: `src/app/download/page.tsx:156` links to the upstream author's 1.1.1 Windows release. The available local Windows installer is 1.1.2 and lacks the new privacy implementation.

A person following the website download flow will not receive this private-demo release. Replace download links with owner-controlled, architecture-specific artifacts only after qualification. The fork's updater feed also still points upstream; automatic checks are now opt-in, but updater IPC handlers remain exposed. Update ownership and authorization need consolidation.

## Medium-priority findings

| ID | Finding and trigger | Evidence | Proposed correction |
|---|---|---|---|
| M1 | Streamed answer fragments disappear at arbitrary network boundaries; locally reproduced | `src/app/api/generate-stream/route.ts:58` | Maintain streaming decoder state and a carry buffer; test fragmented UTF-8 and SSE events |
| M2 | Main-window permission policy is attached to a different session | `electron/main.js:225`, `:433` | Attach policy to `persist:main`, scope allowed origins, verify permission denial/regrant |
| M3 | OCR can capture the wrong screen or crop on multi-monitor/Retina setups | `electron/main.js:313`; source index zero and primary display scale | Match the actual target display and convert coordinates relative to it |
| M4 | OCR streams/workers can leak on errors | `src/app/interview/page.tsx:999` onward; cleanup only on success paths | Use `finally` for streams and Tesseract worker cleanup; handle metadata/play failures |
| M5 | Denied microphone can still leave UI marked recording | `startDesktopSTT` catches errors, caller later sets recording true at `:792` | Propagate an explicit failure and update state only on actual capture success |
| M6 | Keys configured for chat do not automatically configure transcription | Transcribe reads `GROQ_STT_KEY_1..5`; generation reads `GROQ_API_KEY` | Define and validate a single intentional configuration contract |
| M7 | Session context can survive account switching | `interview_context_*` localStorage writes and sign-out paths | Namespace by account and clear active context on sign-out; test with two users |
| M8 | Intel CI cannot run on the retired host label | `.github/workflows/desktop-installers.yml` uses `macos-13` | Move to a supported Intel runner and explicitly validate output architecture |
| M9 | Duplicate package configurations disagree | `package.json` versus `electron-builder.yml` | Keep one authoritative config; IDs, icons, arch targets and signing should agree |
| M10 | macOS artifacts are unsigned/unnotarized | Previous package logs found no valid Developer ID | Sign and notarize distributed builds; test download/install on a clean device |
| M11 | Quitting can invoke a close handler that dereferences a cleared main window | `before-quit` nulls `mainAppWindow`; close handler calls `.hide()` unconditionally | Use an `isQuitting` flag and permit normal teardown; reproduce in GUI lifecycle test |
| M12 | Local status can describe a request as applied without proving capture exclusion | `electron/capture-privacy.js` reports property state | Preserve separate API-request and receiver-test statuses; native dialogs need separate coverage |

M8 is supported by the official runner retirement announcement: `macos-13` was removed in December 2025, and the announcement identifies an Intel replacement label. [GitHub runner retirement](https://github.com/actions/runner-images/issues/13046)

M12 is primarily a validation limitation, not a defect in the current explicitly unverified wording. The browser-window hook covers Electron BrowserWindows; it does not establish invisibility of native menu-bar menus, OS permission prompts, notifications, or system dialogs. These surfaces must not be included in a blanket claim that everything is hidden.

## Lower-priority and product-completeness findings

- New test files fail the repository's CommonJS lint rule: 10 errors across the test/smoke files. Align lint configuration with Electron's module format. This was introduced in the recent assistant-authored work.
- The model-chat component contains canned answers and an artificial delay, not a provider call (`src/components/dashboard/model-chat.tsx`). Verify whether it is exposed in the release before presenting it as a live model test.
- No real checkout, webhook-based subscription updates, recurring payment lifecycle, or metered usage ledger was found. A `subscription_tier` column is not an implemented business model.
- Saved analysis currently stores questions, responses and duration; it is not a complete, separately generated coaching/feedback pipeline.
- The ten-resume limit is checked in the client before insertion, not atomically enforced in the database. Concurrent requests or direct table access can exceed it unless a separate deployed constraint exists.
- The packaged remote-web shell includes server build artifacts and many dependencies; installers are hundreds of MB. Package size can be reduced after selecting a renderer-delivery model. This is an optimization, not a reason to rewrite a working demo first.

## Required compatibility test matrix

The release record must capture app version, OS build, CPU architecture, meeting app/browser version, sharing source, monitor layout, and receiver evidence. Use a second participant view, not only the presenter's preview.

| Target | Meeting variants | Initial result |
|---|---|---|
| Owner's Apple Silicon Mac | Meet/Chrome; Teams mode to be recorded | Owner reports pass |
| Same Mac | Zoom desktop; Teams desktop/browser; Meet/Safari where supported; Chrome/Edge/Firefox variants | Pending |
| Additional supported macOS releases on Apple Silicon | Same high-use variants | Pending |
| Intel Mac on selected supported macOS | Meet/Chrome, Zoom desktop, Teams | No current installer; pending |
| Windows x64, selected supported Windows releases | Meet/Chrome and Edge, Teams, Zoom | New installer needed; pending |
| Windows ARM | Native or emulation decision required | Not promised by current x64 build |

For each variant: share entire display, then separately test window/tab sharing; move the assistant; open scanner/settings; test more than one monitor; toggle privacy; create and close windows; restart the app; and repeat after an OS/browser update. A privacy-off control run should show the assistant, confirming that the receiver is actually observing the intended display.

Functional acceptance is separate: login/logout, microphone plus headphones, system audio, OCR, answer generation, session save/recovery, permission denial, sleep/wake, lost network, and installer upgrade. A visibility pass does not certify the audio or account flows.

## Recommended order

1. Keep the current demo restricted while correcting API authorization, profile permissions, and account isolation.
2. Repair capture lifecycle and save/recovery behavior, then verify the remote-renderer release pairing.
3. Correct download/update ownership, retire the broken CI label, and build the same version for arm64 Mac, x64 Mac, and Windows x64.
4. Execute and record the hardware/browser receiver matrix. Publish only configurations with evidence, with clear version boundaries.
5. Add payment entitlements, usage accounting, onboarding and post-session feedback after those foundations pass.

No production-code changes or fixes were performed during this audit. Creating this report and local mocked tests does not validate live deployments or untested devices.
