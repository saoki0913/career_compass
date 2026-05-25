"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubscriptionStatusBadge } from "@/components/billing/SubscriptionStatusBadge";
import { getSubscriptionStatusMessage } from "@/lib/billing/subscription-status-labels";
import { canManageSubscriptionInPortal } from "@/lib/billing/subscription-status";

export type BillingSectionProps = {
  profile: {
    plan: string;
    creditsBalance: number;
    subscriptionStatus: string | null;
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd: string | null;
    monthlyAllocation?: number;
  } | null;
  isOpeningPortal: boolean;
  onOpenBillingPortal: () => void;
  className?: string;
  compact?: boolean;
};

export function BillingSection({
  profile,
  isOpeningPortal,
  onOpenBillingPortal,
  className,
  compact = false,
}: BillingSectionProps) {
  if (!profile) return null;

  const planLabel =
    profile.plan === "pro"
      ? "Pro プラン"
      : profile.plan === "standard"
        ? "Standard プラン"
        : "Free プラン";

  const isFreeUser = profile.plan === "free";
  const canOpenPortal = canManageSubscriptionInPortal(profile.subscriptionStatus);

  const statusMessage = getSubscriptionStatusMessage(
    profile.subscriptionStatus,
    {
      cancelAtPeriodEnd: profile.cancelAtPeriodEnd,
      periodEnd: profile.currentPeriodEnd ?? undefined,
    },
  );

  const isPastDue = profile.subscriptionStatus === "past_due";

  return (
    <Card className={cn("mt-12", className)}>
      <CardHeader className={compact ? "pb-3" : undefined}>
        <CardTitle>プラン管理</CardTitle>
        <CardDescription>現在のプランと利用状況</CardDescription>
      </CardHeader>
      <CardContent className={compact ? "space-y-4" : "space-y-6"}>
        {/* Current plan info */}
        <div className={cn("rounded-lg bg-muted/50", compact ? "p-3" : "p-4")}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm text-muted-foreground">現在のプラン</p>
                <p className={cn("font-bold", compact ? "text-lg" : "text-xl")}>{planLabel}</p>
              </div>
              {profile.subscriptionStatus && (
                <SubscriptionStatusBadge
                  status={profile.subscriptionStatus}
                  cancelAtPeriodEnd={profile.cancelAtPeriodEnd}
                />
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">クレジット残高</p>
              <p className={cn("font-bold", compact ? "text-lg" : "text-xl")}>{profile.creditsBalance}</p>
            </div>
          </div>

          {profile.currentPeriodEnd && (
            <p className="text-sm text-muted-foreground">
              次回更新日:{" "}
              {new Date(profile.currentPeriodEnd).toLocaleDateString("ja-JP")}
            </p>
          )}
        </div>

        {/* Status messages */}
        {profile.cancelAtPeriodEnd &&
          profile.subscriptionStatus === "active" &&
          profile.currentPeriodEnd && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm text-blue-800">
                解約が予約されました。
                {new Date(profile.currentPeriodEnd).toLocaleDateString("ja-JP")}
                までご利用可能です
              </p>
            </div>
          )}

        {isPastDue && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              お支払い方法の更新が必要です
            </p>
          </div>
        )}

        {statusMessage &&
          !isPastDue &&
          !(profile.cancelAtPeriodEnd && profile.subscriptionStatus === "active") && (
            <div className="rounded-lg border border-muted bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground">{statusMessage}</p>
            </div>
          )}

        {/* Actions */}
        <div className="flex justify-end">
          {isFreeUser && !canOpenPortal && (
            <Button asChild>
              <Link href="/pricing?source=settings">
                プランをアップグレード
              </Link>
            </Button>
          )}

          {canOpenPortal && (
            <Button
              variant="outline"
              onClick={onOpenBillingPortal}
              disabled={isOpeningPortal}
            >
              {isOpeningPortal ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  <span className="ml-2">読み込み中...</span>
                </>
              ) : (
                "請求管理"
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
