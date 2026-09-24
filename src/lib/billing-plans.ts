export const BILLING_PLANS = {
    starter: { id: "starter", name: "2 Interviews", amount: 100000, displayPrice: "₹1,000", credits: 2 },
    growth: { id: "growth", name: "5 Interviews", amount: 200000, displayPrice: "₹2,000", credits: 5 },
    pro: { id: "pro", name: "10 Interviews", amount: 350000, displayPrice: "₹3,500", credits: 10 },
} as const;

export type BillingPlanId = keyof typeof BILLING_PLANS;

export function isBillingPlanId(value: unknown): value is BillingPlanId {
    return typeof value === "string" && value in BILLING_PLANS;
}
