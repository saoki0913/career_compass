import { z } from "zod";

const eventBaseSchema = z.object({
  type: z.string().min(1),
});

export const progressEventSchema = eventBaseSchema
  .extend({
    type: z.literal("progress"),
  })
  .passthrough();

export const stringChunkEventSchema = eventBaseSchema
  .extend({
    type: z.literal("string_chunk"),
    text: z.string(),
    path: z.string().optional(),
  })
  .passthrough();

export const errorEventSchema = eventBaseSchema
  .extend({
    type: z.literal("error"),
    message: z.string().min(1).optional(),
  })
  .passthrough();

export const fieldCompleteEventSchema = eventBaseSchema
  .extend({
    type: z.literal("field_complete"),
    path: z.string().min(1),
    value: z.unknown(),
  })
  .passthrough()
  .superRefine((event, ctx) => {
    if (event.path === "remaining_questions_estimate") {
      const value = event.value;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "remaining_questions_estimate must be a non-negative integer",
        });
      }
    }
  });

const genericRecordSchema = z.object({}).catchall(z.unknown());

const gakuchikaCompleteDataSchema = z.object({
  question: z.string(),
  conversation_state: genericRecordSchema.extend({
    remaining_questions_estimate: z.number().int().nonnegative().optional(),
  }),
  next_action: z.string(),
});

export const gakuchikaCompleteEventSchema = eventBaseSchema.extend({
  type: z.literal("complete"),
  data: gakuchikaCompleteDataSchema,
});

const motivationCompleteDataSchema = genericRecordSchema.extend({
  question: z.string().optional(),
  nextAction: z.string().optional(),
});

export const motivationCompleteEventSchema = eventBaseSchema.extend({
  type: z.literal("complete"),
  data: motivationCompleteDataSchema,
});

const interviewCompleteDataSchema = genericRecordSchema.extend({
  turn_state: genericRecordSchema.optional(),
  turn_meta: genericRecordSchema.optional(),
  interview_plan: genericRecordSchema.optional(),
  question_stage: z.string().optional(),
});

export const interviewCompleteEventSchema = eventBaseSchema.extend({
  type: z.literal("complete"),
  data: interviewCompleteDataSchema,
});

export const esReviewCompleteEventSchema = eventBaseSchema.extend({
  type: z.literal("complete"),
  result: genericRecordSchema,
});

export const fastApiStreamEventSchema = z.union([
  progressEventSchema,
  stringChunkEventSchema,
  fieldCompleteEventSchema,
  errorEventSchema,
  esReviewCompleteEventSchema,
  gakuchikaCompleteEventSchema,
  interviewCompleteEventSchema,
  motivationCompleteEventSchema,
]);

const GAKUCHIKA_FIELD_COMPLETE_PATHS = new Set([
  "focus_key",
  "progress_label",
  "answer_hint",
  "ready_for_draft",
  "draft_readiness_reason",
  "deepdive_stage",
  "coach_progress_message",
  "remaining_questions_estimate",
]);

export function getGakuchikaFieldCompletePatch(
  event: unknown,
): Record<string, unknown> | null {
  const parsed = fieldCompleteEventSchema.safeParse(event);
  if (!parsed.success) return null;
  if (!GAKUCHIKA_FIELD_COMPLETE_PATHS.has(parsed.data.path)) return null;
  return { [parsed.data.path]: parsed.data.value };
}

export type FastApiStreamEventContract = z.infer<typeof fastApiStreamEventSchema>;
export type GakuchikaFieldCompletePatch = ReturnType<typeof getGakuchikaFieldCompletePatch>;
