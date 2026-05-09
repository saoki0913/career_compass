/**
 * Billing policy interface for feature-specific credit/quota handling.
 *
 * Each feature (motivation stream, ES review stream, etc.) implements this
 * contract so routes can precheck, reserve, confirm, or cancel billing
 * uniformly without the routes knowing the specific credit model.
 *
 * Implementations may use post-success consumption, up-front reservations, free
 * quota, or a mix of those mechanics. Routes should still depend on this
 * policy shape instead of importing credit lifecycle primitives directly.
 */

export type BillingOutcome =
  | { kind: "billable_success"; creditsConsumed: number; freeQuotaUsed: boolean }
  | { kind: "non_billable_success"; reason: string }
  | { kind: "failure"; reason: string };

export interface BillingPrecheckResult {
  ok: boolean;
  errorResponse?: Response;
  freeQuotaAvailable: boolean;
}

export interface BillingReserveResult {
  reservationId: string | null;
  errorResponse?: Response;
}

export interface BillingPolicy<TContext> {
  precheck(ctx: TContext): Promise<BillingPrecheckResult>;
  reserve?(ctx: TContext, creditCost: number): Promise<BillingReserveResult>;
  confirm(
    ctx: TContext,
    outcome: BillingOutcome,
    reservationId: string | null,
  ): Promise<void>;
  cancel(
    ctx: TContext,
    reservationId: string | null,
    reason: string,
  ): Promise<void>;
}
