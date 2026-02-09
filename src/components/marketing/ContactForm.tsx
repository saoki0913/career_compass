"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics/client";

export function ContactForm({ className }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          subject: subject.trim() || undefined,
          message: message.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "送信に失敗しました");
      }

      trackEvent("contact_submit_success");
      setSent(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "送信に失敗しました";
      setError(msg);
      trackEvent("contact_submit_error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className={cn("rounded-xl border bg-card p-6", className)}>
        <h2 className="text-base font-semibold mb-2">送信しました</h2>
        <p className="text-sm text-muted-foreground">
          お問い合わせありがとうございます。内容を確認のうえ、順次ご連絡します。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={cn("rounded-xl border bg-card p-6 space-y-4", className)}>
      <div>
        <Label htmlFor="contact-email">メールアドレス</Label>
        <Input
          id="contact-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1"
          required
        />
      </div>

      <div>
        <Label htmlFor="contact-subject">件名（任意）</Label>
        <Input
          id="contact-subject"
          type="text"
          placeholder="例: 決済について"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="contact-message">お問い合わせ内容</Label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="できるだけ具体的にご記載ください（10文字以上）"
          className={cn(
            "mt-1 w-full min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
          required
          minLength={10}
          maxLength={5000}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {message.trim().length} / 5000
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "送信中..." : "送信する"}
      </Button>
    </form>
  );
}

