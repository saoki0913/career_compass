import { expect, test } from "@playwright/test";
import { hasGoogleAuthState, signInWithGoogle } from "./google-auth";

test.describe("career_compass Google major flow", () => {
  test.skip(!hasGoogleAuthState, "Google auth storage state is not configured");

  test("Google login後に主要導線と主要APIが使える", async ({ page }) => {
    const request = page.context().request;
    const runId = Date.now().toString(36);
    const companyName = `Google E2E ${runId}`;

    await signInWithGoogle(page, "/dashboard");
    await expect(page.locator("main")).toBeVisible();

    await page.goto("/companies");
    await expect(page.locator("main")).toBeVisible();

    const companyResponse = await request.post("/api/companies", {
      data: {
        name: companyName,
        industry: "IT・ソフトウェア",
      },
    });
    expect(companyResponse.ok()).toBeTruthy();
    const companyPayload = (await companyResponse.json()) as { company: { id: string; name: string } };
    expect(companyPayload.company.name).toBe(companyName);

    await page.goto("/tasks");
    await expect(page.locator("main")).toBeVisible();

    const todayTask = await request.get("/api/tasks/today");
    expect(todayTask.ok()).toBeTruthy();

    await page.goto("/es");
    await expect(page.locator("main")).toBeVisible();

    const calendarStatus = await request.get("/api/calendar/connection-status");
    expect(calendarStatus.ok()).toBeTruthy();

    await page.goto("/calendar/settings");
    await expect(page.locator("main")).toBeVisible();
  });
});
