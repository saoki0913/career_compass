import { describe, expect, it } from "vitest";

import { appendOptimisticUserMessage, rollbackOptimisticMessageById } from "./optimistic-message";

describe("optimistic message helpers", () => {
  it("appends an optimistic user message and returns its id", () => {
    const result = appendOptimisticUserMessage(
      [{ id: "a", role: "assistant", content: "質問" }],
      "optimistic",
      (id) => ({ id, role: "user" as const, content: "回答です", isOptimistic: true }),
    );

    expect(result.optimisticId).toMatch(/^optimistic-/);
    expect(result.messages).toEqual([
      { id: "a", role: "assistant", content: "質問" },
      {
        id: result.optimisticId,
        role: "user",
        content: "回答です",
        isOptimistic: true,
      },
    ]);
  });

  it("rolls back only the target optimistic message", () => {
    expect(
      rollbackOptimisticMessageById(
        [
          { id: "keep", role: "assistant", content: "質問" },
          { id: "optimistic-1", role: "user", content: "回答1" },
          { id: "optimistic-2", role: "user", content: "回答2" },
        ],
        "optimistic-1",
      ),
    ).toEqual([
      { id: "keep", role: "assistant", content: "質問" },
      { id: "optimistic-2", role: "user", content: "回答2" },
    ]);
  });
});
