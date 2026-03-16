import { describe, expect, it } from "vitest";

import {
  AUTO_FOLLOW_BOTTOM_THRESHOLD_PX,
  getDistanceFromBottom,
  shouldEnableAutoFollow,
} from "./review-panel-scroll";

describe("review panel auto follow helpers", () => {
  it("computes the distance from the bottom", () => {
    expect(
      getDistanceFromBottom({
        scrollHeight: 1200,
        scrollTop: 900,
        clientHeight: 250,
      }),
    ).toBe(50);
  });

  it("enables auto follow when the user is near the bottom", () => {
    expect(
      shouldEnableAutoFollow({
        scrollHeight: 1200,
        scrollTop: 905,
        clientHeight: 250,
      }),
    ).toBe(true);
  });

  it("disables auto follow when the user scrolls away from the bottom", () => {
    expect(
      shouldEnableAutoFollow(
        {
          scrollHeight: 1200,
          scrollTop: 700,
          clientHeight: 250,
        },
        AUTO_FOLLOW_BOTTOM_THRESHOLD_PX,
      ),
    ).toBe(false);
  });
});
