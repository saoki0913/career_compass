import { describe, it, expect } from "vitest";
import { parseSSEStream, type SSEEvent } from "./sse-stream-parser";

function createMockResponse(chunks: string[]): Response {
  let index = 0;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
  return new Response(stream);
}

async function collect(response: Response): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  for await (const event of parseSSEStream(response)) {
    events.push(event);
  }
  return events;
}

describe("parseSSEStream", () => {
  it("parses single-line SSE events", async () => {
    const response = createMockResponse([
      'data: {"type":"progress","step":"thinking"}\n',
      'data: {"type":"complete","data":{"ok":true}}\n',
    ]);
    const events = await collect(response);
    expect(events).toEqual([
      { type: "progress", step: "thinking" },
      { type: "complete", data: { ok: true } },
    ]);
  });

  it("handles chunk-split across event boundary", async () => {
    const response = createMockResponse([
      'data: {"type":"pro',
      'gress","step":"a"}\ndata: {"type":"complete"}\n',
    ]);
    const events = await collect(response);
    expect(events).toEqual([
      { type: "progress", step: "a" },
      { type: "complete" },
    ]);
  });

  it("skips invalid JSON lines", async () => {
    const response = createMockResponse([
      "data: not-json\n",
      'data: {"type":"ok"}\n',
    ]);
    const events = await collect(response);
    expect(events).toEqual([{ type: "ok" }]);
  });

  it("skips empty data lines", async () => {
    const response = createMockResponse([
      "data: \n",
      'data: {"type":"ok"}\n',
    ]);
    const events = await collect(response);
    expect(events).toEqual([{ type: "ok" }]);
  });

  it("ignores non-data lines", async () => {
    const response = createMockResponse([
      "event: message\n",
      "id: 1\n",
      'data: {"type":"ok"}\n',
    ]);
    const events = await collect(response);
    expect(events).toEqual([{ type: "ok" }]);
  });

  it("flushes trailing buffer data", async () => {
    const response = createMockResponse([
      'data: {"type":"first"}\n',
      'data: {"type":"last"}',
    ]);
    const events = await collect(response);
    expect(events).toEqual([{ type: "first" }, { type: "last" }]);
  });

  it("handles double newline separated SSE blocks", async () => {
    const response = createMockResponse([
      'data: {"type":"a"}\n\ndata: {"type":"b"}\n\n',
    ]);
    const events = await collect(response);
    expect(events).toEqual([{ type: "a" }, { type: "b" }]);
  });

  it("throws when response body is null", async () => {
    const response = new Response(null);
    await expect(collect(response)).rejects.toThrow("ストリームが取得できませんでした");
  });
});
