# AllyX release acceptance

Complete this checklist for every public desktop release before changing the website download links.

## Release integrity

1. Confirm `package.json`, `src/lib/download-links.ts`, and `/api/desktop-compat` use the same version.
2. Download each release asset from the public website, not from a local build folder.
3. Confirm the downloaded filename and installed app version match the intended release tag.
4. Publish the web deployment only after the matching desktop installers exist.

## Sign-in

1. On macOS and Windows, choose **Continue with Google** from the desktop app.
2. Confirm the operating system opens the customer's default browser.
3. Confirm a saved Google account can be selected and that cancelling leaves the desktop email option usable.
4. Confirm the browser returns to AllyX and completes the PKCE sign-in without asking for credentials again.
5. Test email one-time-code sign-in, expired code, resend, and the back-to-email action.

## Audio and capture

Run each test on Apple Silicon macOS, Intel macOS when supported, and Windows 10/11.

1. Start microphone listening without enabling interviewer audio. Confirm only microphone transcription starts.
2. With two displays connected, select each display from **Interviewer audio** and confirm the chosen display is the one carrying meeting audio.
3. Revoke and restore screen/audio permission. Confirm the error states what action is required and no unrelated permission message appears.
4. Test microphone disconnect/reconnect, no meeting-audio track, and stopping/restarting interviewer audio.
5. Capture readable text, code, an empty region, and a selection crossing displays.
6. From a second meeting participant, test the overlay for every supported meeting application and sharing mode. Do not claim capture exclusion for a setup that has not passed this check.

## Customer journey

1. Create an account, save a resume and context, and start the introductory trial.
2. Verify the trial ends at ten minutes and does not reappear after a verified pack purchase.
3. Complete a verified Razorpay payment and verify credits, receipt, history, and payment email.
4. Start and end a paid interview after meaningful use. Verify one credit is used.
5. Report a bug without signing in and verify its support email and attachment arrive.

## Evidence to retain

Save the release tag, website URL, installer checksums, OS/build numbers, test date, tester, and any failed scenario. A release is not ready when an installer, OAuth return, audio source, capture flow, or payment confirmation fails.
