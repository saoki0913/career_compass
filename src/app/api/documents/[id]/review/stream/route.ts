/**
 * Document AI Review SSE Stream API
 *
 * POST: Request AI review with real-time progress streaming
 */

import type { NextRequest } from "next/server";
import { handleReviewStream } from "@/app/api/documents/_services/handle-review-stream";

export { handleReviewStream } from "@/app/api/documents/_services/handle-review-stream";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleReviewStream(request, context, "/api/es/review/stream");
}
