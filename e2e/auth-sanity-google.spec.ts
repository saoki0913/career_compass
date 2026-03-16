import { test } from "@playwright/test";
import { hasGoogleAuthState, signInWithGoogle } from "./google-auth";

test.describe("Google auth sanity", () => {
  test.skip(!hasGoogleAuthState, "Google auth storage state is not configured");

  test("auth state can reach /dashboard", async ({ page }) => {
    await signInWithGoogle(page, "/dashboard");
  });
});
