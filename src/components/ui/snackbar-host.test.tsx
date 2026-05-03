import { describe, it, expect, vi, beforeEach } from "vitest";
import { enqueueSnackbar, dismissActiveSnackbar, getSnackbarActive } from "@/lib/snackbar-store";

describe("SnackbarHost action support", () => {
  beforeEach(() => {
    dismissActiveSnackbar();
  });

  it("enqueues snackbar with action and makes it active", () => {
    const onClick = vi.fn();
    enqueueSnackbar({
      tone: "error",
      title: "Failed",
      duration: 8000,
      action: { label: "Retry", onClick },
    });
    const active = getSnackbarActive();
    expect(active).not.toBeNull();
    expect(active!.action).toBeDefined();
    expect(active!.action!.label).toBe("Retry");
  });

  it("action callback is invokable from active payload", () => {
    const onClick = vi.fn();
    enqueueSnackbar({
      tone: "error",
      title: "Error",
      duration: 8000,
      action: { label: "Try again", onClick },
    });
    const active = getSnackbarActive();
    active!.action!.onClick();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("action is undefined when not provided", () => {
    enqueueSnackbar({ tone: "success", title: "Done", duration: 3000 });
    const active = getSnackbarActive();
    expect(active!.action).toBeUndefined();
  });
});
