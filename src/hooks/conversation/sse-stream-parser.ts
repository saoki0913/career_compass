export type SSEEvent = { type: string; [key: string]: unknown };

export async function* parseSSEStream(
  response: Response,
): AsyncGenerator<SSEEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ストリームが取得できませんでした");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        let event: SSEEvent;
        try {
          event = JSON.parse(jsonStr);
        } catch {
          continue;
        }
        yield event;
      }
    }

    if (buffer.startsWith("data: ")) {
      const jsonStr = buffer.slice(6).trim();
      if (jsonStr) {
        try {
          yield JSON.parse(jsonStr);
        } catch {
          // trailing malformed data
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
