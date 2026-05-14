type BadgeVariant =
  | "soft-success"
  | "soft-info"
  | "soft-warning"
  | "soft-destructive"
  | "destructive";

export function getSubscriptionStatusLabel(
  status: string | null | undefined,
  cancelAtPeriodEnd = false,
): string {
  if (cancelAtPeriodEnd && status === "active") return "解約予約済み";

  switch (status) {
    case "active":
      return "有効";
    case "trialing":
      return "トライアル中";
    case "past_due":
      return "支払い遅延";
    case "canceled":
      return "解約済み";
    case "unpaid":
      return "未払い";
    case "paused":
      return "一時停止";
    case "incomplete":
      return "手続き中";
    case "incomplete_expired":
      return "期限切れ";
    default:
      return "不明";
  }
}

export function getSubscriptionStatusVariant(
  status: string | null | undefined,
  cancelAtPeriodEnd = false,
): BadgeVariant {
  if (cancelAtPeriodEnd && status === "active") return "soft-warning";

  switch (status) {
    case "active":
      return "soft-success";
    case "trialing":
      return "soft-info";
    case "past_due":
    case "paused":
    case "incomplete":
      return "soft-warning";
    case "canceled":
    case "incomplete_expired":
      return "soft-destructive";
    case "unpaid":
      return "destructive";
    default:
      return "soft-warning";
  }
}

export function getSubscriptionStatusMessage(
  status: string | null | undefined,
  opts?: { cancelAtPeriodEnd?: boolean; periodEnd?: string },
): string | null {
  if (opts?.cancelAtPeriodEnd && status === "active" && opts.periodEnd) {
    const endDate = new Date(opts.periodEnd).toLocaleDateString("ja-JP");
    return `${endDate}まで現在のプランをご利用いただけます。`;
  }

  switch (status) {
    case "past_due":
      return "お支払い方法の更新が必要です。請求管理から確認してください。";
    case "unpaid":
      return "未払いのためサービスが制限されています。お支払い情報を更新してください。";
    case "canceled":
      return "サブスクリプションは解約されました。";
    default:
      return null;
  }
}
