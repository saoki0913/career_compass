import { describe, expect, it } from "vitest";

import {
  deriveInterviewWeakestAxis,
  normalizeInterviewCompanyId,
  useInterviewViewModel,
} from "./useInterviewViewModel";

describe("useInterviewViewModel derivations", () => {
  it("normalizes App Router dynamic params", () => {
    expect(normalizeInterviewCompanyId(" company-1 ")).toBe("company-1");
    expect(normalizeInterviewCompanyId(["company-2", "ignored"])).toBe("company-2");
    expect(normalizeInterviewCompanyId("   ")).toBeNull();
    expect(normalizeInterviewCompanyId(undefined)).toBeNull();
  });

  it("derives the weakest numeric feedback axis", () => {
    expect(
      deriveInterviewWeakestAxis({
        company_fit: 4,
        role_fit: 2,
        specificity: 3,
      }),
    ).toBe("role_fit");
  });

  it("combines normalized company id and weakest axis with progress derivations", () => {
    const vm = useInterviewViewModel({
      companyId: [" company-3 "],
      feedback: {
        overall_comment: "",
        scores: {
          logic: 5,
          persuasiveness: 1,
        },
        strengths: [],
        improvements: [],
        consistency_risks: [],
        improved_answer: "",
        next_preparation: [],
      },
      stageStatus: {
        currentTopicLabel: "leadership",
        coveredTopics: ["motivation"],
        remainingTopics: ["teamwork"],
      },
      questionCount: 3,
      questionFlowCompleted: false,
      hasStarted: true,
    });

    expect(vm.normalizedCompanyId).toBe("company-3");
    expect(vm.weakestAxis).toBe("persuasiveness");
    expect(vm.topicStages).toHaveLength(3);
    expect(vm.topicStages[0]).toMatchObject({ label: "志望動機", status: "done" });
    expect(vm.topicStages[1]).toMatchObject({ label: "リーダーシップ", status: "current" });
    expect(vm.topicStages[2]).toMatchObject({ label: "チームワーク", status: "pending" });
    expect(vm.interviewPhases).toHaveLength(4);
    // feedback 受領済みのため面接ライフサイクルは terminal（全フェーズ done になる）
    expect(vm.interviewPhases[0]).toMatchObject({ key: "setup", status: "done" });
    expect(vm.interviewPhases[1]).toMatchObject({ key: "questions", status: "done" });
    expect(vm.questionDisplay).toBe("3問目 / 約15問");
    expect(vm.coachingNarrative).toBe("リーダーシップについて確認しています。");
  });

  it("returns defaults when stageStatus is null and not started", () => {
    const vm = useInterviewViewModel({
      companyId: "company-4",
      feedback: null,
      stageStatus: null,
      questionCount: 0,
      questionFlowCompleted: false,
      hasStarted: false,
    });

    expect(vm.normalizedCompanyId).toBe("company-4");
    expect(vm.weakestAxis).toBeNull();
    expect(vm.topicStages).toEqual([]);
    expect(vm.interviewPhases[0]).toMatchObject({ key: "setup", status: "current" });
    expect(vm.questionDisplay).toBe("開始前");
    expect(vm.coachingNarrative).toBe("初回質問を準備中");
  });

  it("marks the complete phase as done when feedback is received (terminal done, bug1)", () => {
    const vm = useInterviewViewModel({
      companyId: "company-5",
      feedback: {
        overall_comment: "",
        scores: { logic: 4 },
        strengths: [],
        improvements: [],
        consistency_risks: [],
        improved_answer: "",
        next_preparation: [],
      },
      stageStatus: null,
      questionCount: 10,
      questionFlowCompleted: true,
      hasStarted: true,
    });

    expect(vm.interviewPhases).toHaveLength(4);
    expect(vm.interviewPhases[2]).toMatchObject({ key: "feedback", status: "done" });
    expect(vm.interviewPhases[3]).toMatchObject({ key: "complete", status: "done" });
  });
});
