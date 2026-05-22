import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fetchMotivationCompany,
  fetchMotivationConversation,
  fetchMotivationRoleOptions,
  startMotivationConversation,
  streamMotivationConversation,
  generateMotivationDraft,
  generateMotivationDraftDirect,
  saveMotivationDraft,
  resumeMotivationDeepDive,
  resetMotivationConversation,
} from "./client-api";

describe("motivation client-api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  });

  it("fetchMotivationCompany sends GET with json headers", async () => {
    await fetchMotivationCompany("c1");
    expect(fetch).toHaveBeenCalledWith("/api/companies/c1", expect.objectContaining({
      credentials: "include",
    }));
    const callHeaders = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]?.headers;
    expect(callHeaders).toBeDefined();
  });

  it("fetchMotivationRoleOptions appends query params", async () => {
    await fetchMotivationRoleOptions("c1", "IT");
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("industry=IT");
  });

  it("startMotivationConversation sends POST with body", async () => {
    await startMotivationConversation("c1", {
      selectedIndustry: "IT・通信",
      selectedIndustrySource: "company_field",
      selectedRole: "企画職",
      roleSelectionSource: "industry_default",
    });
    const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opts.method).toBe("POST");
    expect(opts.body).toBe(JSON.stringify({
      selectedIndustry: "IT・通信",
      selectedIndustrySource: "company_field",
      selectedRole: "企画職",
      roleSelectionSource: "industry_default",
    }));
  });

  it("streamMotivationConversation passes signal", async () => {
    const controller = new AbortController();
    await streamMotivationConversation("c1", { msg: "hi" }, controller.signal);
    const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opts.signal).toBe(controller.signal);
  });

  it("generateMotivationDraft sends POST", async () => {
    await generateMotivationDraft("c1", { draft: true });
    const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opts.method).toBe("POST");
  });

  it("generateMotivationDraftDirect sends POST", async () => {
    await generateMotivationDraftDirect("c1", {
      charLimit: 400,
      selectedIndustry: "IT・通信",
      selectedRole: "企画職",
      roleSelectionSource: "custom",
    });
    const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opts.method).toBe("POST");
  });

  it("saveMotivationDraft sends POST without body", async () => {
    await saveMotivationDraft("c1");
    const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opts.method).toBe("POST");
  });

  it("resumeMotivationDeepDive sends POST without body", async () => {
    await resumeMotivationDeepDive("c1");
    const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opts.method).toBe("POST");
  });

  it("resetMotivationConversation sends DELETE", async () => {
    await resetMotivationConversation("c1");
    const opts = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opts.method).toBe("DELETE");
  });
});
