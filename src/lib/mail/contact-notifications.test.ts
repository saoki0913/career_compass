import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("sendContactNotification", () => {
  const originalEnv = process.env;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: "re_test",
      CONTACT_TO_EMAIL: "support@shupass.jp",
      CONTACT_FROM_EMAIL: "support@shupass.jp",
    };
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  it("sends a formatted notification with reply-to and display name", async () => {
    const { sendContactNotification } = await import("./contact-notifications");

    await sendContactNotification({
      senderEmail: "user@example.com",
      subject: "決済について",
      message: "1行目\n2行目",
      userId: "user_123",
      ipAddress: "203.0.113.10",
      userAgent: "vitest",
      createdAt: new Date("2026-03-31T10:17:30.239Z"),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const payload = JSON.parse(String(init?.body));

    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");
    expect(payload.from).toBe("就活Pass <support@shupass.jp>");
    expect(payload.to).toEqual(["support@shupass.jp"]);
    expect(payload.reply_to).toBe("user@example.com");
    expect(payload.subject).toBe("[就活Pass] お問い合わせ: 決済について");
    expect(payload.text).toContain("このメールに返信すると user@example.com 宛に返せます。");
    expect(payload.text).toContain("本文");
    expect(payload.text).toContain("1行目\n2行目");
    expect(payload.html).toContain("mailto:user@example.com");
    expect(payload.html).toContain("就活Pass に新しいお問い合わせが届きました。");
    expect(payload.html).toContain("1行目<br />2行目");
  });

  it("throws when resend returns an error", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue("unauthorized"),
    });

    const { sendContactNotification } = await import("./contact-notifications");

    await expect(
      sendContactNotification({
        senderEmail: "user@example.com",
        subject: null,
        message: "お問い合わせ内容を十分な長さで記載しています。",
        userId: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date("2026-03-31T10:17:30.239Z"),
      }),
    ).rejects.toThrow("Resend request failed: 401 unauthorized");
  });
});
