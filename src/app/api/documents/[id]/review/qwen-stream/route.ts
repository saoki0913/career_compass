import { NextRequest } from "next/server";

import { handleReviewStream } from "../stream/route";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.QWEN_ES_REVIEW_ENABLED !== "true") {
    return new Response(
      JSON.stringify({ error: "Qwen3 ES添削 beta はまだ有効化されていません" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  return handleReviewStream(request, { params }, "/api/es/review/qwen/stream");
}
