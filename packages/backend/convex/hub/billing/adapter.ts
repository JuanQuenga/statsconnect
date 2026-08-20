export type BillingEntitlementStatus =
  | "active"
  | "grace_period"
  | "past_due"
  | "canceled"
  | "expired";

/**
 * Provider adapters verify their own signatures and normalize only this data.
 * They never grant access directly and never expose webhook secrets to Convex
 * queries or mutations.
 */
export type BillingEntitlementUpdate = {
  provider: string;
  eventId: string;
  occurredAt: number;
  subject: string;
  customerRef?: string;
  subscriptionRef?: string;
  status: BillingEntitlementStatus;
  expiresAt?: number;
  cancelAtPeriodEnd: boolean;
  canceledAt?: number;
};

export interface PaymentProviderWebhookAdapter<Input> {
  verifyAndNormalize(input: Input): Promise<BillingEntitlementUpdate | null>;
}
