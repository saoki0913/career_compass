import { describe, expect, it } from "vitest";
import { buildDeadlineEventDraft, buildWorkBlockEventDraft } from "./sync-provider";

// Minimal shape matching Awaited<ReturnType<typeof getDeadlineForSync>>
type DeadlineForSync = {
  id: string;
  userId: string;
  title: string;
  dueDate: Date;
  sourceUrl: string | null;
  isConfirmed: boolean;
  googleCalendarId: string | null;
  googleEventId: string | null;
  googleSyncStatus: string | null;
  companyName: string;
};

// Minimal shape matching Awaited<ReturnType<typeof getWorkBlockForSync>>
type WorkBlockForSync = {
  id: string;
  userId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  googleCalendarId: string | null;
  googleEventId: string | null;
  googleSyncStatus: string | null;
};

describe("buildDeadlineEventDraft", () => {
  it("returns null when deadline is null", () => {
    expect(buildDeadlineEventDraft(null)).toBeNull();
  });

  it("builds a draft with title composed of companyName and deadline title", () => {
    const dueDate = new Date("2026-05-01T09:00:00.000Z");
    const deadline: DeadlineForSync = {
      id: "deadline-1",
      userId: "user-1",
      title: "ES提出",
      dueDate,
      sourceUrl: "https://example.com/jobs",
      isConfirmed: true,
      googleCalendarId: null,
      googleEventId: null,
      googleSyncStatus: null,
      companyName: "OpenAI",
    };

    const draft = buildDeadlineEventDraft(deadline);

    expect(draft).not.toBeNull();
    expect(draft!.kind).toBe("deadline");
    expect(draft!.entityId).toBe("deadline-1");
    expect(draft!.title).toBe("OpenAI ES提出");
    expect(draft!.startAt).toBe(dueDate.toISOString());
    expect(draft!.endAt).toBe(new Date(dueDate.getTime() + 60 * 60 * 1000).toISOString());
    expect(draft!.description).toBe("取得元: https://example.com/jobs");
  });

  it("uses the fallback description when sourceUrl is null", () => {
    const dueDate = new Date("2026-05-01T09:00:00.000Z");
    const deadline: DeadlineForSync = {
      id: "deadline-2",
      userId: "user-1",
      title: "面接",
      dueDate,
      sourceUrl: null,
      isConfirmed: true,
      googleCalendarId: null,
      googleEventId: null,
      googleSyncStatus: null,
      companyName: "Google",
    };

    const draft = buildDeadlineEventDraft(deadline);

    expect(draft!.description).toBe("就活Passで管理している締切");
  });

  it("trims the title when companyName is empty", () => {
    const dueDate = new Date("2026-05-01T09:00:00.000Z");
    const deadline: DeadlineForSync = {
      id: "deadline-3",
      userId: "user-1",
      title: "締切",
      dueDate,
      sourceUrl: null,
      isConfirmed: true,
      googleCalendarId: null,
      googleEventId: null,
      googleSyncStatus: null,
      companyName: "",
    };

    const draft = buildDeadlineEventDraft(deadline);

    expect(draft!.title).toBe("締切");
  });
});

describe("buildWorkBlockEventDraft", () => {
  it("returns null when event is null", () => {
    expect(buildWorkBlockEventDraft(null)).toBeNull();
  });

  it("builds a draft preserving title, startAt, endAt as ISO strings", () => {
    const startAt = new Date("2026-05-01T10:00:00.000Z");
    const endAt = new Date("2026-05-01T11:30:00.000Z");
    const event: WorkBlockForSync = {
      id: "event-1",
      userId: "user-1",
      title: "[就活Pass] ES書き作業",
      startAt,
      endAt,
      googleCalendarId: null,
      googleEventId: null,
      googleSyncStatus: null,
    };

    const draft = buildWorkBlockEventDraft(event);

    expect(draft).not.toBeNull();
    expect(draft!.kind).toBe("work_block");
    expect(draft!.entityId).toBe("event-1");
    expect(draft!.title).toBe("[就活Pass] ES書き作業");
    expect(draft!.startAt).toBe(startAt.toISOString());
    expect(draft!.endAt).toBe(endAt.toISOString());
    expect(draft!.description).toBe("就活Passで作成した作業ブロック");
  });
});
