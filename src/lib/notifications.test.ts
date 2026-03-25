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
});
