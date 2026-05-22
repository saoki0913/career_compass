import {
  screenshotCaptureRoutes,
  type ScreenshotCaptureRoute,
} from "../../src/lib/screenshot-capture-routes";

type ScreenshotCaptureScenario = ScreenshotCaptureRoute & {
  expectedFinalPaths?: readonly `/${string}`[];
  stateId: string;
};

const defaultScenarios = screenshotCaptureRoutes.map((route) => ({
  ...route,
  stateId: "default",
}));

const additionalScenarios = [
  {
    id: "marketing.pricingCanceled",
    pathTemplate: "/pricing?checkout=canceled&source=standard",
    page: "src/app/(marketing)/pricing/page.tsx",
    owner: "marketing",
    surface: "public",
    authMode: "none",
    outputGroup: "marketing",
    stateId: "checkout-canceled",
  },
  {
    id: "auth.loginRedirect",
    pathTemplate: "/login?redirect=/dashboard",
    page: "src/app/(auth)/login/page.tsx",
    owner: "auth",
    surface: "auth",
    authMode: "none",
    outputGroup: "auth",
    stateId: "redirect-dashboard",
  },
  {
    id: "product.searchResults",
    pathTemplate: "/search?q=%E4%B8%89%E8%8F%B1%E5%95%86%E4%BA%8B",
    page: "src/app/(product)/search/page.tsx",
    owner: "product",
    surface: "product",
    authMode: "real",
    outputGroup: "product",
    stateId: "query-results",
  },
  {
    id: "product.settingsPortalReturn",
    pathTemplate: "/settings?portal=return",
    expectedFinalPaths: ["/settings?portal=return", "/settings"],
    page: "src/app/(product)/settings/page.tsx",
    owner: "product",
    surface: "product",
    authMode: "real",
    outputGroup: "product",
    stateId: "portal-return",
  },
] as const satisfies readonly ScreenshotCaptureScenario[];

export const screenshotCaptureScenarios = [
  ...defaultScenarios,
  ...additionalScenarios,
] as const;

export type ScreenshotCaptureScenarioDefinition = (typeof screenshotCaptureScenarios)[number];
