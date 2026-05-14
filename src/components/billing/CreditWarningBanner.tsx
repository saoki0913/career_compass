"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";

type CreditWarningBannerProps = {
  balance: number;
  requiredCredits: number;
  featureLabel?: string;
};

export function CreditWarningBanner({
  balance,
  requiredCredits,
  featureLabel,
}: CreditWarningBannerProps) {
  if (balance >= requiredCredits) return null;

  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm"
      role="status"
      aria-live="polite"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning-foreground" aria-hidden />
      <div>
        <p className="font-medium text-warning-foreground">
          クレジットが不足しています
          {featureLabel && `（${featureLabel}に${requiredCredits}クレジット必要）`}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          残高: {balance}クレジット。
          <Link
            href="/pricing?source=credit-warning"
            className="ml-1 text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            プランをアップグレード
          </Link>
          して、クレジットを追加してください。
        </p>
      </div>
    </div>
  );
}
