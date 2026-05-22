import fs from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";
import type { Browser, BrowserContext, APIRequestContext, Page } from "@playwright/test";
import {
  type ScreenshotCaptureDynamicSource,
} from "../../src/lib/screenshot-capture-routes";
import {
  screenshotCaptureScenarios,
  type ScreenshotCaptureScenarioDefinition,
} from "./screenshot-capture-scenarios";
import { ensureCiE2EAuthSession } from "../google-auth";

const viewports = [
  { height: 844, name: "mobile", width: 390 },
  { height: 1024, name: "tablet", width: 768 },
  { height: 900, name: "desktop", width: 1440 },
] as const;

type ViewportName = (typeof viewports)[number]["name"];

type DynamicIds = Partial<Record<ScreenshotCaptureDynamicSource, string>>;

const screenshotFixtures = {
  companyName: "スクリーンショット株式会社",
  calendarDeadlineDueDate: "2026-05-03T14:00:00.000Z",
  calendarDeadlineTitle: "ES提出",
  calendarWorkBlockEndAt: "2026-05-03T11:30:00.000Z",
  calendarWorkBlockStartAt: "2026-05-03T10:00:00.000Z",
  calendarWorkBlockTitle: "ESブラッシュアップ",
  documentTitle: "スクリーンショット用 ES",
  gakuchikaTitle: "スクリーンショット用ガクチカ",
} as const;

type CaptureManifestEntry = {
  routeId: string;
  stateId: string;
  pathTemplate: string;
  capturePath: string | null;
  finalUrl: string | null;
  viewport: ViewportName;
  outputPath: string | null;
  status: "captured" | "missing-data" | "failed";
  message?: string;
};

type CaptureManifest = {
  capturedAt: string;
  outputDir: string;
  entries: CaptureManifestEntry[];
};

const outputDir = path.resolve(
  process.cwd(),
  process.env.PLAYWRIGHT_SCREENSHOT_CAPTURE_OUTPUT_DIR?.trim() || "public/screenshots/generated",
);
const viewportFilter = parseCsv(process.env.PLAYWRIGHT_SCREENSHOT_CAPTURE_VIEWPORTS);
const routeFilter = parseCsv(process.env.PLAYWRIGHT_SCREENSHOT_CAPTURE_FILTERS);
const groupFilter = parseCsv(process.env.PLAYWRIGHT_SCREENSHOT_CAPTURE_GROUPS);

function parseCsv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function selectedViewports() {
  if (viewportFilter.length === 0) {
    return viewports;
  }
  const selected = viewports.filter((viewport) => viewportFilter.includes(viewport.name));
  if (selected.length !== viewportFilter.length) {
    const validNames = viewports.map((viewport) => viewport.name).join(", ");
    throw new Error(`Unknown screenshot viewport. Valid values: ${validNames}`);
  }
  return selected;
}

function selectedRoutes() {
  const groupSelected =
    groupFilter.length === 0
      ? screenshotCaptureScenarios
      : screenshotCaptureScenarios.filter((route) => groupFilter.includes(route.outputGroup));

  const selected =
    routeFilter.length === 0
      ? groupSelected
      : groupSelected.filter((route) =>
          routeFilter.some((filter) => filter === route.id || filter === route.pathTemplate),
        );
  const known = new Set<string>(screenshotCaptureScenarios.flatMap((route) => [route.id, route.pathTemplate]));
  const unknown = routeFilter.filter((filter) => !known.has(filter));
  if (unknown.length > 0) {
    throw new Error(`Unknown screenshot route filter: ${unknown.join(", ")}`);
  }
  const knownGroups = new Set<string>(screenshotCaptureScenarios.map((route) => route.outputGroup));
  const unknownGroups = groupFilter.filter((group) => !knownGroups.has(group));
  if (unknownGroups.length > 0) {
    throw new Error(`Unknown screenshot group filter: ${unknownGroups.join(", ")}`);
  }
  if (selected.length === 0) {
    throw new Error("No screenshot routes matched the selected filters.");
  }
  return selected;
}

function resolveUrl(baseURL: string | undefined, routePath: string) {
  return new URL(routePath, baseURL?.trim() || "http://localhost:3000").toString();
}

function assertLocalScreenshotMutationAllowed(baseURL: string | undefined) {
  const origin = new URL(resolveUrl(baseURL, "/"));
  const isLocalHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(origin.hostname);
  const appEnv = process.env.APP_ENV?.trim() || process.env.NEXT_PUBLIC_APP_ENV?.trim() || "local";
  if (origin.protocol !== "http:" || !isLocalHost || appEnv === "staging" || appEnv === "production") {
    throw new Error("Screenshot fixture creation is allowed only for local http app environments.");
  }
}

async function readJson(request: APIRequestContext, baseURL: string | undefined, endpoint: string) {
  const response = await request.get(resolveUrl(baseURL, endpoint));
  if (!response.ok()) {
    return null;
  }
  return response.json().catch(() => null) as Promise<unknown>;
}

function matchingId(
  payload: unknown,
  key: "companies" | "documents" | "gakuchikas",
  field: "name" | "title",
  expectedValue: string,
) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  if (!Array.isArray(value)) {
    return null;
  }
  const match = value.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return (item as Record<string, unknown>)[field] === expectedValue;
  });
  if (!match || typeof match !== "object") {
    return null;
  }
  const id = (match as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id : null;
}

function hasCalendarFixtureItem(
  payload: unknown,
  key: "events" | "deadlines",
  expected: { companyId?: string; dateField: "dueDate" | "startAt"; title: string; value: string },
) {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const value = (payload as Record<string, unknown>)[key];
  if (!Array.isArray(value)) {
    return false;
  }
  return value.some((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const record = item as Record<string, unknown>;
    if (record.title !== expected.title || record[expected.dateField] !== expected.value) {
      return false;
    }
    return !expected.companyId || record.companyId === expected.companyId;
  });
}

async function getCsrfHeaders(context: BrowserContext, baseURL: string | undefined) {
  const origin = new URL(resolveUrl(baseURL, "/")).origin;
  await context.request.get(resolveUrl(baseURL, "/api/csrf"));
  const cookies = await context.cookies(origin);
  const csrfToken = cookies.find((cookie) => cookie.name === "csrf_token")?.value;
  return {
    Origin: origin,
    Referer: `${origin}/`,
    ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
  };
}

async function createScreenshotDocument(
  context: BrowserContext,
  baseURL: string | undefined,
  companyId: string | undefined,
) {
  const origin = new URL(resolveUrl(baseURL, "/")).origin;
  await context.request.get(resolveUrl(baseURL, "/api/csrf"));
  const cookies = await context.cookies(origin);
  const csrfToken = cookies.find((cookie) => cookie.name === "csrf_token")?.value;
  const response = await context.request.post(resolveUrl(baseURL, "/api/documents"), {
    data: {
      title: screenshotFixtures.documentTitle,
      type: "es",
      ...(companyId ? { companyId } : {}),
    },
    headers: {
      Origin: origin,
      Referer: `${origin}/`,
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
  });
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to create screenshot ES document: ${response.status()} ${body.slice(0, 500)}`);
  }
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!payload || typeof payload !== "object") {
    throw new Error("Failed to create screenshot ES document: invalid JSON response");
  }
  const document = (payload as Record<string, unknown>).document;
  if (!document || typeof document !== "object") {
    throw new Error("Failed to create screenshot ES document: missing document payload");
  }
  const id = (document as Record<string, unknown>).id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Failed to create screenshot ES document: missing document id");
  }
  return id;
}

async function createScreenshotCompany(context: BrowserContext, baseURL: string | undefined) {
  const origin = new URL(resolveUrl(baseURL, "/")).origin;
  await context.request.get(resolveUrl(baseURL, "/api/csrf"));
  const cookies = await context.cookies(origin);
  const csrfToken = cookies.find((cookie) => cookie.name === "csrf_token")?.value;
  const response = await context.request.post(resolveUrl(baseURL, "/api/companies"), {
    data: {
      name: screenshotFixtures.companyName,
      industry: "IT・通信",
      status: "es",
      notes: "スクリーンショット撮影用のローカルデータです。",
    },
    headers: {
      Origin: origin,
      Referer: `${origin}/`,
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
  });
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to create screenshot company: ${response.status()} ${body.slice(0, 500)}`);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    throw new Error("Failed to create screenshot company: invalid JSON response");
  }
  const company = (payload as Record<string, unknown>).company;
  if (!company || typeof company !== "object") {
    throw new Error("Failed to create screenshot company: missing company payload");
  }
  const id = (company as Record<string, unknown>).id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Failed to create screenshot company: missing company id");
  }
  return id;
}

async function createScreenshotGakuchika(context: BrowserContext, baseURL: string | undefined) {
  const origin = new URL(resolveUrl(baseURL, "/")).origin;
  await context.request.get(resolveUrl(baseURL, "/api/csrf"));
  const cookies = await context.cookies(origin);
  const csrfToken = cookies.find((cookie) => cookie.name === "csrf_token")?.value;
  const response = await context.request.post(resolveUrl(baseURL, "/api/gakuchika"), {
    data: {
      title: screenshotFixtures.gakuchikaTitle,
      content:
        "大学のゼミで地域企業の採用課題を調査し、学生アンケートの設計、分析、改善提案まで担当しました。限られた期間で役割分担を見直し、最終発表では企業担当者から実行しやすい提案だと評価されました。",
      charLimitType: "400",
    },
    headers: {
      Origin: origin,
      Referer: `${origin}/`,
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
  });
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to create screenshot gakuchika: ${response.status()} ${body.slice(0, 500)}`);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    throw new Error("Failed to create screenshot gakuchika: invalid JSON response");
  }
  const gakuchika = (payload as Record<string, unknown>).gakuchika;
  if (!gakuchika || typeof gakuchika !== "object") {
    throw new Error("Failed to create screenshot gakuchika: missing gakuchika payload");
  }
  const id = (gakuchika as Record<string, unknown>).id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Failed to create screenshot gakuchika: missing gakuchika id");
  }
  return id;
}

async function createScreenshotCalendarDeadline(
  context: BrowserContext,
  baseURL: string | undefined,
  companyId: string,
) {
  const response = await context.request.post(resolveUrl(baseURL, `/api/companies/${companyId}/deadlines`), {
    data: {
      type: "es_submission",
      title: screenshotFixtures.calendarDeadlineTitle,
      dueDate: screenshotFixtures.calendarDeadlineDueDate,
      memo: "スクリーンショット撮影用の締切です。",
    },
    headers: await getCsrfHeaders(context, baseURL),
  });
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to create screenshot calendar deadline: ${response.status()} ${body.slice(0, 500)}`);
  }
}

async function createScreenshotCalendarWorkBlock(context: BrowserContext, baseURL: string | undefined) {
  const response = await context.request.post(resolveUrl(baseURL, "/api/calendar/events"), {
    data: {
      type: "work_block",
      title: screenshotFixtures.calendarWorkBlockTitle,
      startAt: screenshotFixtures.calendarWorkBlockStartAt,
      endAt: screenshotFixtures.calendarWorkBlockEndAt,
    },
    headers: await getCsrfHeaders(context, baseURL),
  });
  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to create screenshot calendar work block: ${response.status()} ${body.slice(0, 500)}`);
  }
}

async function ensureScreenshotCalendarData(
  context: BrowserContext,
  baseURL: string | undefined,
  companyId: string,
) {
  const calendarPayload = await readJson(
    context.request,
    baseURL,
    "/api/calendar/events?start=2026-05-01T00:00:00.000Z&end=2026-05-31T23:59:59.999Z",
  );

  if (
    !hasCalendarFixtureItem(calendarPayload, "deadlines", {
      companyId,
      dateField: "dueDate",
      title: screenshotFixtures.calendarDeadlineTitle,
      value: screenshotFixtures.calendarDeadlineDueDate,
    })
  ) {
    await createScreenshotCalendarDeadline(context, baseURL, companyId);
  }

  if (
    !hasCalendarFixtureItem(calendarPayload, "events", {
      dateField: "startAt",
      title: screenshotFixtures.calendarWorkBlockTitle,
      value: screenshotFixtures.calendarWorkBlockStartAt,
    })
  ) {
    await createScreenshotCalendarWorkBlock(context, baseURL);
  }
}

async function loadDynamicIds(
  context: BrowserContext,
  baseURL: string | undefined,
  requiredSources: ReadonlySet<ScreenshotCaptureDynamicSource>,
  options: { ensureCalendar?: boolean } = {},
): Promise<DynamicIds> {
  assertLocalScreenshotMutationAllowed(baseURL);
  const ids: DynamicIds = {};
  const needsCompany = requiredSources.has("company") || requiredSources.has("document") || options.ensureCalendar;
  let companyId: string | undefined;

  if (needsCompany) {
    const companies = await readJson(context.request, baseURL, "/api/companies");
    companyId =
      matchingId(companies, "companies", "name", screenshotFixtures.companyName) ??
      (await createScreenshotCompany(context, baseURL));
    ids.company = companyId;
  }

  if (requiredSources.has("document")) {
    const documentsPayload = await readJson(context.request, baseURL, "/api/documents?type=es");
    ids.document =
      matchingId(documentsPayload, "documents", "title", screenshotFixtures.documentTitle) ??
      (await createScreenshotDocument(context, baseURL, companyId));
  }

  if (requiredSources.has("gakuchika")) {
    const gakuchikas = await readJson(context.request, baseURL, "/api/gakuchika");
    ids.gakuchika =
      matchingId(gakuchikas, "gakuchikas", "title", screenshotFixtures.gakuchikaTitle) ??
      (await createScreenshotGakuchika(context, baseURL));
  }

  if (options.ensureCalendar) {
    if (!companyId) {
      throw new Error("Screenshot calendar fixture requires a company id.");
    }
    await ensureScreenshotCalendarData(context, baseURL, companyId);
  }

  return ids;
}

function buildCapturePath(route: ScreenshotCaptureScenarioDefinition, ids: DynamicIds) {
  let capturePath: string = route.pathTemplate;
  const dynamicParams = "dynamicParams" in route ? route.dynamicParams : undefined;
  for (const [segment, source] of Object.entries(dynamicParams ?? {})) {
    const id = ids[source];
    if (!id) {
      return null;
    }
    capturePath = capturePath.replace(`[${segment}]`, encodeURIComponent(id));
  }
  return capturePath;
}

function outputPathFor(route: ScreenshotCaptureScenarioDefinition, viewportName: ViewportName) {
  return path.join(outputDir, route.outputGroup, route.id, `${viewportName}.png`);
}

function requiredDynamicSourcesFor(routes: readonly ScreenshotCaptureScenarioDefinition[]) {
  const sources = new Set<ScreenshotCaptureDynamicSource>();
  for (const route of routes) {
    const dynamicParams = "dynamicParams" in route ? route.dynamicParams : undefined;
    for (const source of Object.values(dynamicParams ?? {})) {
      sources.add(source);
    }
    if (route.id === "product.calendar") {
      sources.add("company");
    }
  }
  return sources;
}

function assertExpectedFinalPath(page: Page, route: ScreenshotCaptureScenarioDefinition, capturePath: string, baseURL: string | undefined) {
  const actualUrl = new URL(page.url());
  const actualPath = `${actualUrl.pathname}${actualUrl.search}`;
  const expectedRoutePaths =
    "expectedFinalPaths" in route && route.expectedFinalPaths
      ? route.expectedFinalPaths
      : ["expectedFinalPath" in route ? route.expectedFinalPath : capturePath];
  const expectedUrls = expectedRoutePaths.map((routePath) => new URL(resolveUrl(baseURL, routePath)));
  const expectedOrigin = expectedUrls[0].origin;
  if (actualUrl.origin !== expectedOrigin) {
    throw new Error(`unexpected final origin: expected=${expectedOrigin}, actual=${actualUrl.origin}`);
  }
  const expectedPaths = expectedUrls.map((url) => `${url.pathname}${url.search}`);
  if (!expectedPaths.includes(actualPath)) {
    throw new Error(`unexpected final path: expected=${expectedPaths.join(" or ")}, actual=${actualPath}`);
  }
}

async function createContext(browser: Browser, route: ScreenshotCaptureScenarioDefinition): Promise<BrowserContext> {
  if (route.authMode !== "real") {
    return browser.newContext({ storageState: { cookies: [], origins: [] } });
  }

  const storageState = process.env.PLAYWRIGHT_AUTH_STATE?.trim();
  if (storageState) {
    return browser.newContext({ storageState });
  }

  if (process.env.CI_E2E_AUTH_SECRET?.trim()) {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await ensureCiE2EAuthSession(page);
    } finally {
      await page.close().catch(() => {});
    }
    return context;
  }

  throw new Error("PLAYWRIGHT_AUTH_STATE or CI_E2E_AUTH_SECRET is required for product screenshot capture");
}

async function verifyRealSession(context: BrowserContext, baseURL: string | undefined) {
  const response = await context.request.get(resolveUrl(baseURL, "/api/auth/get-session"));
  const body = await response.json().catch(() => null);
  if (!response.ok() || !body?.user?.id) {
    throw new Error(`Authenticated screenshot session is invalid: status=${response.status()}`);
  }
}

async function waitForVisualSettle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.locator("body").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("h1, main, [data-section]").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  await waitForFiniteAnimations(page);
  await prepareLazyRenderedContent(page);
  await waitForFontsAndImages(page);
  await waitForDocumentStability(page);
  await waitForLoadingIndicatorsToClear(page);
  await waitForSnackbarsToClear(page);
  await waitForFiniteAnimations(page);
  await page.waitForTimeout(1_000);
  await waitForFontsAndImages(page);
  await waitForDocumentStability(page);
  await waitForLoadingIndicatorsToClear(page);
  await waitForSnackbarsToClear(page);
}

async function prepareLazyRenderedContent(page: Page) {
  await page.evaluate(async () => {
    const viewportHeight = window.innerHeight || 800;
    for (let pass = 0; pass < 2; pass += 1) {
      const scrollHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      for (let y = 0; y <= scrollHeight; y += Math.max(1, viewportHeight * 0.55)) {
        window.scrollTo(0, y);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
      }
    }
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
  });
}

async function waitForFontsAndImages(page: Page) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    const imagePromises = Array.from(document.images).map(async (image) => {
      if (image.complete && image.naturalWidth !== 0) {
        return;
      }
      if (typeof image.decode === "function") {
        await image.decode().catch(() => {});
        return;
      }
      await new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    });
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 10_000));
    await Promise.race([Promise.all(imagePromises).then(() => undefined), timeout]);
  });
}

async function waitForDocumentStability(page: Page) {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        let stableSamples = 0;
        let lastSample = "";
        const sample = () => {
          const scrollHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
          const textLength = document.body.innerText.replace(/\s+/g, "").length;
          const pendingImages = Array.from(document.images).filter((image) => !image.complete).length;
          const currentSample = `${scrollHeight}:${textLength}:${pendingImages}`;
          stableSamples = currentSample === lastSample ? stableSamples + 1 : 0;
          lastSample = currentSample;
          if (stableSamples >= 4) {
            resolve(true);
            return;
          }
          window.setTimeout(sample, 250);
        };
        sample();
      }),
    { timeout: 10_000 },
  );
}

async function waitForFiniteAnimations(page: Page) {
  await page.evaluate(async () => {
    const animations = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getTiming();
      return timing?.iterations !== Infinity && animation.playState === "running";
    });
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 3_000));
    await Promise.race([
      Promise.all(animations.map((animation) => animation.finished.catch(() => undefined))).then(() => undefined),
      timeout,
    ]);
  });
}

async function waitForLoadingIndicatorsToClear(page: Page) {
  await page.waitForFunction(
    () => {
      const loadingSelectors = [
        '[data-slot="skeleton"]',
        ".skeleton-shimmer",
        ".skeleton-shimmer-inverse",
        '[aria-busy="true"]',
        '[data-loading="true"]',
      ];
      const isVisible = (element: Element) => {
        const style = window.getComputedStyle(element);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          element.getClientRects().length > 0
        );
      };
      return !loadingSelectors.some((selector) =>
        Array.from(document.querySelectorAll(selector)).some(isVisible),
      );
    },
    { timeout: 30_000 },
  );
}

async function waitForSnackbarsToClear(page: Page) {
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("[data-app-snackbar]")).some((element) => {
        const style = window.getComputedStyle(element);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          element.getClientRects().length > 0
        );
      }),
    { timeout: 10_000 },
  );
}

async function hideSnackbarsForScreenshot(page: Page) {
  await page.addStyleTag({
    content:
      "[data-app-snackbar-root], [data-app-snackbar], nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button] { display: none !important; }",
  });
}

async function freezeProductCalendarClock(page: Page, route: ScreenshotCaptureScenarioDefinition) {
  if (route.id !== "product.calendar") {
    return;
  }
  await page.addInitScript({
    content: `
      (() => {
        const fixedTime = new Date("2026-05-21T09:00:00+09:00").getTime();
        const OriginalDate = Date;
        class FixedDate extends OriginalDate {
          constructor(...args) {
            if (args.length === 0) {
              super(fixedTime);
              return;
            }
            super(...args);
          }
          static now() {
            return fixedTime;
          }
        }
        Object.defineProperty(window, "Date", {
          configurable: true,
          value: FixedDate,
        });
      })();
    `,
  });
}

async function assertNoBlockingScreenshotText(page: Page) {
  const bodyText = await page.locator("body").innerText({ timeout: 10_000 });
  const blockedTexts = ["クレジット情報を読み込めませんでした"];
  const matched = blockedTexts.find((text) => bodyText.includes(text));
  if (matched) {
    throw new Error(`blocking screenshot text is visible: ${matched}`);
  }
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
    viewport: window.innerWidth,
  }));
  if (overflow.body > overflow.viewport + 2) {
    throw new Error(`horizontal overflow: body=${overflow.body}, viewport=${overflow.viewport}`);
  }
}

test.describe.configure({ mode: "serial" });

test("captures all registered screens", async ({ browser, baseURL }) => {
  test.setTimeout(30 * 60_000);

  const routes = selectedRoutes();
  const activeViewports = selectedViewports();
  const requiredDynamicSources = requiredDynamicSourcesFor(routes);
  const capturedAt = new Date().toISOString();
  const entries: CaptureManifestEntry[] = [];

  await fs.mkdir(outputDir, { recursive: true });

  let dynamicIds: DynamicIds = {};
  const shouldLoadScreenshotData = requiredDynamicSources.size > 0;
  if (shouldLoadScreenshotData) {
    const context = await createContext(browser, {
      id: "product.dashboard",
      pathTemplate: "/dashboard",
      page: "src/app/(product)/dashboard/page.tsx",
      owner: "product",
      surface: "product",
      authMode: "real",
      outputGroup: "product",
      stateId: "dynamic-id-loader",
    });
    try {
      await verifyRealSession(context, baseURL);
      dynamicIds = await loadDynamicIds(context, baseURL, requiredDynamicSources, {
        ensureCalendar: routes.some((route) => route.id === "product.calendar"),
      });
    } finally {
      await context.close();
    }
  }

  for (const route of routes) {
    const capturePath = buildCapturePath(route, dynamicIds);
    for (const viewport of activeViewports) {
      if (!capturePath) {
        entries.push({
          routeId: route.id,
          stateId: route.stateId,
          pathTemplate: route.pathTemplate,
          capturePath: null,
          finalUrl: null,
          viewport: viewport.name,
          outputPath: null,
          status: "missing-data",
          message: `Missing dynamic data for ${route.pathTemplate}`,
        });
        continue;
      }

      const context = await createContext(browser, route);
      const page = await context.newPage();
      await page.setViewportSize({ height: viewport.height, width: viewport.width });

      const screenshotPath = outputPathFor(route, viewport.name);
      try {
        process.stdout.write(`[screenshots:capture] ${route.id} ${viewport.name} ${capturePath}\n`);
        if (route.authMode === "real") {
          await verifyRealSession(context, baseURL);
        }
        await freezeProductCalendarClock(page, route);
        await page.goto(resolveUrl(baseURL, capturePath), {
          waitUntil: "domcontentloaded",
          timeout: 90_000,
        });
        await waitForVisualSettle(page);
        assertExpectedFinalPath(page, route, capturePath, baseURL);
        await assertNoHorizontalOverflow(page);
        await assertNoBlockingScreenshotText(page);
        await hideSnackbarsForScreenshot(page);
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
        await page.screenshot({
          animations: "disabled",
          caret: "hide",
          fullPage: true,
          path: screenshotPath,
        });
        entries.push({
          routeId: route.id,
          stateId: route.stateId,
          pathTemplate: route.pathTemplate,
          capturePath,
          finalUrl: page.url(),
          viewport: viewport.name,
          outputPath: path.relative(process.cwd(), screenshotPath),
          status: "captured",
        });
      } catch (error) {
        entries.push({
          routeId: route.id,
          stateId: route.stateId,
          pathTemplate: route.pathTemplate,
          capturePath,
          finalUrl: page.url() || null,
          viewport: viewport.name,
          outputPath: null,
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        await context.close();
      }
    }
  }

  const manifest: CaptureManifest = {
    capturedAt,
    outputDir: path.relative(process.cwd(), outputDir),
    entries,
  };
  await fs.writeFile(
    path.join(outputDir, "_manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  const unsuccessful = entries.filter((entry) => entry.status !== "captured");
  if (unsuccessful.length > 0) {
    throw new Error(
      unsuccessful
        .map((entry) => `${entry.routeId}/${entry.viewport}: ${entry.status} ${entry.message ?? ""}`.trim())
        .join("\n"),
    );
  }
});
