# AllyX functional audit — 29 October 2026

Reviewed the interview lifecycle, voice transcription queue, scanner startup/capture handoff, streamed answers, draft/history persistence, authentication cleanup, session access and credit reservation, and existing API/billing security regression coverage. This is a targeted code and regression audit, not a guarantee that every possible device/provider combination is bug-free.

## Fixes

1. **End Interview omitted an answer still streaming.** Generation intentionally stops updating state when session ending begins, so aborting it lost the visible answer from history. The handler now snapshots accumulated answer text before cancellation and includes it in the saved Q&A. Continuations extend their original answer instead of creating a duplicate question.
2. **Unfinished drafts were hidden after restart.** Dashboard now offers Resume interview for a meaningful draft belonging to the current account and setup. It restores the existing session ID. Invalid JSON, foreign accounts, stale setup, and empty drafts do not show a recovery action.
3. **Slow background access checks overlapped.** Checks now schedule the next request only after the previous request settles. Disposed checks cannot apply stale results to another page/session.
4. **Transient access-check failures closed desktop interview windows.** A network error now retains already verified UI readiness. Authentication failures and explicit access denials still revoke readiness; each generation/transcription request continues to enforce access server-side.
5. **Background checks could reserve another credit.** The interview page repeatedly called the start-session endpoint. Expired sessions could therefore trigger another reservation. Heartbeats now use GET status and verify that the active session ID matches; only the explicit setup flow starts/reserves sessions.
6. **Sign-out retained interview identity.** Account cleanup now removes the access-session ID and pending finish marker in addition to private context/drafts.
7. **Recorder shutdown exceptions could strand End Interview.** Shutdown now runs inside the save handler's catch/finally so errors remain retryable and the saving flag is released.
8. **A delayed draft write could recreate a completed draft.** Autosave skips ending sessions and resumes after a failed save.

## Validation

- 179 tests passed across tests/*.test.cjs and electron/*.test.cjs.
- TypeScript noEmit passed.
- ESLint passed for src, electron, tests, scripts.
- Local production build passed; production deployment is verified separately below.
- New behavioral tests exercise actual End Interview code, interrupted answer and continuation preservation, recorder shutdown failure, draft ownership/corruption, slow heartbeat/disposal, read-only checks, mismatched session IDs, and sign-out cleanup.
- Existing regression tests cover scanner request concurrency, capture recovery, ordered voice chunks, complete answer continuation, broken stream recovery, authenticated saving, and API/billing access controls.

## Scope limits

No real purchase, credit-consuming interview, or live microphone/system-audio test was performed for this audit. OCR and speech recognition accuracy remain dependent on input quality and providers. Very long AI answers still have a bounded automatic continuation limit with an explicit Continue action. No native Electron code changed in this audit; installed 1.3.40 remains the desktop build.

## Deployment

Production deployment https://allyx-8mce6ofvd-ritik-1f49.vercel.app reached READY and was aliased to https://allyx.vercel.app. The installed app was on the dashboard and was refreshed after deployment.

## Speech latency follow-up

- Continuous speech chunk maximum reduced from 4,000 ms to 3,000 ms; minimum short segment from 1,200 ms to 800 ms; silence finalization from 500 ms to 350 ms.
- At most two clips upload/transcribe concurrently. Transcript publication still waits for recording sequence order; failed/stale work follows existing failure and epoch guards.
- New regression cases confirm the concurrency cap, progress when a later request completes first, and ordered transcript publication without duplicate uploads.
- 181 tests, TypeScript, lint, and local production build passed. These are structural latency improvements, not a measured live end-to-end latency guarantee. Provider/network latency remains.
