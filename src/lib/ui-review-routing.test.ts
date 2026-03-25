import { describe, expect, it } from "vitest";
import {
  classifyUiReviewAuthMode,
  parseUiReviewRoutesFromBody,
  resolveUiReviewRoutes,
} from "./ui-review-routing.mjs";

describe("parseUiReviewRoutesFromBody", () => {
  it("reads routes from the UI Review Routes section", () => {
    const body = `
## UI Review Routes
- /
- /pricing
- /companies --auth=guest

## Docs Updated
yes
`;

    expect(parseUiReviewRoutesFromBody(body)).toEqual(["/", "/pricing", "/companies"]);
  });
});

describe("resolveUiReviewRoutes", () => {
  it("derives specific routes from app files", () => {
    expect(
      resolveUiReviewRoutes({
        changedFiles: ["src/app/(marketing)/pricing/page.tsx"],
      }).routes
    ).toEqual(["/pricing"]);
  });

  it("derives nested marketing routes from app files", () => {
    const scope = resolveUiReviewRoutes({
        changedFiles: ["src/app/(marketing)/tools/es-counter/page.tsx"],
    });

    expect(scope.routes).toEqual(["/tools/es-counter"]);
    expect(scope.authMode).toBe("none");
  });

  it("promotes shared public surface changes to fallback public routes", () => {
    const scope = resolveUiReviewRoutes({
      changedFiles: ["src/components/public-surface/public-surface.tsx"],
    });

    expect(scope.shouldRun).toBe(true);
    expect(scope.source).toBe("fallback");
    expect(scope.routes).toContain("/");
    expect(scope.routes).toContain("/pricing");
  });

  it("prefers explicit PR body routes for shared changes", () => {
    const scope = resolveUiReviewRoutes({
      changedFiles: ["src/components/public-surface/public-surface.tsx"],
      prBody: "## UI Review Routes\n- /pricing\n- /tools",
    });

    expect(scope.source).toBe("pr-body");
    expect(scope.routes).toEqual(["/pricing", "/tools"]);
    expect(scope.authMode).toBe("none");
  });

  it("marks mixed product routes as guest", () => {
    expect(
      classifyUiReviewAuthMode(["/", "/dashboard", "/companies"])
    ).toBe("guest");
  });
});
