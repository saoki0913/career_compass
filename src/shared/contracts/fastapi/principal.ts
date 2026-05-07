import { z } from "zod";

export const careerPrincipalScopeSchema = z.enum(["company", "ai-stream"]);
export const careerPrincipalActorKindSchema = z.enum(["user", "guest"]);
export const careerPrincipalPlanSchema = z.enum(["guest", "free", "standard", "pro"]);

export const careerPrincipalActorSchema = z.object({
  kind: careerPrincipalActorKindSchema,
  id: z.string().min(1),
});

export const careerPrincipalPayloadSchema = z
  .object({
    scope: careerPrincipalScopeSchema,
    actor: careerPrincipalActorSchema,
    plan: careerPrincipalPlanSchema,
    company_id: z.string().min(1).nullable(),
    iat: z.number().int(),
    nbf: z.number().int(),
    exp: z.number().int(),
    jti: z.string().min(1),
  })
  .superRefine((payload, ctx) => {
    if (payload.scope === "company" && !payload.company_id) {
      ctx.addIssue({
        code: "custom",
        path: ["company_id"],
        message: "company scope requires company_id",
      });
    }
  });

export type CareerPrincipalPayloadContract = z.infer<typeof careerPrincipalPayloadSchema>;
