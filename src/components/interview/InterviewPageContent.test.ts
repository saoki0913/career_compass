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

  it("does not contain removed dead code (InterviewProgressCard, lifecycleClass, InterviewFeedbackCard)", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("function InterviewProgressCard");
    expect(source).not.toContain("function lifecycleClass");
    expect(source).not.toContain("function getLifecycleStatus");
    expect(source).not.toContain("LIFECYCLE_PHASES");
    expect(source).not.toContain("InterviewLifecyclePhase");
    expect(source).not.toContain("function InterviewFeedbackCard");
    expect(source).not.toContain("function FeedbackEvidenceList");
    expect(source).not.toContain("function feedbackFromHistory");
  });

  it("uses GenerationModal for feedback generation and SheetViewerDialog for history", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");

    expect(source).toContain("GenerationModal");
    expect(source).toContain("SheetViewer");
    expect(source).toContain("SheetViewerDialog");
    expect(source).not.toContain("InterviewFeedbackCard");
  });

  it("no longer contains inline labelWeakestQuestionType (moved to SheetViewer)", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");

    expect(source).not.toContain("labelWeakestQuestionType");
    expect(source).not.toMatch(/最も弱かった設問タイプ: \{feedback\.weakest_question_type\}/);
    expect(source).not.toMatch(/最も弱かった設問タイプ: \{selectedHistory\.weakestQuestionType\}/);
  });

  it("uses nextQuestionHint instead of shortCoaching.next_edit for hint display", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");

    expect(source).toContain("nextQuestionHint");
    expect(source).not.toContain("shortCoaching?.next_edit");
    expect(source).not.toContain("shortCoaching.next_edit");
  });

  it("uses まとめシート labels instead of 最終講評", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");

    expect(source).toContain("まとめシートを作成");
    expect(source).not.toContain("最終講評を作成");
    expect(source).not.toContain("最終講評を生成しました");
  });

  it("renders the role picker through the extracted RoleSelector component", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");

    expect(source).toContain("RoleSelector");
    expect(source).toContain('from "@/components/interview/RoleSelector"');
    // wiring: candidate select / clear / custom-input callbacks map to the controller actions
    expect(source).toMatch(/onSelectRole=\{\(value\) => selectRole\(value, ROLE_SELECT_UNSET\)\}/);
    expect(source).toMatch(/onClearRole=\{\(\) => selectRole\(ROLE_SELECT_UNSET, ROLE_SELECT_UNSET\)\}/);
    expect(source).toContain("onCustomRoleChange={setCustomRoleName}");
    // fallback metadata flows through from the response without new controller responsibilities
    expect(source).toContain("isFallback={roleOptionsData?.isFallback}");
    expect(source).toContain("fallbackReason={roleOptionsData?.fallbackReason}");
  });

  it("no longer hand-rolls the role Select/Input or its sentinel mapping inline", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");

    // the previous inline role picker referenced these; they must be gone from the page
    expect(source).not.toContain("候補にない場合は自由入力");
    expect(source).not.toMatch(/roleSelectionSource === "custom" \? ROLE_SELECT_UNSET/);
  });

  it("drops Input and grouped-Select imports that became dead after extraction", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");

    expect(source).not.toContain('import { Input } from "@/components/ui/input"');
    expect(source).not.toContain("SelectGroup");
    expect(source).not.toContain("SelectLabel");
    // the other setup dropdowns still rely on these primitives
    expect(source).toContain("SelectTrigger");
    expect(source).toContain("SelectValue");
  });

  it("keeps the started conversation branch free of non-chat panels", async () => {
    const source = await readFile(new URL("./InterviewPageContent.tsx", import.meta.url), "utf8");
    const startedBranchStart = source.indexOf("<div ref={conversationRef}");
    const startedBranchEnd = source.indexOf("composer=", startedBranchStart);
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
