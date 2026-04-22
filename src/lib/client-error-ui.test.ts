import { describe, expect, it, vi } from "vitest";

const notifyError = vi.fn();

vi.mock("@/lib/notifications", () => ({
  notifyError: (...args: unknown[]) => notifyError(...args),
}));

describe("client-error-ui", () => {
  it("notifyUserFacingAppError shows snackbar for any AppUiError", async () => {
    notifyError.mockReset();
    const { notifyUserFacingAppError } = await import("./client-error-ui");
    const { AppUiError } = await import("./api-errors");

    notifyUserFacingAppError(new AppUiError("a", { code: "X" }));
    expect(notifyError).toHaveBeenCalledWith({
      title: "a",
      description: undefined,
    });

    notifyUserFacingAppError(
      new AppUiError("b", { code: "Y", clientNetworkFailure: true, action: "再接続してください" }),
    );
    expect(notifyError).toHaveBeenLastCalledWith({
      title: "b",
      description: "再接続してください",
    });
    expect(notifyError).toHaveBeenCalledTimes(2);
  });

  it("reportUserFacingError notifies on fetch failure and returns fallback message", async () => {
    notifyError.mockReset();
    const { reportUserFacingError } = await import("./client-error-ui");

    const msg = reportUserFacingError(
      new TypeError("Failed to fetch"),
      {
        code: "TEST",
        userMessage: "読み込めませんでした。",
        action: "再試行",
      },
      "client-error-ui:test",
    );

    expect(msg).toBe("読み込めませんでした。");
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError.mock.calls[0][0].title).toBe("読み込めませんでした。");
    expect(notifyError.mock.calls[0][0].description).toContain("インターネット接続");
  });

  it("reportUserFacingError notifies for non-network errors (e.g. HTTP-style AppUiError)", async () => {
    notifyError.mockReset();
    const { reportUserFacingError } = await import("./client-error-ui");
    const { AppUiError } = await import("./api-errors");

    const msg = reportUserFacingError(
      new AppUiError("権限がありません。", {
        code: "FORBIDDEN",
        action: "管理者に確認してください。",
        status: 403,
      }),
      {
        code: "FALLBACK",
        userMessage: "処理に失敗しました。",
      },
      "client-error-ui:non-network",
    );

    expect(msg).toBe("権限がありません。");
    expect(notifyError).toHaveBeenCalledTimes(1);
    expect(notifyError).toHaveBeenCalledWith({
      title: "権限がありません。",
      description: "管理者に確認してください。",
    });
  });
});
