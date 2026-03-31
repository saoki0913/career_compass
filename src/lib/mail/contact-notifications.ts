const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_CONTACT_TO_EMAIL = "support@shupass.jp";
const DEFAULT_CONTACT_FROM_EMAIL = "support@shupass.jp";
const CONTACT_FROM_DISPLAY_NAME = "就活Pass";

type SendContactNotificationInput = {
  senderEmail: string;
  subject: string | null;
  message: string;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function getContactToEmail(): string {
  return process.env.CONTACT_TO_EMAIL?.trim() || DEFAULT_CONTACT_TO_EMAIL;
}

function getContactFromEmail(): string {
  return process.env.CONTACT_FROM_EMAIL?.trim() || DEFAULT_CONTACT_FROM_EMAIL;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildSubject(subject: string | null): string {
  return subject && subject.trim().length > 0
    ? `[就活Pass] お問い合わせ: ${subject.trim()}`
    : "[就活Pass] お問い合わせ";
}

function formatFromAddress(email: string): string {
  if (email.includes("<") || email.includes(">")) {
    return email;
  }
  return `${CONTACT_FROM_DISPLAY_NAME} <${email}>`;
}

function formatReceivedAt(date: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function buildTextBody(input: SendContactNotificationInput): string {
  const subject = input.subject?.trim() || "（未入力）";
  const receivedAt = formatReceivedAt(input.createdAt);

  return [
    "就活Pass に新しいお問い合わせが届きました。",
    `このメールに返信すると ${input.senderEmail} 宛に返せます。`,
    "",
    "概要",
    `- 送信者: ${input.senderEmail}`,
    `- 件名: ${subject}`,
    `- 受付時刻: ${receivedAt} JST`,
    "",
    "本文",
    "------------------------------",
    input.message,
    "------------------------------",
    "",
    "運用メモ",
    `- userId: ${input.userId ?? "guest / unknown"}`,
    `- IP: ${input.ipAddress ?? "unknown"}`,
    `- User-Agent: ${input.userAgent ?? "unknown"}`,
  ].join("\n");
}

function buildHtmlBody(input: SendContactNotificationInput): string {
  const subject = escapeHtml(input.subject?.trim() || "（未入力）");
  const senderEmail = escapeHtml(input.senderEmail);
  const receivedAt = escapeHtml(formatReceivedAt(input.createdAt));
  const escapedMessage = escapeHtml(input.message).replaceAll("\n", "<br />");

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;line-height:1.7;padding:24px;max-width:720px;margin:0 auto;">
      <p style="margin:0 0 16px;font-size:18px;font-weight:700;">就活Pass に新しいお問い合わせが届きました。</p>
      <p style="margin:0 0 20px;color:#374151;">
        このメールに返信すると
        <a href="mailto:${senderEmail}" style="color:#2563eb;text-decoration:none;">${senderEmail}</a>
        宛に返せます。
      </p>

      <div style="margin:0 0 24px;padding:16px 18px;border:1px solid #dbeafe;background:#eff6ff;border-radius:12px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1d4ed8;">概要</p>
        <ul style="margin:0;padding-left:18px;">
          <li>送信者: <a href="mailto:${senderEmail}" style="color:#2563eb;text-decoration:none;">${senderEmail}</a></li>
          <li>件名: ${subject}</li>
          <li>受付時刻: ${receivedAt} JST</li>
        </ul>
      </div>

      <div style="margin:0 0 24px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#374151;">本文</p>
        <div style="padding:16px 18px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:12px;white-space:normal;word-break:break-word;">
          ${escapedMessage}
        </div>
      </div>

      <div style="margin:0;padding:16px 18px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;">
        <p style="margin:0 0 8px;font-weight:700;color:#374151;">運用メモ</p>
        <ul style="margin:0;padding-left:18px;">
          <li>userId: ${escapeHtml(input.userId ?? "guest / unknown")}</li>
          <li>IP: ${escapeHtml(input.ipAddress ?? "unknown")}</li>
          <li>User-Agent: ${escapeHtml(input.userAgent ?? "unknown")}</li>
        </ul>
      </div>
    </div>
  `;
}

export async function sendContactNotification(input: SendContactNotificationInput) {
  const apiKey = getRequiredEnv("RESEND_API_KEY");
  const to = getContactToEmail();
  const from = formatFromAddress(getContactFromEmail());
  const subject = buildSubject(input.subject);

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: input.senderEmail,
      subject,
      text: buildTextBody(input),
      html: buildHtmlBody(input),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Resend request failed: ${response.status} ${errorText}`.trim());
  }
}
