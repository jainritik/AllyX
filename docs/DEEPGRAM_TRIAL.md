# Deepgram streaming trial

Desktop listening uses one mono microphone + selected meeting-audio stream. Audio is sent every 100ms; interim captions are replaced as recognition improves. Final captions enter the saved question buffer. Stop & answer waits for the final audio, provider metadata, and clean socket close. An interrupted finalization blocks automatic answers from incomplete text.

Server-only configuration (local `.env.local`, or the deployed Next.js server's environment):

- `DEEPGRAM_LIVE_ENABLED=true`
- `DEEPGRAM_API_KEY`: a Deepgram key with Member or higher role, allowing `/v1/auth/grant`.
- `DEEPGRAM_TRIAL_USER_IDS=*`: all authenticated users with an active interview. Alternatively supply comma-separated Supabase user IDs. Empty disables the trial.

Restart the Next.js server after configuration changes. Packaged desktop apps using a hosted URL need the updated code and environment on that host; local configuration does not update a hosted deployment.

The permanent key stays server-side. The authenticated endpoint checks interview entitlement and reserves one existing transcription quota unit per issued 30-second token. This counts connections, not streaming minutes. Tokens can initiate a connection during their lifetime, and do not terminate an established connection when they expire. Streaming recordings stop after ten minutes in the client; this is a trial UX limit, not an enforceable billing cap. A production public rollout needs server-enforced duration/concurrency accounting through a streaming proxy.

The $200 trial credit is shared across every enabled user. The app does not read or cap the Deepgram account balance. Monitor credit in the Deepgram console and do not enable paid auto-recharge for a credit-only test. Set `DEEPGRAM_LIVE_ENABLED=false` to stop issuing new tokens. Existing streams end when stopped or after the client limit; revoke the provider key to revoke provider access if needed.

Disabled/unconfigured streaming and connection setup failures use existing Groq transcription. A mid-stream failure stops recording and asks the user to retry, rather than silently losing speech. Browser-only practice retains its existing speech-recognition path. Language support follows Nova-3; unsupported language setup falls back to standard transcription.

Verification: TypeScript checks and mocked streaming lifecycle tests can run without a provider account. A real temporary-token and WebSocket handshake should also be checked; live microphone/meeting capture needs testing in the desktop app on each supported OS.
