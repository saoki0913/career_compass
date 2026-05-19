import { z } from "zod";
import { ES_REVIEW_TEMPLATE_TYPES } from "@/shared/contracts/es-review-sse";

const nullableString = z.string().nullable().optional();

const templateRequestSchema = z.object({
  template_type: z.enum(ES_REVIEW_TEMPLATE_TYPES),
  company_name: nullableString,
  industry: nullableString,
  question: z.string().min(1),
  answer: z.string().min(1),
  char_min: z.number().int().nonnegative().nullable().optional(),
  char_max: z.number().int().positive().nullable().optional(),
  intern_name: nullableString,
  role_name: nullableString,
  inferred_template_type: z.enum(ES_REVIEW_TEMPLATE_TYPES).optional(),
  inferred_confidence: z.enum(["high", "medium", "low"]).optional(),
  secondary_template_types: z.array(z.enum(ES_REVIEW_TEMPLATE_TYPES)).default([]),
  classification_rationale: nullableString,
  recommended_grounding_level: z.enum(["none", "light", "standard", "deep"]).optional(),
}).strict();

const roleContextSchema = z.object({
  primary_role: z.string().optional(),
  role_candidates: z.array(z.string()),
  source: z.enum(["user_input", "none"]),
}).strict();

const documentSectionSchema = z.object({
  title: z.string(),
  content: z.string(),
}).strict();

export const esReviewStreamRequestSchema = z.object({
  content: z.string().min(6).max(1500),
  section_id: z.string().optional(),
  document_id: z.string().optional(),
  company_id: z.string().nullable().optional(),
  section_title: z.string().min(1).max(300),
  section_char_limit: z.number().int().positive().max(1500).nullable().optional(),
  template_request: templateRequestSchema.nullable().optional(),
  role_context: roleContextSchema.nullable().optional(),
  retrieval_query: z.string().nullable().optional(),
  profile_context: z.unknown().nullable().optional(),
  gakuchika_context: z.array(z.unknown()).default([]),
  document_context: z.object({
    other_sections: z.array(documentSectionSchema),
  }).strict().nullable().optional(),
  llm_model: z.string().nullable().optional(),
  user_provided_corporate_urls: z.array(z.string()),
}).strict();

export type EsReviewStreamRequest = z.infer<typeof esReviewStreamRequestSchema>;
