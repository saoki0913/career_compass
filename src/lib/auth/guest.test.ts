import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const {
  dbSelectMock,
  dbUpdateMock,
  dbTransactionMock,
  txSelectMock,
  txUpdateMock,
  txDeleteMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  txSelectMock: vi.fn(),
  txUpdateMock: vi.fn(),
  txDeleteMock: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
  applications: { name: "applications" },
  companies: { name: "companies" },
  documents: { name: "documents" },
  gakuchikaContents: { name: "gakuchika_contents" },
  guestUsers: {
    name: "guest_users",
    deviceToken: "deviceToken",
    expiresAt: "expiresAt",
    id: "id",
    migratedToUserId: "migratedToUserId",
  },
  interviewConversations: {
    name: "interview_conversations",
    companyId: "interviewCompanyId",
    guestId: "interviewGuestId",
    id: "interviewId",
  },
  interviewDrillAttempts: { name: "interview_drill_attempts" },
  interviewFeedbackHistories: { name: "interview_feedback_histories" },
  interviewTurnEvents: { name: "interview_turn_events" },
  motivationConversations: {
    name: "motivation_conversations",
    companyId: "motivationCompanyId",
    guestId: "motivationGuestId",
    id: "motivationId",
  },
  notifications: { name: "notifications" },
  submissionItems: { name: "submission_items" },
  tasks: { name: "tasks" },
  userPins: {
    name: "user_pins",
    entityId: "entityId",
    entityType: "entityType",
    guestId: "pinGuestId",
    id: "pinId",
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    update: dbUpdateMock,
    transaction: dbTransactionMock,
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => ({ and: values }),
  eq: (...values: unknown[]) => ({ eq: values }),
  gte: (...values: unknown[]) => ({ gte: values }),
  isNull: (...values: unknown[]) => ({ isNull: values }),
  lt: (...values: unknown[]) => ({ lt: values }),
  or: (...values: unknown[]) => ({ or: values }),
  sql: (...values: unknown[]) => ({ sql: values }),
}));

describe("migrateGuestToUser", () => {
  beforeEach(() => {
    vi.resetModules();
    dbSelectMock.mockReset();
    dbTransactionMock.mockReset();
    txSelectMock.mockReset();
    txUpdateMock.mockReset();
    txDeleteMock.mockReset();

    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "guest-1",
              deviceToken: "hashed",
              expiresAt: new Date("2099-01-01T00:00:00.000Z"),
              migratedToUserId: null,
            },
          ]),
        })),
      })),
    });

    txSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: "company-1" }]),
        })),
      })),
    });

    txUpdateMock.mockImplementation((table) => ({
      set: vi.fn(() => {
        const whereResult =
          table.name === "guest_users"
            ? { returning: vi.fn().mockResolvedValue([{ id: "guest-1" }]) }
            : Promise.resolve(table);
        return {
          where: vi.fn(() => whereResult),
        };
      }),
    }));
    txDeleteMock.mockImplementation(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    }));

    dbTransactionMock.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        delete: txDeleteMock,
        select: txSelectMock,
        update: txUpdateMock,
      })
    );
  });

  it("migrates guest-owned rows inside a transaction", async () => {
    const { migrateGuestToUser } = await import("@/lib/auth/guest");
    const result = await migrateGuestToUser("550e8400-e29b-41d4-a716-446655440000", "user-1");

    expect(result).toEqual({
      guestId: "guest-1",
      userId: "user-1",
      conflicts: {
        motivationConversations: 0,
        interviewConversations: 0,
        userPins: 0,
      },
    });

    const deletedTables = txDeleteMock.mock.calls.map(([table]) => table.name);
    expect(deletedTables).toEqual([
      "motivation_conversations",
      "interview_conversations",
      "user_pins",
    ]);
    const updatedTables = txUpdateMock.mock.calls.map(([table]) => table.name);
    expect(updatedTables).toEqual([
      "guest_users",
      "companies",
      "applications",
      "documents",
      "tasks",
      "notifications",
      "gakuchika_contents",
      "motivation_conversations",
      "interview_conversations",
      "interview_feedback_histories",
      "interview_turn_events",
      "interview_drill_attempts",
      "submission_items",
      "user_pins",
    ]);
  });

  it("returns null when the atomic claim loses the race", async () => {
    txUpdateMock.mockImplementation((table) => ({
      set: vi.fn(() => ({
        where: vi.fn(() =>
          table.name === "guest_users"
            ? { returning: vi.fn().mockResolvedValue([]) }
            : Promise.resolve(table),
        ),
      })),
    }));

    const { migrateGuestToUser } = await import("@/lib/auth/guest");
    const result = await migrateGuestToUser("550e8400-e29b-41d4-a716-446655440000", "user-1");

    expect(result).toBeNull();
    expect(txUpdateMock).toHaveBeenCalledTimes(1);
    expect(txDeleteMock).not.toHaveBeenCalled();
  });

  it("records and removes duplicate guest rows before migrating the rest", async () => {
    txDeleteMock.mockImplementation((table) => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: `${table.name}-conflict` }]),
      })),
    }));

    const { migrateGuestToUser } = await import("@/lib/auth/guest");
    const result = await migrateGuestToUser("550e8400-e29b-41d4-a716-446655440000", "user-1");

    expect(result).toMatchObject({
      guestId: "guest-1",
      userId: "user-1",
      conflicts: {
        motivationConversations: 1,
        interviewConversations: 1,
        userPins: 1,
      },
    });
    expect(txDeleteMock).toHaveBeenCalledTimes(3);
    expect(txUpdateMock).toHaveBeenCalledTimes(14);
  });
});

describe("guest token lookup", () => {
  beforeEach(() => {
    vi.resetModules();
    dbSelectMock.mockReset();
    dbUpdateMock.mockReset();
  });

  it("claims and hashes plaintext legacy device tokens during lookup", async () => {
    const legacyGuest = {
      id: "guest-legacy",
      deviceToken: "550e8400-e29b-41d4-a716-446655440000",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      migratedToUserId: null,
    };
    const limitMock = vi.fn().mockResolvedValue([legacyGuest]);
    dbSelectMock.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: limitMock,
        })),
      })),
    });
    const whereMock = vi.fn().mockResolvedValue(undefined);
    const setMock = vi.fn(() => ({ where: whereMock }));
    dbUpdateMock.mockReturnValue({ set: setMock });

    const { getGuestUser } = await import("@/lib/auth/guest");
    const result = await getGuestUser("550e8400-e29b-41d4-a716-446655440000");

    expect(result).toEqual(legacyGuest);
    expect(dbSelectMock).toHaveBeenCalledTimes(1);
    expect(limitMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
      deviceToken: expect.not.stringMatching(/^550e8400/),
      updatedAt: expect.any(Date),
    }));
  });

  it("hashes the raw guest device token when migration claims a legacy row", () => {
    const source = readFileSync(path.resolve(process.cwd(), "src/lib/auth/guest.ts"), "utf8");

    expect(source).toContain("eq(guestUsers.deviceToken, hashedToken)");
    expect(source).toContain("eq(guestUsers.deviceToken, deviceToken)");
    expect(source).toContain("deviceToken: hashedToken");
  });
});
