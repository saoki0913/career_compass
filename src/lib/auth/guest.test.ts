import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbSelectMock,
  dbTransactionMock,
  txSelectMock,
  txUpdateMock,
} = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  txSelectMock: vi.fn(),
  txUpdateMock: vi.fn(),
}));

vi.mock("@/lib/db/schema", () => ({
  applications: { name: "applications" },
  companies: { name: "companies" },
  documents: { name: "documents" },
  gakuchikaContents: { name: "gakuchika_contents" },
  guestUsers: { name: "guest_users", deviceToken: "deviceToken", id: "id" },
  motivationConversations: { name: "motivation_conversations" },
  notifications: { name: "notifications" },
  submissionItems: { name: "submission_items" },
  tasks: { name: "tasks" },
  userPins: { name: "user_pins" },
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: dbSelectMock,
    transaction: dbTransactionMock,
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => ({ and: values }),
  eq: (...values: unknown[]) => ({ eq: values }),
  isNull: (...values: unknown[]) => ({ isNull: values }),
  lt: (...values: unknown[]) => ({ lt: values }),
}));

describe("migrateGuestToUser", () => {
  beforeEach(() => {
    vi.resetModules();
    dbSelectMock.mockReset();
    dbTransactionMock.mockReset();
    txSelectMock.mockReset();
    txUpdateMock.mockReset();

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
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(table),
      })),
    }));

    dbTransactionMock.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        select: txSelectMock,
        update: txUpdateMock,
      })
    );
  });

  it("migrates guest-owned rows inside a transaction", async () => {
    const { migrateGuestToUser } = await import("@/lib/auth/guest");
    const result = await migrateGuestToUser("550e8400-e29b-41d4-a716-446655440000", "user-1");

    expect(result).toEqual({ guestId: "guest-1", userId: "user-1" });

    const updatedTables = txUpdateMock.mock.calls.map(([table]) => table.name);
    expect(updatedTables).toEqual([
      "companies",
      "applications",
      "documents",
      "tasks",
      "notifications",
      "gakuchika_contents",
      "motivation_conversations",
      "submission_items",
      "user_pins",
      "guest_users",
    ]);
  });
});
