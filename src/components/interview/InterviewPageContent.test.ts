/**
 * InterviewPageContent - smoke test
 *
 * Verifies that the component module exports InterviewPageContent,
 * uses shared progress components, and that dead-code has been removed.
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("InterviewPageContent module", () => {
  it("exports InterviewPageContent", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");

    expect(source).toContain("export function InterviewPageContent");
  });

  it("renders a fail-closed persistence unavailable state", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");

    expect(source).toContain("availabilityIssue");
    expect(source).toContain("isInteractionBlocked");
    expect(source).toContain("企業詳細へ戻る");
    expect(source).toContain("window.location.reload()");
  });

  it("uses shared ConversationProgressBar and ConversationPhaseBar", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");

    expect(source).toContain("ConversationProgressBar");
    expect(source).toContain("ConversationPhaseBar");
  });

  it("does not contain removed dead code (InterviewProgressCard, lifecycleClass)", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("function InterviewProgressCard");
    expect(source).not.toContain("function lifecycleClass");
    expect(source).not.toContain("function getLifecycleStatus");
    expect(source).not.toContain("LIFECYCLE_PHASES");
    expect(source).not.toContain("InterviewLifecyclePhase");
  });

  it("keeps the started conversation branch free of non-chat panels", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");
    const startedBranchStart = source.indexOf("<div ref={conversationRef}");
    const startedBranchEnd = source.indexOf("conversationFooter=", startedBranchStart);
    const startedConversationBranch = source.slice(startedBranchStart, startedBranchEnd);

    expect(startedConversationBranch).toContain("<ChatMessage");
    expect(startedConversationBranch).toContain("<ThinkingIndicator");
    expect(startedConversationBranch).toContain("<StreamingChatMessage");
    expect(startedConversationBranch).not.toContain("前回の続きです");
    expect(startedConversationBranch).not.toContain("職種分類:");
    expect(startedConversationBranch).not.toContain("方式:");
    expect(startedConversationBranch).not.toContain("段階:");
    expect(startedConversationBranch).not.toContain("面接官:");
    expect(startedConversationBranch).not.toContain("厳しさ:");
    expect(startedConversationBranch).not.toContain("InterviewFeedbackCard");
    expect(startedConversationBranch).not.toContain("DrillPanel");
    expect(startedConversationBranch).not.toContain("面接対策を続ける");
    expect(startedConversationBranch).not.toContain("成長ダッシュボード");
  });
});
