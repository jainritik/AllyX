# Account-restricted ₹1 live payment validation

Razorpay Orders requires at least INR 1.00 (100 paise). The permanent testing-account offer discounts the existing Starter pack to ₹1 and retains its two interview credits. Standard plan prices are unchanged.

Enable only after the account owner confirms their account:

- Set `ALLYX_LIVE_PAYMENT_VALIDATION_USER_ID` to the confirmed Supabase Auth UUID (not an email address).
- Set a matching `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` for the activated live merchant. Keys must be entered in Vercel Production secrets, never committed or pasted into chat. Configure the live webhook URL `/api/billing/webhook` and matching signing secret.
- Redeploy. The account's Billing & Credits page shows Pay ₹1. Another account cannot see or request this offer.

The user completes the real payment. The server fixes the order amount at 100 paise, checks the gateway order response, and records the amount and normal Starter credits in the existing private ledger before returning checkout details. Existing signature verification, captured-payment checks, ownership, amount checks, and idempotent fulfillment apply. No migration or broad price reduction is needed.

The configured account may purchase the ₹1 Starter offer repeatedly, including after prior successful or refunded payments. There is no expiry. Other accounts cannot see or request this price. Pending orders do not grant credits. Never report a payment successful until gateway capture and ledger fulfillment are confirmed.

Disable only by removing `ALLYX_LIVE_PAYMENT_VALIDATION_USER_ID`. The obsolete expiry variable is ignored and has been removed from production. Verification of an already-created payment continues normally after eligibility is disabled. Do not rotate merchant credentials while orders from the previous merchant/mode remain pending without planning their reconciliation.

Prepared checks: account allowlisting, non-expiring repeat eligibility, live-key requirement, rejection of forged client prices/credits, and gateway-to-ledger amount consistency. As prepared, live credentials were not valid and the offer was not enabled. End-to-end payment/capture/refund behavior remains unverified until the owner pays and the result is inspected.
