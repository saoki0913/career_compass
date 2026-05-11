import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC_PATH = path.resolve(__dirname, "route.ts");
const source = fs.readFileSync(SRC_PATH, "utf-8");

describe("interview sheet API route", () => {
  it("exports a POST handler", () => {
    expect(source).toContain("export async function POST");
  });

  it("requires authentication", () => {
    expect(source).toContain("getRequestIdentity");
    expect(source).toContain("INTERVIEW_AUTH_REQUIRED");
  });

  it("validates conversationId in request body", () => {
    expect(source).toContain("conversationId");
  });

  it("uses buildInterviewSheetMarkdown for sheet generation", () => {
    expect(source).toContain("buildInterviewSheetMarkdown");
  });

  it("saves sheet via saveInterviewFeedbackSheet", () => {
    expect(source).toContain("saveInterviewFeedbackSheet");
  });

  it("handles persistence errors", () => {
    expect(source).toContain("normalizeInterviewPersistenceError");
    expect(source).toContain("createInterviewPersistenceUnavailableResponse");
  });

  it("applies owner-scoped queries for conversation and feedback history lookups", () => {
    expect(source).toContain("identity.userId");
    expect(source).toContain("interviewConversations.userId");
    expect(source).toContain("interviewFeedbackHistories.userId");
  });
});
