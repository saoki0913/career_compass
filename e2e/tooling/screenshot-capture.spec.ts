import fs from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";
import type { Browser, BrowserContext, APIRequestContext, Page } from "@playwright/test";
import {
  screenshotCaptureRoutes,
  type ScreenshotCaptureDynamicSource,
  type ScreenshotCaptureRouteDefinition,
} from "../../src/lib/screenshot-capture-routes";
import { ensureCiE2EAuthSession } from "../google-auth";

const viewports = [
  { height: 844, name: "mobile", width: 390 },
  { height: 1024, name: "tablet", width: 768 },
  { height: 900, name: "desktop", width: 1440 },
] as const;

type ViewportName = (typeof viewports)[number]["name"];

type DynamicIds = Partial<Record<ScreenshotCaptureDynamicSource, string>>;

type CaptureManifestEntry = {
  routeId: string;
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
  if (routeFilter.length === 0) {
    return screenshotCaptureRoutes;
  }
  const selected = screenshotCaptureRoutes.filter((route) =>
    routeFilter.some((filter) => filter === route.id || filter === route.pathTemplate),
  );
  const known = new Set<string>(screenshotCaptureRoutes.flatMap((route) => [route.id, route.pathTemplate]));
  const unknown = routeFilter.filter((filter) => !known.has(filter));
  if (unknown.length > 0) {
    throw new Error(`Unknown screenshot route filter: ${unknown.join(", ")}`);
  }
  return selected;
}

function resolveUrl(baseURL: string | undefined, routePath: string) {
  return new URL(routePath, baseURL?.trim() || "http://localhost:3000").toString();
}

async function readJson(request: APIRequestContext, baseURL: string | undefined, endpoint: string) {
  const response = await request.get(resolveUrl(baseURL, endpoint));
  if (!response.ok()) {
    return null;
  }
  return response.json().catch(() => null) as Promise<unknown>;
}

function firstId(payload: unknown, key: "companies" | "documents" | "gakuchikas") {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  if (!Array.isArray(value)) {
    return null;
  }
  const first = value[0];
  if (!first || typeof first !== "object") {
    return null;
  }
  const id = (first as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id : null;
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
      title: "スクリーンショット用 ES",
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

async function loadDynamicIds(context: BrowserContext, baseURL: string | undefined): Promise<DynamicIds> {
  const [companies, documentsPayload, gakuchikas] = await Promise.all([
    readJson(context.request, baseURL, "/api/companies"),
    readJson(context.request, baseURL, "/api/documents?type=es"),
    readJson(context.request, baseURL, "/api/gakuchika"),
  ]);

  const companyId = firstId(companies, "companies") ?? undefined;
  const documentId =
    firstId(documentsPayload, "documents") ?? (await createScreenshotDocument(context, baseURL, companyId));

  return {
    company: companyId,
    document: documentId,
    gakuchika: firstId(gakuchikas, "gakuchikas") ?? undefined,
  };
}

function buildCapturePath(route: ScreenshotCaptureRouteDefinition, ids: DynamicIds) {
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

function outputPathFor(route: ScreenshotCaptureRouteDefinition, viewportName: ViewportName) {
  return path.join(outputDir, route.outputGroup, route.id, `${viewportName}.png`);
}

function assertExpectedFinalPath(page: Page, route: ScreenshotCaptureRouteDefinition, capturePath: string) {
  const actualPath = new URL(page.url()).pathname;
  const expectedPath = "expectedFinalPath" in route ? route.expectedFinalPath : capturePath;
  if (actualPath !== expectedPath) {
    throw new Error(`unexpected final path: expected=${expectedPath}, actual=${actualPath}`);
  }
}

async function createContext(browser: Browser, route: ScreenshotCaptureRouteDefinition): Promise<BrowserContext> {
  const context = await browser.newContext();
  if (route.authMode === "real" && process.env.CI_E2E_AUTH_SECRET?.trim()) {
    const page = await context.newPage();
    try {
      await ensureCiE2EAuthSession(page);
    } finally {
      await page.close().catch(() => {});
    }
    return context;
  }

  await context.close();
  if (route.authMode === "real") {
    const storageState = process.env.PLAYWRIGHT_AUTH_STATE?.trim();
    if (!storageState) {
      throw new Error("PLAYWRIGHT_AUTH_STATE or CI_E2E_AUTH_SECRET is required for product screenshot capture");
    }
    return browser.newContext({ storageState });
  }
  return browser.newContext();
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
  await page.locator("body").waitFor({ state: "visible", timeout: 30_000 });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    const imagesReady = Promise.all(
      Array.from(document.images)
        .filter((image) => !image.complete)
        .map(
          (image) =>
            new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            }),
        ),
    );
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 5_000));
    await Promise.race([imagesReady, timeout]);
  });
  await page.waitForTimeout(500);
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
  const capturedAt = new Date().toISOString();
  const entries: CaptureManifestEntry[] = [];

  await fs.mkdir(outputDir, { recursive: true });

  let dynamicIds: DynamicIds = {};
  if (routes.some((route) => "dynamicParams" in route)) {
    const context = await createContext(browser, {
      id: "product.dashboard",
      pathTemplate: "/dashboard",
      page: "src/app/(product)/dashboard/page.tsx",
      owner: "product",
      surface: "product",
      authMode: "real",
      outputGroup: "product",
    });
    try {
      await verifyRealSession(context, baseURL);
      dynamicIds = await loadDynamicIds(context, baseURL);
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
        await page.goto(resolveUrl(baseURL, capturePath), {
          waitUntil: "domcontentloaded",
          timeout: 90_000,
        });
        await waitForVisualSettle(page);
        assertExpectedFinalPath(page, route, capturePath);
        await assertNoHorizontalOverflow(page);
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
        await page.screenshot({ fullPage: true, path: screenshotPath });
        entries.push({
          routeId: route.id,
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
