import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueSnackbar = vi.fn();

vi.mock("@/lib/snackbar-store", () => ({
  enqueueSnackbar: (...args: unknown[]) => enqueueSnackbar(...args),
}));

describe("notifications", () => {
  beforeEach(() => {
    enqueueSnackbar.mockReset();
  });

  it("shows review success as a success snackbar with contextual description", async () => {
    const { notifyReviewSuccess } = await import("./notifications");

    notifyReviewSuccess(true);

    expect(enqueueSnackbar).toHaveBeenCalledWith({
      tone: "success",
      title: "添削が完了しました",
      description: "企業情報を踏まえた改善案、改善ポイント、出典リンクを表示しました",
      duration: 4200,
    });
  });

  it("shows review errors as user-safe snackbar copy with optional action", async () => {
    const { notifyReviewError } = await import("./notifications");

    notifyReviewError({
      message: "ES添削を開始できませんでした。",
      action: "入力内容や設定を確認して、もう一度お試しください。",
    });

    expect(enqueueSnackbar).toHaveBeenCalledWith({
      tone: "error",
      title: "ES添削を開始できませんでした。",
      description: "入力内容や設定を確認して、もう一度お試しください。",
      duration: 5200,
    });
  });

  it("passes action button config through to snackbar", async () => {
    const { notifyError } = await import("./notifications");
    const onClick = vi.fn();

    notifyError({
      title: "Failed to load",
      description: "Please try again",
      action: { label: "Retry", onClick },
    });

    expect(enqueueSnackbar).toHaveBeenCalledWith({
      tone: "error",
      title: "Failed to load",
      description: "Please try again",
      duration: 8000,
      action: { label: "Retry", onClick },
    });
  });

  it("uses ACTION_DURATION when action is provided without explicit duration", async () => {
    const { notifyError } = await import("./notifications");

    notifyError({
      title: "Error",
      action: { label: "Retry", onClick: vi.fn() },
    });

    expect(enqueueSnackbar).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 8000 }),
    );
  });

  it("uses ERROR_DURATION when no action is provided", async () => {
    const { notifyError } = await import("./notifications");

    notifyError({ title: "Error" });

    expect(enqueueSnackbar).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 5200 }),
    );
  });

  it("shows neutral snackbar copy for non-destructive info", async () => {
    const { notifyInfo } = await import("./notifications");

    notifyInfo({
      title: "他の処理を実行中です。",
      description: "完了後にもう一度お試しください。",
    });

    expect(enqueueSnackbar).toHaveBeenCalledWith({
      tone: "info",
      title: "他の処理を実行中です。",
      description: "完了後にもう一度お試しください。",
      duration: 3600,
    });
  });

  it("shows task notification helpers with short success copy", async () => {
    const {
      notifyTaskCreated,
      notifyTaskSaved,
      notifyTaskStatusChanged,
      notifyTaskDeleted,
    } = await import("./notifications");

    notifyTaskCreated();
    notifyTaskSaved();
    notifyTaskStatusChanged(true);
    notifyTaskDeleted();

    expect(enqueueSnackbar).toHaveBeenNthCalledWith(1, {
      tone: "success",
      title: "タスクを追加しました",
      duration: 3600,
    });
    expect(enqueueSnackbar).toHaveBeenNthCalledWith(2, {
      tone: "success",
      title: "タスクを保存しました",
      duration: 3600,
    });
    expect(enqueueSnackbar).toHaveBeenNthCalledWith(3, {
      tone: "success",
      title: "タスクを完了にしました",
      duration: 3600,
    });
    expect(enqueueSnackbar).toHaveBeenNthCalledWith(4, {
      tone: "success",
      title: "タスクを削除しました",
      duration: 3600,
    });
  });

  it("shows purchase success toast for confirmed plan", async () => {
    const { notifyPurchaseSuccess } = await import("./notifications");

    notifyPurchaseSuccess("pro", true);

    expect(enqueueSnackbar).toHaveBeenCalledWith({
      tone: "success",
      title: "Proプランへの登録が完了しました",
      description: "クレジットが付与されました。さっそく機能を使ってみましょう。",
      duration: 6000,
    });
  });

  it("shows purchase processing toast when plan is not yet confirmed", async () => {
    const { notifyPurchaseSuccess } = await import("./notifications");

    notifyPurchaseSuccess("standard", false);

    expect(enqueueSnackbar).toHaveBeenCalledWith({
      tone: "info",
      title: "Standardプランの登録を処理中です",
      description: "まもなく反映されます。",
      duration: 5000,
    });
  });

  it("shows portal return notification for plan confirmation", async () => {
    const { notifyPortalReturn } = await import("./notifications");

    notifyPortalReturn("pro");

    expect(enqueueSnackbar).toHaveBeenCalledWith({
      tone: "success",
      title: "プラン設定が更新されました",
      description: "変更内容はまもなく反映されます。",
      duration: 5000,
    });
  });

  it("shows downgrade notification with renewal date info", async () => {
    const { notifyPlanDowngrade } = await import("./notifications");

    notifyPlanDowngrade("Pro", "2026-06-15T00:00:00Z");

    expect(enqueueSnackbar).toHaveBeenCalledWith({
      tone: "info",
      title: "プランの変更を受け付けました",
      description: "2026/6/15まではProプランをご利用いただけます。",
      duration: 8000,
    });
  });

  it("shows document and calendar notification helpers with short success copy", async () => {
    const {
      notifyDocumentCreated,
      notifyDocumentRestored,
      notifyDocumentPermanentlyDeleted,
      notifyDocumentStatusChanged,
      notifyCalendarEventCreated,
      notifyCalendarEventDeleted,
    } = await import("./notifications");

    notifyDocumentCreated();
    notifyDocumentRestored();
    notifyDocumentPermanentlyDeleted();
    notifyDocumentStatusChanged(false);
    notifyCalendarEventCreated("work_block");
    notifyCalendarEventDeleted();

    expect(enqueueSnackbar).toHaveBeenNthCalledWith(1, {
      tone: "success",
      title: "ドキュメントを作成しました",
      duration: 3600,
    });
    expect(enqueueSnackbar).toHaveBeenNthCalledWith(2, {
      tone: "success",
      title: "ドキュメントを復元しました",
      duration: 3600,
    });
    expect(enqueueSnackbar).toHaveBeenNthCalledWith(3, {
      tone: "success",
      title: "ドキュメントを完全削除しました",
      duration: 3600,
    });
    expect(enqueueSnackbar).toHaveBeenNthCalledWith(4, {
      tone: "success",
      title: "ドキュメントを下書きに戻しました",
      duration: 3600,
    });
    expect(enqueueSnackbar).toHaveBeenNthCalledWith(5, {
      tone: "success",
      title: "作業ブロックを追加しました",
      duration: 3600,
    });
    expect(enqueueSnackbar).toHaveBeenNthCalledWith(6, {
      tone: "success",
      title: "イベントを削除しました",
      duration: 3600,
    });
  });
});
