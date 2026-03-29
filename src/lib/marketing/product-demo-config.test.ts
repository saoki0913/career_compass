import { describe, expect, it } from "vitest";

import {
  HERO_PRODUCT_DEMO_VIDEO_PATH,
  PRODUCT_DEMO_FRAME_RATE,
  PRODUCT_DEMO_SEGMENTS,
  PRODUCT_DEMO_TOTAL_FRAMES,
  PRODUCT_DEMO_VIDEO_HEIGHT,
  PRODUCT_DEMO_VIDEO_WIDTH,
} from "./product-demo-config";

describe("product demo config", () => {
  it("LP hero video uses the planned output path and 16:10 frame", () => {
    expect(HERO_PRODUCT_DEMO_VIDEO_PATH).toBe("/marketing/videos/product-demo.mp4");
    expect(PRODUCT_DEMO_VIDEO_WIDTH).toBe(1440);
    expect(PRODUCT_DEMO_VIDEO_HEIGHT).toBe(900);
  });

  it("defines the four short-form LP demo segments in story order", () => {
    expect(PRODUCT_DEMO_SEGMENTS.map((segment) => segment.id)).toEqual([
      "company-register",
      "company-import",
      "es-create",
      "es-review",
    ]);
  });

  it("keeps the autoplay loop within the target duration budget", () => {
    expect(PRODUCT_DEMO_FRAME_RATE).toBe(30);
    expect(PRODUCT_DEMO_TOTAL_FRAMES).toBeGreaterThanOrEqual(20 * PRODUCT_DEMO_FRAME_RATE);
    expect(PRODUCT_DEMO_TOTAL_FRAMES).toBeLessThanOrEqual(24 * PRODUCT_DEMO_FRAME_RATE);
  });

  it("assigns every segment a short overlay label and a positive duration", () => {
    for (const segment of PRODUCT_DEMO_SEGMENTS) {
      expect(segment.label.length).toBeGreaterThan(0);
      expect(segment.durationInFrames).toBeGreaterThan(0);
      expect(segment.captureTestName).toMatch(/^\d{2}-demo-/);
    }
  });
});
