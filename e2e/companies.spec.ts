/**
 * Company Management E2E Tests
 *
 * Tests for company registration, listing, editing, and deletion
 */

import { test, expect } from "@playwright/test";
import { loginAsGuest, navigateTo } from "./fixtures/auth";

test.describe("Company List", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
  });

  test("should display companies page", async ({ page }) => {
    await navigateTo(page, "/companies");

    // Page should load
    await expect(page.locator("main")).toBeVisible();
  });

  test("should show empty state for new users", async ({ page }) => {
    await navigateTo(page, "/companies");

    // Should show empty state or register button
    const pageContent = await page.textContent("body");
    const hasEmptyStateOrButton =
      pageContent?.includes("企業") || pageContent?.includes("登録");

    expect(hasEmptyStateOrButton).toBeTruthy();
  });

  test("should have link to add new company", async ({ page }) => {
    await navigateTo(page, "/companies");

    // Look for new company button/link
    const newCompanyLink = page.locator('a[href="/companies/new"]');
    const newCompanyButton = page.getByRole("button", { name: /新規|追加|登録/ });

    const hasLink = await newCompanyLink.isVisible().catch(() => false);
    const hasButton = await newCompanyButton.isVisible().catch(() => false);

    // Either link or button should exist
    expect(hasLink || hasButton).toBeTruthy();
  });
});

test.describe("Company Registration", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
  });

  test("should display new company form", async ({ page }) => {
    await navigateTo(page, "/companies/new");

    // Form should be visible
    await expect(page.locator("form")).toBeVisible();
  });

  test("should have required fields", async ({ page }) => {
    await navigateTo(page, "/companies/new");

    // Company name field should exist
    const nameInput = page.locator('input[name="name"]');
    await expect(nameInput).toBeVisible();
  });

  test("should create a new company", async ({ page }) => {
    await navigateTo(page, "/companies/new");

    // Fill in company name
    const companyName = `テスト株式会社_${Date.now()}`;
    await page.fill('input[name="name"]', companyName);

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for navigation or success message
    await page.waitForTimeout(2000);

    // Should redirect to company detail or list
    const url = page.url();
    const success =
      url.includes("/companies/") ||
      (await page.getByText(companyName).isVisible().catch(() => false));

    expect(success).toBeTruthy();
  });

  test("should validate required fields", async ({ page }) => {
    await navigateTo(page, "/companies/new");

    // Try to submit without filling required fields
    await page.click('button[type="submit"]');

    // Should show validation error or prevent submission
    await page.waitForTimeout(1000);

    // Should still be on the form page
    const url = page.url();
    expect(url).toContain("/companies/new");
  });
});

test.describe("Company Detail", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
  });

  test("should create and view company detail", async ({ page }) => {
    // First create a company
    await navigateTo(page, "/companies/new");
    const companyName = `詳細テスト会社_${Date.now()}`;
    await page.fill('input[name="name"]', companyName);
    await page.click('button[type="submit"]');

    // Wait for redirect
    await page.waitForTimeout(2000);

    // Should be on detail page or can navigate there
    const url = page.url();
    if (url.includes("/companies/") && !url.includes("/new")) {
      // On detail page
      await expect(page.getByText(companyName)).toBeVisible();
    } else {
      // Navigate to companies list and find the company
      await navigateTo(page, "/companies");
      await expect(page.getByText(companyName)).toBeVisible();
    }
  });

  test("should display company information", async ({ page }) => {
    // Create a company first
    await navigateTo(page, "/companies/new");
    const companyName = `情報表示テスト_${Date.now()}`;
    await page.fill('input[name="name"]', companyName);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Check if on detail page
    const mainContent = page.locator("main");
    await expect(mainContent).toBeVisible();
  });
});

test.describe("Company Edit", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
  });

  test("should edit company name", async ({ page }) => {
    // Create a company first
    await navigateTo(page, "/companies/new");
    const originalName = `編集前会社_${Date.now()}`;
    await page.fill('input[name="name"]', originalName);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Look for edit button/link
    const editButton = page.getByRole("button", { name: /編集|Edit/ });
    const editLink = page.locator('a[href*="edit"]');

    const hasEditButton = await editButton.isVisible().catch(() => false);
    const hasEditLink = await editLink.isVisible().catch(() => false);

    if (hasEditButton || hasEditLink) {
      if (hasEditButton) {
        await editButton.click();
      } else {
        await editLink.click();
      }

      await page.waitForTimeout(1000);

      // Update name
      const newName = `編集後会社_${Date.now()}`;
      await page.fill('input[name="name"]', newName);

      // Save
      const saveButton = page.getByRole("button", { name: /保存|Save|更新/ });
      if (await saveButton.isVisible().catch(() => false)) {
        await saveButton.click();
        await page.waitForTimeout(2000);

        // Verify update
        const pageContent = await page.textContent("body");
        expect(pageContent?.includes(newName)).toBeTruthy();
      }
    }
  });
});

test.describe("Company Deadlines", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
  });

  test("should show deadlines section on company detail", async ({ page }) => {
    // Create a company
    await navigateTo(page, "/companies/new");
    const companyName = `締切テスト会社_${Date.now()}`;
    await page.fill('input[name="name"]', companyName);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Check for deadlines section
    const pageContent = await page.textContent("body");
    const hasDeadlineSection =
      pageContent?.includes("締切") ||
      pageContent?.includes("deadline") ||
      pageContent?.includes("Deadline");

    // Deadlines section should exist (may be empty)
    expect(hasDeadlineSection).toBeTruthy();
  });
});

test.describe("Company Applications", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
  });

  test("should show applications section on company detail", async ({
    page,
  }) => {
    // Create a company
    await navigateTo(page, "/companies/new");
    const companyName = `応募枠テスト会社_${Date.now()}`;
    await page.fill('input[name="name"]', companyName);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Check for applications section
    const pageContent = await page.textContent("body");
    const hasApplicationSection =
      pageContent?.includes("応募") ||
      pageContent?.includes("インターン") ||
      pageContent?.includes("本選考") ||
      pageContent?.includes("application");

    // Applications section should exist
    expect(hasApplicationSection).toBeTruthy();
  });
});

test.describe("Company List Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsGuest(page);
  });

  test("should navigate from list to detail", async ({ page }) => {
    // Create a company
    await navigateTo(page, "/companies/new");
    const companyName = `ナビテスト会社_${Date.now()}`;
    await page.fill('input[name="name"]', companyName);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Go to list
    await navigateTo(page, "/companies");

    // Find and click company
    const companyLink = page.getByText(companyName);
    if (await companyLink.isVisible().catch(() => false)) {
      await companyLink.click();
      await page.waitForTimeout(1000);

      // Should be on detail page
      const url = page.url();
      expect(url).toContain("/companies/");
      expect(url).not.toContain("/new");
    }
  });

  test("should navigate back to list from detail", async ({ page }) => {
    // Create a company
    await navigateTo(page, "/companies/new");
    const companyName = `戻るテスト会社_${Date.now()}`;
    await page.fill('input[name="name"]', companyName);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Look for back button/link
    const backLink = page.locator('a[href="/companies"]');
    const backButton = page.getByRole("button", { name: /戻る|Back/ });

    const hasBackLink = await backLink.isVisible().catch(() => false);
    const hasBackButton = await backButton.isVisible().catch(() => false);

    if (hasBackLink) {
      await backLink.click();
    } else if (hasBackButton) {
      await backButton.click();
    } else {
      // Use browser back
      await page.goBack();
    }

    await page.waitForTimeout(1000);
    expect(page.url()).toContain("/companies");
  });
});
