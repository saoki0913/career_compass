import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";

export type InternalCostTelemetry = {
  feature?: string;
  est_usd_total?: number;
  est_jpy_total?: number;
  input_tokens_total?: number;
  output_tokens_total?: number;
  reasoning_tokens_total?: number;
  cached_input_tokens_total?: number;
  usage_status?: string;
  models_used?: string[];
};

export function getRequestId(request: Pick<NextRequest, "headers">): string {
  return request.headers.get("x-request-id")?.trim() || randomUUID();
}

export function splitInternalTelemetry<T extends Record<string, unknown>>(payload: T): {
  payload: Omit<T, "internal_telemetry">;
  telemetry: InternalCostTelemetry | null;
} {
  const telemetry = (payload.internal_telemetry ?? null) as InternalCostTelemetry | null;
  const rest = { ...payload };
  delete (rest as { internal_telemetry?: unknown }).internal_telemetry;
  return { payload: rest as Omit<T, "internal_telemetry">, telemetry };
}

type AiCreditCostSummaryLogArgs = {
  feature: string;
  requestId: string;
  status: "success" | "failed" | "cancelled";
  creditsUsed: number;
  telemetry?: InternalCostTelemetry | null;
};

export function logAiCreditCostSummary({
  feature,
  requestId,
  status,
  creditsUsed,
  telemetry,
}: AiCreditCostSummaryLogArgs): void {
  const estJpyTotal =
    typeof telemetry?.est_jpy_total === "number" ? telemetry.est_jpy_total : undefined;

  const payload: Record<string, unknown> = {
    event: "ai_credit_cost_summary",
    feature,
    requestId,
    status,
    creditsUsed,
    usageStatus: telemetry?.usage_status ?? "unavailable",
  };

  if (typeof estJpyTotal === "number") {
    payload.estJpyTotal = Number(estJpyTotal.toFixed(2));
  }

  if (creditsUsed > 0 && typeof estJpyTotal === "number") {
    payload.jpyPerCredit = Number((estJpyTotal / creditsUsed).toFixed(2));
  }

  if (Array.isArray(telemetry?.models_used) && telemetry.models_used.length > 0) {
    payload.modelsUsed = telemetry.models_used;
  }

  console.info(JSON.stringify(payload));
}
