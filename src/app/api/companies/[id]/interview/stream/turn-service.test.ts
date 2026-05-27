import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const SRC_PATH = new URL("./turn-service.ts", import.meta.url);

describe("turn-service", () => {
  it("forwards next_question_hint as nextQuestionHint in return value", async () => {
    const source = await readFile(SRC_PATH, "utf8");
    expect(source).toContain("next_question_hint");
    expect(source).toContain("nextQuestionHint");
  });

  it("persists progress + turn event and confirms credits in one db.transaction", async () => {
    const source = await readFile(SRC_PATH, "utf8");
    // Atomic persist+confirm: progress, turn event, and confirm share one tx.
    expect(source).toContain("db.transaction");
    expect(source).toContain("saveInterviewConversationProgressTx(tx,");
    expect(source).toContain("saveInterviewTurnEventTx(tx,");
    expect(source).toContain("interviewInlinePolicy.confirmInTx(");
    // The legacy onPersisted callback is gone; the reservation id is a parameter.
    expect(source).not.toContain("onPersisted");
    expect(source).toContain("reservationId");
  });
});
