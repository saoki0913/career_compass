import { describe, expect, it } from "vitest";
import { landingMedia } from "./landing-media";

describe("landingMedia", () => {
  it("LP 用メディアは public/marketing/placeholders の SVG を参照する", () => {
    expect(landingMedia.heroDashboard.src).toBe("/marketing/placeholders/hero-dashboard.svg");
    expect(landingMedia.esReview.src).toBe("/marketing/placeholders/es-review-placeholder.svg");
    expect(landingMedia.gakuchika.src).toBe("/marketing/placeholders/gakuchika-placeholder.svg");
    expect(landingMedia.companies.src).toBe("/marketing/placeholders/companies-placeholder.svg");
    expect(landingMedia.motivation.src).toBe("/marketing/placeholders/motivation-placeholder.svg");

    for (const media of Object.values(landingMedia)) {
      expect(media.src.startsWith("/marketing/placeholders/")).toBe(true);
      expect(media.src.endsWith(".svg")).toBe(true);
      expect(media.alt.length).toBeGreaterThan(0);
    }
  });
});
