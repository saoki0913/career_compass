export type RouteOwner = "marketing" | "product" | "auth";
export type RouteSurface = "public" | "product" | "auth";

export type AppRouteDefinition = {
  id: string;
  path: `/${string}`;
  owner: RouteOwner;
  surface: RouteSurface;
  page: `src/app/${string}/page.tsx`;
  sitemap: boolean;
};

export const appRouteDefinitions = [
  {
    id: "marketing.pricing",
    path: "/pricing",
    owner: "marketing",
    surface: "public",
    page: "src/app/(marketing)/pricing/page.tsx",
    sitemap: true,
  },
  {
    id: "marketing.pricingCheckout",
    path: "/pricing/checkout",
    owner: "marketing",
    surface: "public",
    page: "src/app/(marketing)/pricing/checkout/page.tsx",
    sitemap: false,
  },
  {
    id: "auth.login",
    path: "/login",
    owner: "auth",
    surface: "auth",
    page: "src/app/(auth)/login/page.tsx",
    sitemap: false,
  },
  {
    id: "auth.onboarding",
    path: "/onboarding",
    owner: "auth",
    surface: "auth",
    page: "src/app/(auth)/onboarding/page.tsx",
    sitemap: false,
  },
  {
    id: "product.dashboard",
    path: "/dashboard",
    owner: "product",
    surface: "product",
    page: "src/app/(product)/dashboard/page.tsx",
    sitemap: false,
  },
  {
    id: "product.companies",
    path: "/companies",
    owner: "product",
    surface: "product",
    page: "src/app/(product)/companies/page.tsx",
    sitemap: false,
  },
  {
    id: "product.calendar",
    path: "/calendar",
    owner: "product",
    surface: "product",
    page: "src/app/(product)/calendar/page.tsx",
    sitemap: false,
  },
  {
    id: "product.calendarConnect",
    path: "/calendar/connect",
    owner: "product",
    surface: "product",
    page: "src/app/(product)/calendar/connect/page.tsx",
    sitemap: false,
  },
  {
    id: "product.calendarSettings",
    path: "/calendar/settings",
    owner: "product",
    surface: "product",
    page: "src/app/(product)/calendar/settings/page.tsx",
    sitemap: false,
  },
  {
    id: "product.profile",
    path: "/profile",
    owner: "product",
    surface: "product",
    page: "src/app/(product)/profile/page.tsx",
    sitemap: false,
  },
  {
    id: "product.settings",
    path: "/settings",
    owner: "product",
    surface: "product",
    page: "src/app/(product)/settings/page.tsx",
    sitemap: false,
  },
] as const satisfies readonly AppRouteDefinition[];

export type AppRouteId = (typeof appRouteDefinitions)[number]["id"];
export type AppPath = (typeof appRouteDefinitions)[number]["path"];
export type PublicAppPath = Extract<
  (typeof appRouteDefinitions)[number],
  { surface: "public" }
>["path"];

export const appPaths = {
  auth: {
    login: "/login",
    onboarding: "/onboarding",
  },
  marketing: {
    pricing: "/pricing",
    pricingCheckout: "/pricing/checkout",
  },
  product: {
    dashboard: "/dashboard",
    companies: "/companies",
    calendar: "/calendar",
    calendarConnect: "/calendar/connect",
    calendarSettings: "/calendar/settings",
    profile: "/profile",
    settings: "/settings",
  },
} as const satisfies Record<string, Record<string, AppPath>>;
