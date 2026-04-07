import { describe, expect, it } from "vitest";
import { landingMedia } from "./landing-media";

describe("landingMedia", () => {
  it("LP 用メディアは public/marketing/screenshots の PNG を参照する", () => {
    expect(landingMedia.heroDashboard.src).toBe("/marketing/screenshots/hero-dashboard.png");
    expect(landingMedia.esReview.src).toBe("/marketing/screenshots/es-review.png");
    expect(landingMedia.calendar.src).toBe("/marketing/screenshots/calendar.png");
    expect(landingMedia.motivation.src).toBe("/marketing/screenshots/motivation.png");
    expect(landingMedia.logoIcon.src).toBe("/marketing/screenshots/logo-icon.png");

    for (const media of Object.values(landingMedia)) {
      expect(media.src.startsWith("/marketing/screenshots/")).toBe(true);
      expect(media.alt.length).toBeGreaterThan(0);
    }
  });

  it("heroDashboard にプロダクトデモ動画の videoSrc が設定されている", () => {
    expect(landingMedia.heroDashboard.videoSrc).toBe(
      "/marketing/videos/product-demo.mp4",
    );
  });
});
