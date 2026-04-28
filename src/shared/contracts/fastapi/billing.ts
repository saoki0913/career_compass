import { z } from "zod";

export const postSuccessBillingPolicySchema = z.object({
  kind: z.literal("post_success"),
  creditsPerSuccess: z.number().int().positive(),
});

export const threePhaseBillingPolicySchema = z.object({
  kind: z.literal("three_phase"),
  reserveBeforeStream: z.literal(true),
});

export const freeBillingPolicySchema = z.object({
  kind: z.literal("free"),
});

export const streamBillingPolicySchema = z.discriminatedUnion("kind", [
  postSuccessBillingPolicySchema,
  threePhaseBillingPolicySchema,
  freeBillingPolicySchema,
]);

export type StreamBillingPolicyContract = z.infer<typeof streamBillingPolicySchema>;
