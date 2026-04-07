import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  continueInterviewStream,
  fetchInterviewData,
  fetchInterviewRoleOptions,
  generateInterviewFeedbackStream,
  resetInterviewConversation,
  saveInterviewFeedbackSatisfaction,
  sendInterviewAnswerStream,
  startInterviewStream,
} from "./client-api";

describe("interview client api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
  });

  it("uses the existing interview route contract with credentials", async () => {
    const signal = new AbortController().signal;

    await fetchInterviewData("company-1");
    await fetchInterviewRoleOptions("company-1");
    await startInterviewStream("company-1", { selectedRole: "営業" }, signal);
    await sendInterviewAnswerStream("company-1", { answer: "回答" }, signal);
    await generateInterviewFeedbackStream("company-1", signal);
    await continueInterviewStream("company-1", signal);
    await resetInterviewConversation("company-1");
    await saveInterviewFeedbackSatisfaction("company-1", {
      historyId: "history-1",
      satisfactionScore: 4,
    });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/companies/company-1/interview", {
      credentials: "include",
    });
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/companies/company-1/es-role-options", {
      credentials: "include",
    });
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "/api/companies/company-1/interview/start",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedRole: "営業" }),
        signal,
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      "/api/companies/company-1/interview/stream",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ answer: "回答" }),
        signal,
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      "/api/companies/company-1/interview/feedback",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({}),
        signal,
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      6,
      "/api/companies/company-1/interview/continue",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({}),
        signal,
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(7, "/api/companies/company-1/interview/reset", {
      method: "POST",
      credentials: "include",
    });
    expect(fetch).toHaveBeenNthCalledWith(
      8,
      "/api/companies/company-1/interview/feedback/satisfaction",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyId: "history-1", satisfactionScore: 4 }),
      }),
    );
  });
});
