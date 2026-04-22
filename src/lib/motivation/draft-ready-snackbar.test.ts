import { describe, expect, it } from "vitest";

import { shouldNotifyDraftReadyTransition } from "./draft-ready-snackbar";

describe("shouldNotifyDraftReadyTransition", () => {
  it("does not notify on initial render when isDraftReady is false", () => {
    expect(
      shouldNotifyDraftReadyTransition({
        previous: false,
        current: false,
        alreadyNotified: false,
      }),
    ).toBe(false);
  });

  it("notifies on the false -> true transition exactly once", () => {
    expect(
      shouldNotifyDraftReadyTransition({
        previous: false,
        current: true,
        alreadyNotified: false,
      }),
    ).toBe(true);
  });

  it("does not notify when isDraftReady stays true across renders", () => {
    expect(
      shouldNotifyDraftReadyTransition({
        previous: true,
        current: true,
        alreadyNotified: false,
      }),
    ).toBe(false);
  });

  it("does not notify if a previous notification has already fired in this session", () => {
    expect(
      shouldNotifyDraftReadyTransition({
        previous: false,
        current: true,
        alreadyNotified: true,
      }),
    ).toBe(false);
  });

  it("does not notify when isDraftReady flips back from true to false", () => {
    expect(
      shouldNotifyDraftReadyTransition({
        previous: true,
        current: false,
        alreadyNotified: false,
      }),
    ).toBe(false);
  });
});
