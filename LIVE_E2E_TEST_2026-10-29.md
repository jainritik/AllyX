# AllyX live end-to-end test — 29 October 2026

Environment: installed macOS Apple Silicon AllyX 1.3.40, production allyx.vercel.app, GPT-OSS 20B. User explicitly approved exactly one interview credit and supplied live microphone speech.

## Verified live

| Flow | Result | Evidence |
| --- | --- | --- |
| Existing setup → guide → start | PASS | Existing context loaded; one credit reserved. |
| Paste question → Ask → real streamed answer | PASS | Binary-search explanation, complete C++17 program, complexity and E2E_MANUAL_COMPLETE marker arrived. |
| Generated code completeness | PASS | Code retrieved from the saved test answer compiled with clang++ -std=c++17 and printed 3. Accessibility text had visually truncated the code node; the actual saved code was complete. |
| First Scan click | PASS | Scanner opened its dedicated route without the previous closed-before-opening error. |
| Full-display capture → OCR → automatic answer | PASS with OCR noise | Controlled add-two-integers fixture produced the corresponding C++ answer. Full-screen OCR also captured desktop text and truncated the requested trailing marker. |
| Microphone → transcription → Stop & answer | PASS with transcript caveat | User spoke the stack-versus-queue question; confirmed transcript contained it, followed by “. Yeah. Bye.” Generated answer correctly explained LIFO/FIFO. Cannot establish whether the extra words were ambient speech or recognition error. |
| Selected-area capture → OCR → automatic answer | PASS with small OCR artifact | Recognized “What is 12 plus 30?” plus a stray character; generated “12 plus 30 equals 42.” |
| Quit → reopen → Resume interview | PASS | Four-answer draft survived restart; dashboard showed Resume interview and restored the session. |
| End Interview → database → history | PASS | Exactly one saved record, four questions and four answers. History navigation succeeded. |
| Credit accounting | PASS | 9,976 before test; 9,975 after ending. Resume did not consume another credit. |

Saved test session: 2ae87255-86bf-4476-aa0a-9d2c9ff5cc62.
History: https://allyx.vercel.app/dashboard/history?session=2ae87255-86bf-4476-aa0a-9d2c9ff5cc62

## Current status — checked 30 October 2026

The live results above describe build 1.3.40. The installed version is now 1.3.41; use this section for outstanding status.

| Original finding | Current status |
| --- | --- |
| Microphone label incorrectly remains active after stopping | **Fixed in installed 1.3.41.** Status distinguishes stopped, microphone-only, meeting-only, combined and finalizing audio. Covered by a behavioral regression test. |
| Full-display OCR includes unrelated text | **Mitigated, not made perfectly accurate.** Full-display text is now editable for review before Ask; confident selected-area captures still answer automatically. Missing/low confidence also requires review. |
| Independent meeting/system-audio source not tested | **Live validation outstanding.** The combined microphone test does not prove a remote speaker is captured correctly. This is a coverage gap, not a confirmed defect. |
| Live long answers and network interruptions not exercised | **Live validation outstanding.** Automated tests cover continuation, stream recovery and retained partial answers; these do not substitute for live provider/network tests. |
| Purchases/refunds, other macOS versions and Windows not exercised | **Environment-specific validation outstanding.** No real financial actions or unsupported-platform tests have been performed. No defect can be inferred solely from lack of testing. |
| 179 tests passed before the live session | **Historical count.** The current suite has 183 passing tests. |

Do not describe recognition accuracy or untested platforms as fixed. No additional interview credit or financial transaction was used for this status verification.

## Follow-up fixes — 30 October 2026

The misleading stopped-microphone label is corrected in installed AllyX 1.3.41. Microphone-only listening also no longer produces a false permission-error status. Full-display captures now preserve their source mode through OCR and require review/editing before Ask; selected-area captures retain automatic answers when confidence is sufficient. Unknown confidence requires review. These behaviors have automated regression coverage; 183 tests pass.

This update mitigates noisy OCR being submitted automatically; it does not claim perfect recognition or remove genuine speech. The untested environments and flows listed above still require live validation. No additional credit or purchase was used.

## Validation-gap follow-up — 2026-10-30

- Reproduced a server usage-accounting leak when a provider stream failed. Fixed error/cancel settlement and registered completion with Next.js `after` so cleanup remains part of the request lifecycle. Added tests for partial/empty stream failure and client cancellation, including upstream abort and exactly-once settlement.
- Added a 12-second payment-provider deadline covering both headers and response body. A stalled-body regression confirms rejection and abort. This does not automatically retry or create duplicate payment orders.
- Exercised the actual answer handler with eight continuation parts totaling over 250,000 characters: full text retained in display state and the saved Q&A pair. This is deterministic provider simulation, not a live model run.
- Real Razorpay test-mode order creation was attempted with the local configured credentials. Gateway returned `Authentication failed`; no payment was attempted and no successful order was returned. Valid test credentials are required before checkout/capture/refund validation can continue. This finding concerns local credentials, not proof of the deployed environment's configuration.
- Verification: 187 automated tests pass; TypeScript, scoped source lint, and production build pass.
- Still not established: independently sourced meeting-audio transcription, a physical live network interruption, real long-provider continuation, full sandbox checkout/refund, native Windows execution, or other macOS execution. The existing installer CI includes Windows and macOS runners, but was not executed for this working tree. No additional interview credits or real payments were spent.

Deployment confirmed READY and aliased to https://allyx.vercel.app: https://allyx-4userki4y-ritik-1f49.vercel.app
