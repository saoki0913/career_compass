import { describe, it, expect, vi, afterEach } from "vitest";
import { createStreamTimeout } from "./stream-timeout";

describe("createStreamTimeout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns controller and clear function", () => {
    const { controller, clear } = createStreamTimeout(5000);
    expect(controller).toBeInstanceOf(AbortController);
    expect(typeof clear).toBe("function");
    clear();
  });

  it("aborts signal after specified duration", () => {
    vi.useFakeTimers();
    const { controller } = createStreamTimeout(3000);

    expect(controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(2999);
    expect(controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(controller.signal.aborted).toBe(true);

    vi.useRealTimers();
  });

  it("clear prevents abort", () => {
    vi.useFakeTimers();
    const { controller, clear } = createStreamTimeout(3000);

    clear();
    vi.advanceTimersByTime(5000);
    expect(controller.signal.aborted).toBe(false);

    vi.useRealTimers();
  });

  it("defaults to 90 seconds", () => {
    vi.useFakeTimers();
    const { controller } = createStreamTimeout();

    vi.advanceTimersByTime(89_999);
    expect(controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(controller.signal.aborted).toBe(true);

    vi.useRealTimers();
  });
});
