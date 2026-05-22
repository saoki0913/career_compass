import { z } from "zod";
import { roleSelectionSourceSchema } from "@/shared/contracts/interview/role-options";

export const motivationIndustrySourceSchema = z.enum([
  "company_field",
  "company_override",
  "user_selected",
]);

export const motivationRoleContextSourceSchema = z.enum([
  "profile",
  "company_doc",
  "application_job_type",
  "user_free_text",
]);

export const motivationRoleRequestSourceSchema = z.union([
  roleSelectionSourceSchema,
  motivationRoleContextSourceSchema,
]);

const nullableTrimmedStringSchema = z
  .string()
  .trim()
  .min(1)
  .nullish()
  .transform((value) => value ?? null);

export const motivationSetupRequestSchema = z
  .object({
    selectedIndustry: nullableTrimmedStringSchema,
    selectedIndustrySource: motivationIndustrySourceSchema.nullish().transform((value) => value ?? null),
    selectedRole: z.string().trim().min(1),
    roleSelectionSource: motivationRoleRequestSourceSchema.nullish().transform((value) => value ?? null),
  })
  .strict()
  .refine(
    (value) => value.selectedIndustrySource !== "user_selected" || value.selectedIndustry !== null,
    {
      message: "selectedIndustry is required when selectedIndustrySource is user_selected",
      path: ["selectedIndustry"],
    },
  );

export const motivationDraftDirectRequestSchema = motivationSetupRequestSchema.extend({
  charLimit: z.union([z.literal(300), z.literal(400), z.literal(500)]).optional(),
});

export type MotivationRoleContextSource = z.infer<typeof motivationRoleContextSourceSchema>;
export type MotivationRoleRequestSource = z.infer<typeof motivationRoleRequestSourceSchema>;
export type MotivationSetupRequest = z.infer<typeof motivationSetupRequestSchema>;
export type MotivationDraftDirectRequest = z.infer<typeof motivationDraftDirectRequestSchema>;

export type MotivationSetupRequestPayload = {
  selectedIndustry?: string | null;
  selectedIndustrySource?: z.infer<typeof motivationIndustrySourceSchema> | null;
  selectedRole: string;
  roleSelectionSource?: MotivationRoleRequestSource | null;
};

export type MotivationDraftDirectRequestPayload = MotivationSetupRequestPayload & {
  charLimit?: 300 | 400 | 500;
};

export function toMotivationRoleContextSource(
  source: MotivationRoleRequestSource | null | undefined,
): MotivationRoleContextSource | null {
  switch (source) {
    case "custom":
    case "user_free_text":
      return "user_free_text";
    case "application_job_type":
      return "application_job_type";
    case "profile":
      return "profile";
    case "company_doc":
      return "company_doc";
    case "industry_default":
    case "company_override":
    case "document_job_type":
    case null:
    case undefined:
      return null;
  }
}
