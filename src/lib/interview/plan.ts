export type InterviewPlan = {
  interviewType: string;
  priorityTopics: string[];
  openingTopic: string | null;
  mustCoverTopics: string[];
  riskTopics: string[];
  suggestedTimeflow: string[];
};

export function normalizeInterviewPlanValue(value: unknown): InterviewPlan | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<InterviewPlan> & {
    interview_type?: unknown;
    priority_topics?: unknown;
    opening_topic?: unknown;
    must_cover_topics?: unknown;
    risk_topics?: unknown;
    suggested_timeflow?: unknown;
  };

  return {
    interviewType:
      typeof parsed.interviewType === "string"
        ? parsed.interviewType
        : typeof parsed.interview_type === "string"
          ? parsed.interview_type
          : "new_grad_behavioral",
    priorityTopics: Array.isArray(parsed.priorityTopics)
      ? parsed.priorityTopics.filter((item): item is string => typeof item === "string")
      : Array.isArray(parsed.priority_topics)
        ? parsed.priority_topics.filter((item): item is string => typeof item === "string")
        : [],
    openingTopic:
      typeof parsed.openingTopic === "string"
        ? parsed.openingTopic
        : typeof parsed.opening_topic === "string"
          ? parsed.opening_topic
          : null,
    mustCoverTopics: Array.isArray(parsed.mustCoverTopics)
      ? parsed.mustCoverTopics.filter((item): item is string => typeof item === "string")
      : Array.isArray(parsed.must_cover_topics)
        ? parsed.must_cover_topics.filter((item): item is string => typeof item === "string")
        : [],
    riskTopics: Array.isArray(parsed.riskTopics)
      ? parsed.riskTopics.filter((item): item is string => typeof item === "string")
      : Array.isArray(parsed.risk_topics)
        ? parsed.risk_topics.filter((item): item is string => typeof item === "string")
        : [],
    suggestedTimeflow: Array.isArray(parsed.suggestedTimeflow)
      ? parsed.suggestedTimeflow.filter((item): item is string => typeof item === "string")
      : Array.isArray(parsed.suggested_timeflow)
        ? parsed.suggested_timeflow.filter((item): item is string => typeof item === "string")
        : [],
  };
}
