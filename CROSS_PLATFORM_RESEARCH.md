# ALLYX cross-platform assistant architecture

## Decision

A product with live transcription, contextual AI answers, screen OCR, session history, and mobile access is feasible. A single implementation that guarantees an assistant window remains visible locally yet absent from every entire-screen capture on every device is not established by the available evidence. The product should separate ordinary assistance from capture privacy, expose platform capabilities accurately, and qualify compatibility against receiver-side recordings.

The immediate engineering priority is the Apple Silicon desktop experience, followed by Windows x64. The browser and mobile clients should share sessions, documents, answers, and feedback, but should not promise desktop-equivalent operating-system control. Building installers is only a distribution step; it does not validate microphone capture, permission recovery, or visibility during a meeting.

The source review and public documentation checks below were performed on September 14, 2026. No Parakeet or Cluely binary was reverse-engineered, and no live competitor screen-share test was performed. Platform support statements are documentation-based unless explicitly described as a local source finding.

## Competitor evidence

Parakeet markets a real-time call assistant with speech transcription, coding assistance, screen context, and screen-share invisibility. Its public presentation establishes the intended product behavior, but not the underlying native implementation or a version-specific compatibility guarantee. Earlier speculation that it probably uses Electron's protection flag should not be treated as a finding. [Parakeet product page](https://www.parakeet-ai.com/?via=exploreai)

Cluely markets live assistance and meeting notes. Its undetectability page offers an interactive capture test and describes an assistant that does not join the meeting as a bot. Absence of a meeting bot, absence of browser focus events, and absence of pixels in a screen recording are three different properties. A browser-event demonstration cannot establish capture privacy across other applications. [Cluely product page](https://cluely.com/), [Cluely test page](https://cluely.com/undetectability)

Cluely's mobile page specifically describes iPhone meeting notes, real-time help, and online note synchronization. This does not establish a system-wide iPhone overlay or arbitrary access to another app's call audio. Mobile availability should not be interpreted as feature parity with a desktop companion. [Cluely mobile](https://cluely.com/mobile)

There is insufficient public technical evidence here to identify either vendor's exact Mac exclusion technique. Possible implementation categories include native platform facilities and version-specific rendering behavior, but naming a particular private technique as their solution would be speculation. A clean implementation should start from documented APIs and measured results.

## Platform feasibility

| Platform | Assistant and transcription | Screen capture privacy | Proposed shipping scope |
|---|---|---|---|
| Windows x64 | Electron UI; native audio capture as needed | Documented exclusion API, with restrictions and receiver testing | First full desktop target after Mac stabilization |
| macOS Apple Silicon | Electron UI plus Swift helpers for native capture | Standard Electron protection is not a modern universal exclusion mechanism | Full assistant; privacy status qualified by tested configuration |
| macOS Intel | Same architecture, separate build and native dependencies | Same operating-system caveats; CPU architecture does not solve capture exclusion | Add only after Intel runtime tests |
| Chrome/Edge web | Dashboard, microphone input, selected-source capture | No verified web mechanism here for excluding a visible page from another app's full-display capture | Dashboard and explicit capture |
| iPhone/iPad | Native or shared mobile UI, local microphone, session synchronization | Capture-state response for the app's own scene; no desktop-style parity established | Notes, practice, session companion |
| Android | Native UI, microphone; playback capture where allowed | Secure-window API protects content, but is not evidence of an invisible arbitrary overlay | Mobile assistant with explicit feature limits |
| Linux | Desktop UI feasible | No universal exclusion support established in this research | Later experimental target |

### Windows

Microsoft documents `WDA_EXCLUDEFROMCAPTURE` starting with Windows 10 version 2004. It applies to a top-level window belonging to the calling process, depends on desktop composition, and is not a security guarantee against all capture methods. Older systems treat the flag like a mode that blanks the captured window instead of removing it. [Microsoft display affinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)

For ALLYX, the implementation candidate is a native-window adapter, with an explicit result for API availability and application failure. Every auxiliary window must be covered: assistant, scanner, settings, dialogs, and any recreated window. An API call returning success must never set a receiver-verified flag. Tests must compare the second participant's recording with the local view, including overlapping windows and multiple monitors.

### macOS

Electron explicitly documents that newer Mac capture applications using ScreenCaptureKit can capture a window despite `setContentProtection(true)`. Apple describes the old sharing-none value as legacy and advises against relying on it to omit content from capture. This is why restoring a boolean in the existing app is not a defensible guarantee for Meet in Chrome. [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window), [Apple sharing type](https://developer.apple.com/documentation/appkit/nswindow/sharingtype-swift.enum/none?language=objc)

ScreenCaptureKit lets the application creating a capture stream choose content filters. That does not mean ALLYX can configure a stream owned by Chrome, Meet, or Zoom. A ALLYX-controlled presenter stream is architecturally different from a meeting application's entire-screen capture. [Apple ScreenCaptureKit sample](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos?language=objc)

The Mac investigation should use a minimal native test window and the existing Electron window side by side, measuring the receiver output on the exact macOS and Chrome builds used. If the documented path fails, the status remains unsupported for that configuration. A competitor demonstration can show that a technique works in its demonstrated setup without proving a durable API exists for all setups. Native Swift alone does not remove the OS restriction.

### Browser

Chrome's tab-capture API can provide a tab's media after an explicit extension invocation. A capture initiated by the extension is separate from Google Meet's own presentation stream. The extension's capture state must not be presented as a global indicator of all screen sharing. [Chrome tabCapture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)

A browser extension could offer an explicit Start Session action and a native-message bridge to the installed app. Meeting-page UI observations could be supplemental signals, but they need per-site maintenance and an unknown state when detection fails. They are not an adequate foundation for a cross-application guarantee.

### Mobile

On iOS, the public scene-capture state can be used to change the app's own presentation when its scene is captured. This is a response mechanism, not evidence that an arbitrary assistant view can stay locally visible and be absent from all recording. [Apple scene capture state](https://developer.apple.com/documentation/uikit/uimutabletraits-13ja5/scenecapturestate?changes=_3)

Android's secure-window flag prevents screenshots and display on nonsecure outputs for the protected window. It may produce blank content; it should not be advertised as a seamless invisible overlay. Android playback capture requires permission and a MediaProjection grant, and depends on the source app's capture policy and eligible audio. It is not universal access to other apps' calls. [Android secure activities](https://developer.android.com/security/fraud-prevention/activities), [Android media capture](https://developer.android.com/media/platform/av-capture)

The mobile MVP should therefore support microphone-based sessions, uploaded material, saved notes, and an authenticated companion view. A session pairing code must be short-lived and tied to the signed-in account. Device unlinking should revoke access immediately. Native audio behavior, background handling, and interruption recovery require physical-device tests.

## Architecture

Use one product backend and platform-specific capture adapters. Retain the existing React/Next.js dashboard and Supabase account system. Separate the assistant session engine from the current large interview page so desktop and mobile can consume the same event protocol.

```text
Microphone / permitted system audio / requested screen crop
                         |
                  Native capture adapter
                         |
        Timestamping, channel labels, bounded audio queue
                         |
             Transcription service through authenticated API
                         |
      Session context: transcript + chosen documents + OCR
                         |
               Streaming answer generation
                         |
     Desktop assistant / browser / authenticated mobile companion
                         |
          Session summary, feedback, saved history
```

Keep capture, visibility, and AI requests as separate state machines. A useful session lifecycle is idle, requesting-permission, recording, paused, stopping, and ended. Visibility can independently be visible or hidden. Capture compatibility can independently be unknown, API-available, tested, or failed. This prevents the existing ambiguity where a hide button is described as both capture protection and audio shutdown.

Each transcript segment should include session ID, monotonic sequence, channel, start/end timestamps, text, and final/interim status. Each answer should reference the transcript revision used. Aborting a session should invalidate its generation token, so delayed network responses cannot restart UI output or upload buffered audio.

### Audio

For Mac system audio, evaluate Apple's Core Audio taps through a small Swift helper. Apple's sample requires macOS 14.2 or later and an audio-capture usage description. Keep microphone and output channels separate before transcription; merging both loses useful speaker attribution. ScreenCaptureKit is another capture source to assess for selected-content workflows. [Apple Core Audio taps](https://developer.apple.com/documentation/CoreAudio/capturing-system-audio-with-core-audio-taps)

On Windows, WASAPI loopback provides access to playback at a rendering endpoint; a hardware loopback device is not required. Capture permission, device changes, Bluetooth output, and remote-desktop routing remain test cases. A system-output channel should not automatically be labeled as one person when several meeting participants can speak. [Microsoft loopback recording](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)

The current ALLYX transcription route defaults to `whisper-large-v3-turbo`. Groq documents that model and `whisper-large-v3` for audio transcription. The existing recorder sends utterance blobs, so the observed delay includes silence detection and upload time; fast inference alone does not create continuously updated transcripts. [Groq speech to text](https://console.groq.com/docs/speech-to-text)

Initially retain the existing provider behind a replaceable transcription adapter. Add bounded buffering, cancellation, retry with backoff, and final-segment deduplication. Benchmark short chunks against utterance-based chunks for accuracy and cost rather than selecting a chunk size solely for apparent speed. Do not treat multiple provider keys as extra entitlement or a substitute for respecting account quotas.

### OCR and context

Start with explicit crop capture, preserving monitor identity, scale factor, and global-to-display coordinate conversion. Avoid assuming the first desktop source is the intended monitor. Run local OCR when practical, then send relevant text to the AI. Large screenshot uploads should be a deliberate fallback with a visible preview of the selected context.

Retrieved document and OCR text should remain data, not privileged instructions. Bound the context window and retain references to the chosen document sections. In the answer UI, distinguish an answer grounded in uploaded material from a general model response. Screenshots should not be saved by default unless the session retention setting requests it.

### Backend and deployment

Keep Vercel for the web surface and authenticated request endpoints. Use streaming responses for answer delivery. For persistent audio connections, verify the available runtime and connection duration before choosing an in-process WebSocket service. Public Vercel sources returned conflicting statements: a newer knowledge-base article describes native WebSockets while an older limits page says Functions do not act as WebSocket servers. Resolve this with the selected runtime and a staging deployment, rather than repeating older categorical advice. [Vercel knowledge base](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections), [Vercel limits](https://vercel.com/docs/limits)

A dedicated session service is an architectural option if duration or reconnection behavior is unsuitable. Keep durable state outside process memory and support sequence-based resumption. Supabase remains the proposed identity, session metadata, transcript, and document store; verify actual policies and deployed migrations before enabling a multi-user service.

All costly endpoints need server-side identity verification, session ownership checks, input limits, and usage accounting. Provider keys belong on the server. Billing should charge against an idempotent server-side usage ledger, not a client timer. Avoid embedding administrative database credentials or model keys in an installer.

## Findings in the current ALLYX source

These are local source findings, not assertions about the latest deployed Vercel configuration.

| Finding | Evidence | Priority and consequence |
|---|---|---|
| Packaged app loads remote UI | `electron/main.js` selects the private demo URL when packaged | High: packaged React changes do not update the remote renderer |
| Safe mode depends on renderer cooperation | Main process sends an event; interview page subscribes | High: without matching hosted code, hiding the window does not prove audio stopped |
| Permission policy is installed on the wrong session for the main window | Main window uses `persist:main`; initialization configures `defaultSession` | High: audit and attach handlers to the actual session |
| Update publisher still points to original author's repository | `package.json` publish owner/repository; updater checks in main process | High: disable or replace before distributing a maintained fork |
| SSE parser drops split messages | `generate-stream/route.ts` parses each network chunk independently and ignores incomplete JSON | High for answer reliability: buffer lines across chunks and preserve decoder state |
| Transcription configuration differs from chat | Transcribe reads `GROQ_STT_KEY_1..5`; chat reads `GROQ_API_KEY` | Medium/high: one configured key name may not enable both paths |
| No authentication check in the two reviewed AI route handlers | Streaming generation and transcription handlers | High before public exposure; middleware and deployment protection need a separate end-to-end audit |
| Shortcut registration outcome is ignored | `globalShortcut.register` result unused | Medium: conflicts can silently remove the shortcut |
| Duplicate build configuration | `package.json` and `electron-builder.yml` | Medium: previous build selected package configuration, so YAML-only changes may not apply |
| Packaging is not runtime validation | Existing installers and successful build output | High for release claims: receiver visibility and actual audio shutdown remain unverified |

The earlier promise that the installer alone completed microphone shutdown was overstated. A build validates compilation and packaging, not compatibility with the remote site. Repairing that mismatch is required before presenting the desktop app as fully tested.

## Implementation sequence

### Phase 1: desktop correctness

Choose a single renderer delivery model. Prefer a bundled desktop renderer with a separately configured authenticated backend, or enforce an explicit bridge-version handshake if remote rendering is retained. Keep desktop release identity distinct from the upstream repository. Consolidate packaging configuration and configure the correct permission session.

Implement one capture owner that records every active stream, native helper, recorder, pending permission request, and network upload. Stop must cancel pending starts as well as established streams. Persist recoverable transcript state before destroying a renderer. Verify that camera, microphone, and system-audio activity end, not just that React state changes.

### Phase 2: Mac feasibility test

Record macOS build, CPU, Chrome build, app build, monitor layout, and sharing mode. Test a minimal window and ALLYX separately. Observe from another participant/device and retain non-sensitive evidence. Verify entire display, application window, and browser tab separately. Re-test after changing capture infrastructure or Electron version.

The exit criterion is an explicit compatibility result. If the standard path is captured, document that result rather than setting a green privacy indicator. Do not commit to a native rewrite until a minimal experiment demonstrates that it solves the requested behavior.

### Phase 3: Windows and core assistance

Add the Windows window-protection adapter and qualify it on current supported Windows systems. Build native audio adapters, repair the streaming parser, and establish transcript timestamps and cancellation. Add response grounding, summaries, and per-session feedback. These are product capabilities independent of window exclusion.

### Phase 4: mobile and browser

Ship an authenticated session companion and history first. Add device-local audio only after platform interruption tests. Add an optional Chrome extension for explicitly selected tab capture if it improves the workflow; it is not required for the web dashboard. Publish a feature matrix that distinguishes microphone, system audio, OCR, and privacy support.

### Phase 5: release hardening

Sign and notarize Mac releases; sign Windows releases; maintain update ownership and artifact checksums. Test upgrades from the current unsigned fork. Produce architecture-specific artifacts and do not assume the installed native helpers match the packaging host. Minimize packaged server dependencies and exclude secrets from both bundles and build logs.

No credible fixed completion estimate for Mac capture parity can be given until the feasibility experiment is complete. A small ordinary UI change and an OS-dependent capture technique have very different uncertainty. Scope and schedule the latter as an explicit investigation with a stop/go result.

## Acceptance tests

For each supported combination, test Meet in Chrome, Zoom desktop, and Teams desktop/browser with entire-display and selected-window sharing. Include multiple displays, Retina scaling, foreground/background transitions, dialogs, scanner creation, minimize/restore, and app relaunch. Mark Windows and mobile tests as pending until executed on real target systems.

Measure microphone-only, headphones plus system audio, simultaneous speakers, device unplugging, revoked permissions, sleep/wake, network loss, and provider rate limiting. Confirm that stop prevents late uploads and that reconnect does not duplicate transcript segments. Evaluate OCR with mixed scaling and non-primary monitors.

Suggested performance targets are engineering goals, not measured results: final transcript within 1.5 seconds of utterance end at the median; first answer content within 2 seconds of finalized context at the median. Track p95 and error rates alongside medians. Use a repeatable recording corpus and fixed network conditions before comparing against vendor latency claims.

The receiver output is the authority for screen-share visibility. Neither a protection property readback, a hidden Dock icon, an installer build, nor a local preview alone qualifies as a passed entire-screen privacy test.

## Delivered foundation and remaining work

`electron/platform-capabilities.js` implements a conservative capability classifier. It recognizes the Windows capture-exclusion version boundary, reports Mac protection as not guaranteed, and never claims receiver verification or automatic external-sharing detection. Its Node tests cover version boundaries, malformed input, macOS, and unsupported platforms.

This module is a tested design foundation, not a wired production visibility feature. No new installer or deployment is produced by this research deliverable. The existing installed app therefore retains its previous behavior. Native Mac exclusion parity, capture lifecycle repair, authenticated session services, and physical-device validation remain implementation work described above.

## Sources

All links are primary publisher or platform documentation. Vendor pages establish advertised behavior, not independent verification. Undated pages were consulted September 14, 2026.

1. ParakeetAI. [Product overview](https://www.parakeet-ai.com/?via=exploreai).
2. Cluely. [Product overview](https://cluely.com/).
3. Cluely. [Test undetectability](https://cluely.com/undetectability).
4. Cluely. [Mobile product](https://cluely.com/mobile).
5. Electron. [BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window).
6. Microsoft. [SetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity), February 22, 2024.
7. Apple. [NSWindow sharing type none](https://developer.apple.com/documentation/appkit/nswindow/sharingtype-swift.enum/none?language=objc).
8. Apple. [Capturing screen content in macOS](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos?language=objc).
9. Apple. [Core Audio taps](https://developer.apple.com/documentation/CoreAudio/capturing-system-audio-with-core-audio-taps).
10. Microsoft. [Loopback recording](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording), April 16, 2025.
11. Google. [Chrome tabCapture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture).
12. Google. [Secure Android activities](https://developer.android.com/security/fraud-prevention/activities).
13. Google. [Android playback capture](https://developer.android.com/media/platform/av-capture).
14. Apple. [Scene capture state](https://developer.apple.com/documentation/uikit/uimutabletraits-13ja5/scenecapturestate?changes=_3).
15. Groq. [Speech to text](https://console.groq.com/docs/speech-to-text).
16. Vercel. [WebSocket support knowledge base](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections), June 22, 2026.
17. Vercel. [Limits](https://vercel.com/docs/limits); conflicts with newer WebSocket guidance require runtime verification.
