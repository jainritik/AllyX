# Login reliability batch

## Implemented locally

- A1: Replace the fabricated auth_token gate with Supabase SSR cookies and a server-verified user. Preserve refreshed cookies on the request and response. Expire the legacy routing cookie.
- A2/A4: Match the verified project configuration: link-based email confirmation, persistent instructions, and immediate-session signup support. Numeric OTP entry is off by default and separately configurable.
- A3: Use the signup resend endpoint with a 60-second UI cooldown and provider error feedback.
- A5: Validate internal return destinations and preserve them through login and callbacks.
- A6: Add password-reset request and update pages, expired-session handling, password confirmation, and explicit browser-to-desktop instructions.
- A7: Hide Google sign-in unless explicitly configured, and keep it unavailable in the desktop shell until its external-browser handoff exists. The current private demo uses email/password.
- A8/A9: Share logout across the title bar, navigation, settings, and dashboard. Stop writing fake cookies; avoid accumulating auth listeners. Dashboard verification has retry UI and reacts to logout.
- Label login fields and the password-visibility control for accessibility.

Account-scoped drafts, capture cleanup at logout, backend API authorization, and remaining interview defects are separate audit items and remain open. Auxiliary scanner windows retain their prior public shell routes; no native capture code was changed in this batch.

## Live configuration verified

Project: eslcatxyhshjlgukkfhc. Email login and signup are enabled; email confirmation is required; Google is disabled. The confirmation template contains a confirmation link. On 15 September 2026, custom SMTP was enabled using Brevo at smtp-relay.brevo.com:587, sender name AllyX, and verified sender ritikjainnewai97@gmail.com. Credentials are stored only in Supabase's encrypted SMTP settings. The minimum interval per user remains 60 seconds.

The existing site URL and callback remain unchanged. Added only the query-bearing form of that same hosted callback:

https://allyx-private-demo.vercel.app/auth/callback?**

This permits recovery and validated return-path parameters. Local development uses the existing publishable key in ignored .env.local. No service-role credentials are used.

## Validation

Follow-up diagnosis: the owner's 15 September signup attempt returned HTTP 200 with action user_repeated_signup. The account ritikjainnewai97@gmail.com was created and confirmed on 13 September. It needs ordinary sign-in, not signup confirmation. Signup and resend notices now distinguish request acceptance from actual email delivery without asserting whether an arbitrary address exists. Stale success text is cleared before resend.

- 17 tests pass: 10 authentication/navigation/callback tests plus 7 existing native privacy/platform regression tests.
- Production build passed after adding password recovery; final checks are recorded in the task response.
- Targeted ESLint and TypeScript checks pass.
- Browser: login, signup, and forgot-password navigation render; the disabled Google provider is absent; a synthetic invalid login returns “Invalid login credentials” and stays on the form.
- A password recovery email was requested from Supabase for ritikjainnewai97@gmail.com. Brevo's transactional log reports Sent and Delivered at 17:27 on 15 September 2026. Brevo rewrote the Gmail sender to ritikjainnewai97@12155900.brevosend.com. Inbox placement, opening the link, and completing the password update still require validation; no successful authenticated browser test is claimed yet.

## Deployment gate

### Additional case coverage

Client validation covers blank fields, whitespace-only names, short signup/reset passwords, and mismatched reset passwords. Sign-in retains support for existing passwords without imposing the new signup minimum. Login fields cannot change while a request is pending. Common provider errors have explicit UI messages: wrong credentials, unconfirmed email, signup disabled, sender restriction, email quota, request throttling, expired/reused codes, weak/same passwords, network failure, and server failure. Failed resend/reset requests also start a UI cooldown. Repeated signup retains a neutral response; it is not proof that an email was delivered. Callback processing is deduplicated, validates redirects, and requires link credentials for recovery. Temporary server authentication outages return 503 with a retry instruction instead of a logout redirect.

The owner created a Brevo account and verified the Gmail sender. Supabase SMTP configuration is saved, and a recovery email has a provider-reported Delivered event. Brevo shows a free allowance of 300 emails per day. Supabase's SMTP form indicated a 30-email-per-hour limit when enabling custom SMTP; the rate-limit page has not been independently rechecked. A custom sending domain remains preferable for distribution. Successful new-user signup and a complete password reset remain unverified.

Current automated coverage: 22 passing authentication and existing desktop regression tests. Live successful signup and password reset, mismatched browser/Electron link handling, and inbox receipt remain acceptance checks. Existing Google sign-in remains gated off until configured and desktop handoff implemented.

These source changes were deployed to production on 15 September 2026: deployment dpl_7iPRzveAQ8HtU97QcG2t8PXxff25, aliased to https://allyx-private-demo.vercel.app. Vercel reports READY. Production AI and Supabase environment variables were preserved. The installed desktop app loads this hosted revision when restarted.

Confirmation and recovery email templates now send token-hash links to the hosted callback, with the token in the URL fragment. The callback requires the user to press Continue before token verification, supports email and recovery tokens only, checks the resulting user, and routes recovery to the reset form. This avoids requiring the original browser's PKCE verifier for new email links. Legacy PKCE and implicit links remain supported. Templates were checked in Supabase's rendered preview after saving; full-editor selection and paste are necessary for Monaco, because accessibility setValue can replace only its visible input buffer.

Validation after release: 23 regression tests pass and targeted ESLint passes. Vercel's production build passed. The deployed login and forgot-password screens render, Google sign-in is absent, and the deployed reset request succeeds with a resend cooldown. Brevo reports Delivered for the live reset request at 17:38. Completing the owner's password reset and signing in with the new password are still user acceptance checks.

Final template verification: clean signup and recovery previews contain only the intended text and one token-hash link. The final recovery email is provider-reported Delivered at 17:41. Live invalid-token testing shows the Continue gate followed by an expired/used-link error. Direct reset-form access without a session shows a missing/expired-session error and offers a new reset link.

The repository's historical commit author email is invalid (Ritik); Vercel blocked deployment when reading that metadata. An identical source-only staging copy without .git was deployed successfully. No git history was rewritten.

Before rollout, complete the owner login test, verify reset-email delivery using the actual hosted revision, and preserve all existing AI/provider environment variables. The new Supabase SDK dependency requires Node 22 or newer. Current local runtime is Node 24.

Switching from localStorage-only auth to SSR cookies can require existing users to sign in once after rollout. Passwords and database accounts are unchanged. Google OAuth support is intentionally not advertised for this email/password demo.

Reference: [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
