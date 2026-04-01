import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  dbInsertValuesMock,
  sendContactNotificationMock,
  getSessionMock,
  checkRateLimitMock,
} = vi.hoisted(() => ({
  dbInsertValuesMock: vi.fn(),
  sendContactNotificationMock: vi.fn(),
  getSessionMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: dbInsertValuesMock,
    })),
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/rate-limit", () => ({
  RATE_LIMITS: {
    contact: {},
  },
  createRateLimitKey: vi.fn(() => "contact:test"),
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/logger", () => ({
  logError: vi.fn(),
}));

vi.mock("@/lib/mail/contact-notifications", () => ({
  sendContactNotification: sendContactNotificationMock,
}));

describe("POST /api/contact", () => {
  beforeEach(() => {
    dbInsertValuesMock.mockReset();
    sendContactNotificationMock.mockReset();
    getSessionMock.mockReset();
    checkRateLimitMock.mockReset();

    dbInsertValuesMock.mockResolvedValue(undefined);
    sendContactNotificationMock.mockResolvedValue(undefined);
    getSessionMock.mockResolvedValue(null);
    checkRateLimitMock.mockResolvedValue({ allowed: true });
  });

  it("stores the inquiry and sends a support notification", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/contact", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "vitest",
        "x-forwarded-for": "203.0.113.10",
      },
      body: JSON.stringify({
        email: "user@example.com",
        subject: "決済について",
        message: "お問い合わせ内容を十分な長さで記載しています。",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(dbInsertValuesMock).toHaveBeenCalledOnce();
    expect(sendContactNotificationMock).toHaveBeenCalledOnce();
    expect(sendContactNotificationMock.mock.calls[0]?.[0]).toMatchObject({
      senderEmail: "user@example.com",
      subject: "決済について",
      message: "お問い合わせ内容を十分な長さで記載しています。",
      ipAddress: "203.0.113.10",
      userAgent: "vitest",
    });
  });

  it("returns 500 when support notification delivery fails", async () => {
    sendContactNotificationMock.mockRejectedValueOnce(new Error("boom"));

    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/contact", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "user@example.com",
        subject: "件名",
        message: "お問い合わせ内容を十分な長さで記載しています。",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error?.code).toBe("CONTACT_SUBMIT_FAILED");
  });
});
