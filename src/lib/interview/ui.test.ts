import { describe, expect, it } from "vitest";

import type { InterviewStageStatus } from "@/lib/interview/session";

import {
  buildInterviewTopicStages,
  buildInterviewPhases,
  buildInterviewQuestionDisplay,
  buildInterviewCoachingNarrative,
  labelWeakestQuestionType,
} from "./ui";

// ---------------------------------------------------------------------------
// buildInterviewTopicStages
// ---------------------------------------------------------------------------

describe("buildInterviewTopicStages", () => {
  it("returns empty array when stageStatus is null", () => {
    expect(buildInterviewTopicStages(null, false)).toEqual([]);
  });

  it("marks covered topics as done and remaining as pending", () => {
    const stageStatus: InterviewStageStatus = {
      currentTopicLabel: "leadership",
      coveredTopics: ["motivation"],
      remainingTopics: ["teamwork"],
    };
    const result = buildInterviewTopicStages(stageStatus, false);
    expect(result).toEqual([
      { key: "topic-0-motivation", label: "motivation", status: "done" },
      { key: "topic-1-leadership", label: "leadership", status: "current" },
      { key: "topic-2-teamwork", label: "teamwork", status: "pending" },
    ]);
  });

  it("marks current topic as done when questionFlowCompleted and topic is covered", () => {
    const stageStatus: InterviewStageStatus = {
      currentTopicLabel: "leadership",
      coveredTopics: ["motivation", "leadership"],
      remainingTopics: [],
    };
    const result = buildInterviewTopicStages(stageStatus, true);
    expect(result[1]).toMatchObject({
      label: "leadership",
      status: "done",
    });
  });

  it("marks current topic as pending when questionFlowCompleted but topic not covered", () => {
    const stageStatus: InterviewStageStatus = {
      currentTopicLabel: "leadership",
      coveredTopics: ["motivation"],
      remainingTopics: [],
    };
    const result = buildInterviewTopicStages(stageStatus, true);
    expect(result[1]).toMatchObject({
      label: "leadership",
      status: "pending",
    });
  });

  it("deduplicates topics appearing in multiple arrays", () => {
    const stageStatus: InterviewStageStatus = {
      currentTopicLabel: "motivation",
      coveredTopics: ["motivation"],
      remainingTopics: ["motivation", "teamwork"],
    };
    const result = buildInterviewTopicStages(stageStatus, false);
    const labels = result.map((s) => s.label);
    expect(labels).toEqual(["motivation", "teamwork"]);
  });

  it("handles null currentTopicLabel", () => {
    const stageStatus: InterviewStageStatus = {
      currentTopicLabel: null,
      coveredTopics: ["motivation"],
      remainingTopics: ["teamwork"],
    };
    const result = buildInterviewTopicStages(stageStatus, false);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ label: "motivation", status: "done" });
    expect(result[1]).toMatchObject({ label: "teamwork", status: "pending" });
  });
});

// ---------------------------------------------------------------------------
// buildInterviewPhases
// ---------------------------------------------------------------------------

describe("buildInterviewPhases", () => {
  it("returns setup as current when not started", () => {
    const phases = buildInterviewPhases(false, false, false);
    expect(phases).toHaveLength(4);
    expect(phases[0]).toMatchObject({ key: "setup", status: "current" });
    expect(phases[1]).toMatchObject({ key: "questions", status: "pending" });
    expect(phases[2]).toMatchObject({ key: "feedback", status: "pending" });
    expect(phases[3]).toMatchObject({ key: "complete", status: "pending" });
  });

  it("marks questions as current when started", () => {
    const phases = buildInterviewPhases(true, false, false);
    expect(phases[0]).toMatchObject({ key: "setup", status: "done" });
    expect(phases[1]).toMatchObject({ key: "questions", status: "current" });
  });

  it("marks feedback as current when questions completed", () => {
    const phases = buildInterviewPhases(true, true, false);
    expect(phases[1]).toMatchObject({ key: "questions", status: "done" });
    expect(phases[2]).toMatchObject({ key: "feedback", status: "current" });
  });

  it("marks all done when feedback received", () => {
    const phases = buildInterviewPhases(true, true, true);
    expect(phases.every((p) => p.status === "done")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildInterviewQuestionDisplay
// ---------------------------------------------------------------------------

describe("buildInterviewQuestionDisplay", () => {
  it("returns placeholder when questionCount is 0", () => {
    expect(buildInterviewQuestionDisplay(0, null)).toBe("開始前");
  });

  it("formats question count and total estimate", () => {
    const stageStatus: InterviewStageStatus = {
      currentTopicLabel: "leadership",
      coveredTopics: ["motivation"],
      remainingTopics: ["teamwork", "strengths"],
    };
    const result = buildInterviewQuestionDisplay(2, stageStatus);
    expect(result).toBe("2問目 / 約3問");
  });

  it("uses questionCount as floor for total estimate", () => {
    const stageStatus: InterviewStageStatus = {
      currentTopicLabel: null,
      coveredTopics: [],
      remainingTopics: [],
    };
    const result = buildInterviewQuestionDisplay(5, stageStatus);
    expect(result).toBe("5問目 / 約5問");
  });
});

// ---------------------------------------------------------------------------
// buildInterviewCoachingNarrative
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// labelWeakestQuestionType
// ---------------------------------------------------------------------------

describe("labelWeakestQuestionType", () => {
  it("returns null for null/undefined input", () => {
    expect(labelWeakestQuestionType(null)).toBeNull();
    expect(labelWeakestQuestionType(undefined)).toBeNull();
  });

  it("maps known internal keys to Japanese labels", () => {
    expect(labelWeakestQuestionType("motivation")).toBe("志望動機");
    expect(labelWeakestQuestionType("gakuchika")).toBe("ガクチカ");
    expect(labelWeakestQuestionType("academic")).toBe("学業・成績");
    expect(labelWeakestQuestionType("research")).toBe("研究");
    expect(labelWeakestQuestionType("personal")).toBe("人物像");
    expect(labelWeakestQuestionType("career")).toBe("キャリア");
    expect(labelWeakestQuestionType("case")).toBe("ケース");
    expect(labelWeakestQuestionType("life_history")).toBe("自分史");
    expect(labelWeakestQuestionType("technical")).toBe("技術・専門");
  });

  it("passes through unknown strings unchanged", () => {
    expect(labelWeakestQuestionType("unknown_type")).toBe("unknown_type");
  });

  it("returns empty string for empty string input", () => {
    expect(labelWeakestQuestionType("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildInterviewCoachingNarrative
// ---------------------------------------------------------------------------

describe("buildInterviewCoachingNarrative", () => {
  it("returns preparation message when questionCount is 0 and no current topic", () => {
    expect(buildInterviewCoachingNarrative(null, 0)).toBe("初回質問を準備中");
  });

  it("returns null when no current topic and questionCount > 0", () => {
    expect(buildInterviewCoachingNarrative(null, 3)).toBeNull();
  });

  it("returns completion message when current topic is in covered", () => {
    const stageStatus: InterviewStageStatus = {
      currentTopicLabel: "motivation",
      coveredTopics: ["motivation"],
      remainingTopics: [],
    };
    expect(buildInterviewCoachingNarrative(stageStatus, 3)).toBe(
      "motivationの深掘りが完了しました。",
    );
  });

  it("returns in-progress message when current topic is not yet covered", () => {
    const stageStatus: InterviewStageStatus = {
      currentTopicLabel: "leadership",
      coveredTopics: ["motivation"],
      remainingTopics: ["teamwork"],
    };
    expect(buildInterviewCoachingNarrative(stageStatus, 2)).toBe(
      "leadershipについて確認しています。",
    );
  });
});
