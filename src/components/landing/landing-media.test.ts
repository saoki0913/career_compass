import { describe, expect, it } from "vitest";
import { landingMedia } from "./landing-media";

describe("landingMedia", () => {
  it("公開面ではダミープレースホルダーだけを参照する", () => {
    for (const media of Object.values(landingMedia)) {
      expect(media.src.startsWith("/marketing/placeholders/")).toBe(true);
      expect(media.src.includes("/screenshots/")).toBe(false);
    }
  });
});
