---
name: ukarun:test
description: テスト作成ガイド。Playwright E2E
---

# Skill: ウカルン テスト作成

Use this skill when writing tests for the Career Compass (ウカルン) application.

## When to Use
- User asks to write tests
- User mentions "テスト", "test", "E2E", "Playwright"
- User wants to verify functionality

## Context
- **E2E Framework**: Playwright
- **Config**: `playwright.config.ts`
- **Test Location**: `e2e/`

## Playwright Configuration
```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Test Patterns

### 1. Page Object Model
```typescript
// e2e/pages/DashboardPage.ts
import { Page, Locator } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly mainTask: Locator;
  readonly creditDisplay: Locator;
  readonly notificationList: Locator;

  constructor(page: Page) {
    this.page = page;
    this.mainTask = page.getByTestId('main-task');
    this.creditDisplay = page.getByTestId('credit-display');
    this.notificationList = page.getByTestId('notification-list');
  }

  async goto() {
    await this.page.goto('/dashboard');
  }

  async getCredits(): Promise<number> {
    const text = await this.creditDisplay.textContent();
    return parseInt(text?.match(/\d+/)?.[0] || '0');
  }

  async clickMainTask() {
    await this.mainTask.getByRole('button', { name: '開始する' }).click();
  }
}
```

### 2. Authentication Setup
```typescript
// e2e/fixtures/auth.ts
import { test as base, Page } from '@playwright/test';

// Fixture for authenticated user
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    // Mock authentication or use test account
    await page.goto('/api/auth/test-login');
    await use(page);
  },
});

// Or use storage state
// e2e/setup/auth.setup.ts
import { test as setup } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  // Perform login
  await page.getByLabel('Email').fill('test@example.com');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL('/dashboard');

  // Save storage state
  await page.context().storageState({ path: './e2e/.auth/user.json' });
});
```

### 3. Feature Tests

#### Company Registration Test
```typescript
// e2e/companies/registration.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Company Registration', () => {
  test.use({ storageState: './e2e/.auth/user.json' });

  test('should register a new company', async ({ page }) => {
    await page.goto('/companies');

    // Click add button
    await page.getByRole('button', { name: '企業を追加' }).click();

    // Fill form
    await page.getByLabel('企業名').fill('株式会社テスト');
    await page.getByLabel('業界').selectOption('IT');

    // Submit
    await page.getByRole('button', { name: '登録' }).click();

    // Verify success
    await expect(page.getByText('企業を登録しました')).toBeVisible();
    await expect(page.getByText('株式会社テスト')).toBeVisible();
  });

  test('should show limit error for Free plan', async ({ page }) => {
    // Setup: Already have 5 companies
    await page.goto('/companies');

    // Try to add 6th
    await page.getByRole('button', { name: '企業を追加' }).click();
    await page.getByLabel('企業名').fill('6社目');
    await page.getByRole('button', { name: '登録' }).click();

    // Expect error
    await expect(page.getByText('企業登録数の上限に達しました')).toBeVisible();
    await expect(page.getByRole('link', { name: 'プランをアップグレード' })).toBeVisible();
  });
});
```

#### Credit Consumption Test
```typescript
// e2e/credits/consumption.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Credit Consumption', () => {
  test('should consume credits only on success', async ({ page }) => {
    await page.goto('/dashboard');

    // Get initial credits
    const initialCredits = await page.getByTestId('credit-balance').textContent();

    // Perform ES review
    await page.goto('/documents/doc-1/edit');
    await page.getByRole('button', { name: '添削する' }).click();

    // Wait for completion
    await expect(page.getByText('添削が完了しました')).toBeVisible();

    // Verify credits consumed
    const finalCredits = await page.getByTestId('credit-balance').textContent();
    expect(parseInt(finalCredits!)).toBeLessThan(parseInt(initialCredits!));

    // Verify notification shows consumption
    await expect(page.getByText(/\d+クレジット消費/)).toBeVisible();
  });

  test('should not consume credits on failure', async ({ page }) => {
    // Mock API to fail
    await page.route('/api/ai/review', route => {
      route.fulfill({ status: 500 });
    });

    await page.goto('/dashboard');
    const initialCredits = await page.getByTestId('credit-balance').textContent();

    // Attempt ES review
    await page.goto('/documents/doc-1/edit');
    await page.getByRole('button', { name: '添削する' }).click();

    // Wait for error
    await expect(page.getByText('添削に失敗しました')).toBeVisible();

    // Verify credits unchanged
    const finalCredits = await page.getByTestId('credit-balance').textContent();
    expect(finalCredits).toBe(initialCredits);
  });
});
```

#### Deadline Approval Test
```typescript
// e2e/deadlines/approval.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Deadline Approval', () => {
  test('should require approval for extracted deadlines', async ({ page }) => {
    await page.goto('/companies/company-1');

    // Click fetch info
    await page.getByRole('button', { name: '企業情報を取得' }).click();

    // Wait for extraction
    await expect(page.getByText('締切を承認')).toBeVisible();

    // Verify LOW confidence is unchecked by default
    const lowConfidenceCheckbox = page.getByRole('checkbox', { name: /LOW/ });
    await expect(lowConfidenceCheckbox).not.toBeChecked();

    // HIGH confidence should be checked
    const highConfidenceCheckbox = page.getByRole('checkbox', { name: /HIGH/ });
    await expect(highConfidenceCheckbox).toBeChecked();

    // Try to submit with 0 selected
    await page.getByRole('checkbox').nth(0).uncheck();
    await page.getByRole('checkbox').nth(1).uncheck();
    await page.getByRole('button', { name: '承認' }).click();

    // Expect error
    await expect(page.getByText('少なくとも1件は承認してください')).toBeVisible();
  });
});
```

### 4. API Testing
```typescript
// e2e/api/companies.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Company API', () => {
  test('GET /api/companies returns user companies', async ({ request }) => {
    const response = await request.get('/api/companies', {
      headers: { Authorization: 'Bearer test-token' },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('data');
    expect(Array.isArray(data.data)).toBeTruthy();
  });

  test('POST /api/companies creates company', async ({ request }) => {
    const response = await request.post('/api/companies', {
      headers: { Authorization: 'Bearer test-token' },
      data: { name: 'テスト株式会社', industry: 'IT' },
    });

    expect(response.status()).toBe(201);
    const data = await response.json();
    expect(data.data.name).toBe('テスト株式会社');
  });
});
```

## Test Commands
```bash
npm run test           # Run all tests
npm run test:ui        # Open Playwright UI
npm run test:headed    # Run with browser visible

# Run specific test
npx playwright test companies/registration.spec.ts

# Run with specific project
npx playwright test --project=chromium
```

## Best Practices
1. Use `data-testid` for stable selectors
2. Mock external APIs (Stripe, AI) in tests
3. Test both success and error paths
4. Test credit/limit edge cases
5. Use Page Object Model for reusable components
6. Keep tests independent (no shared state)
