import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  enqueueSnackbar,
  dismissActiveSnackbar,
  getSnackbarActive,
  subscribeSnackbar,
} from "./snackbar-store";

describe("snackbar-store", () => {
  beforeEach(() => {
    // Clear any active snackbar
    dismissActiveSnackbar();
    vi.useRealTimers();
  });

  it("enqueues a basic snackbar and makes it active", () => {
    enqueueSnackbar({ tone: "error", title: "Error occurred", duration: 5000 });
    const active = getSnackbarActive();
    expect(active).not.toBeNull();
    expect(active!.title).toBe("Error occurred");
    expect(active!.tone).toBe("error");
  });

  it("enqueues a snackbar with an action button", () => {
    const onClick = vi.fn();
    enqueueSnackbar({
      tone: "error",
      title: "Failed to load",
      description: "Please try again",
      duration: 8000,
      action: { label: "Retry", onClick },
    });
    const active = getSnackbarActive();
    expect(active).not.toBeNull();
    expect(active!.action).toBeDefined();
    expect(active!.action!.label).toBe("Retry");
    active!.action!.onClick();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("passes action through to active payload", () => {
    const onClick = vi.fn();
    enqueueSnackbar({
      tone: "info",
      title: "Info",
      duration: 3000,
      action: { label: "Undo", onClick },
    });
    const active = getSnackbarActive();
    expect(active!.action?.label).toBe("Undo");
  });

  it("action is undefined when not provided", () => {
    enqueueSnackbar({ tone: "success", title: "Done", duration: 3000 });
    const active = getSnackbarActive();
    expect(active!.action).toBeUndefined();
  });

  it("notifies subscribers on enqueue", () => {
    const listener = vi.fn();
    const unsub = subscribeSnackbar(listener);
    enqueueSnackbar({ tone: "info", title: "Test", duration: 3000 });
    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it("dismisses active snackbar", () => {
    enqueueSnackbar({ tone: "error", title: "Error", duration: 5000 });
    expect(getSnackbarActive()).not.toBeNull();
    dismissActiveSnackbar();
    expect(getSnackbarActive()).toBeNull();
  });
});
