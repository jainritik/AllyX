export function paymentConfirmationMessage(confirmation: {
    alreadyProcessed?: boolean;
    creditsAdded?: number;
    creditsRemaining?: number;
    debtRepaid?: number;
}, purchasedCredits: number) {
    const balance = Number.isInteger(confirmation.creditsRemaining)
        ? ` Available balance: ${confirmation.creditsRemaining} interview credits.` : "";
    if (confirmation.alreadyProcessed) {
        return `Payment confirmed for ${purchasedCredits} interview credits. This order was already processed; no duplicate credits were added.${balance}`;
    }
    const added = confirmation.creditsAdded;
    if (!Number.isInteger(added) || (added as number) < 0) {
        return "Payment received. Refresh Billing & Credits to confirm your updated balance.";
    }
    return `${added} interview credits added successfully.${confirmation.debtRepaid ? ` ${confirmation.debtRepaid} credits settled an outstanding credit adjustment.` : ""}${balance}`;
}
