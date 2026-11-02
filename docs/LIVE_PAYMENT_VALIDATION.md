# Account-restricted ₹1 live payment validation

Razorpay Orders requires at least INR 1.00 (100 paise). The optional live-validation offer discounts the existing Starter pack to ₹1 and retains its two interview credits. Standard plan prices are unchanged.

Enable only after the account owner confirms their account:

- Set `ALLYX_LIVE_PAYMENT_VALIDATION_USER_ID` to the confirmed Supabase Auth UUID (not an email address).
- Set `ALLYX_LIVE_PAYMENT_VALIDATION_EXPIRES_AT` to a short future ISO timestamp, normally 24 hours.
- Set a matching `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` for the activated live merchant. Keys must be entered in Vercel Production secrets, never committed or pasted into chat. Configure the live webhook URL `/api/billing/webhook` and matching signing secret.
- Redeploy. The account's Billing & Credits page shows Pay ₹1. Another account cannot see or request this offer.

The user completes the real payment. The server fixes the order amount at 100 paise, checks the gateway order response, and records the amount and normal Starter credits in the existing private ledger before returning checkout details. Existing signature verification, captured-payment checks, ownership, amount checks, and idempotent fulfillment apply. No migration or broad price reduction is needed.

After an authorized, paid, refunded, or disputed validation payment is found, the offer is no longer shown. This eligibility check is not an atomic guarantee against multiple already-open checkouts: the user should open and pay only one checkout. Pending orders do not grant credits. Never report a payment successful until gateway capture and ledger fulfillment are confirmed.

Disable by removing both validation variables or letting the expiry pass. Verification of an already-created payment continues normally, including after the offer is disabled. Do not rotate merchant credentials while orders from the previous merchant/mode remain pending without planning their reconciliation.

Prepared checks: account allowlisting, expiry, live-key requirement, rejection of forged client prices/credits, and gateway-to-ledger amount consistency. As prepared, live credentials were not valid and the offer was not enabled. End-to-end payment/capture/refund behavior remains unverified until the owner pays and the result is inspected.
