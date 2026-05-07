const DEV_SCRIPT_EXTRAS = process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : [];
const STATIC_SCRIPT_BASE = ["'self'", "https://js.stripe.com", "https://www.googletagmanager.com"];

const CONNECT_SRC = [
  "'self'",
  "https://api.stripe.com",
  "https://accounts.google.com",
  "https://www.google-analytics.com",
  "https://region1.google-analytics.com",
  "https://www.googletagmanager.com",
];

const BASE_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com https://www.google-analytics.com https://img.logo.dev https://cdn.brandfetch.io https://www.google.com https://icons.duckduckgo.com",
  "font-src 'self'",
  `connect-src ${CONNECT_SRC.join(" ")}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const NONCE_ROUTE_PREFIXES = [
  "/dashboard",
  "/companies",
  "/es",
  "/tasks",
  "/calendar",
  "/settings",
  "/notifications",
  "/search",
  "/gakuchika",
  "/profile",
  "/login",
  "/onboarding",
] as const;

export function isHtmlDocumentRequest(pathname: string, accept: string, method: string) {
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next") || pathname.includes(".")) {
    return false;
  }
  return accept.includes("text/html");
}

export function shouldUseNonceCsp(pathname: string) {
  return NONCE_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function createCspNonce() {
  const encode = globalThis.btoa ?? ((value: string) => Buffer.from(value).toString("base64"));
  return encode(crypto.randomUUID());
}

function buildScriptSrc(values: string[]) {
  return ["script-src", ...values, ...DEV_SCRIPT_EXTRAS].join(" ").trim();
}

export function buildStaticCsp() {
  return [
    buildScriptSrc(STATIC_SCRIPT_BASE),
    ...BASE_DIRECTIVES,
  ].join("; ");
}

export function buildNonceCsp(nonce: string) {
  const scriptSrc = buildScriptSrc([
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https://js.stripe.com",
  ]);

  return [scriptSrc, ...BASE_DIRECTIVES].join("; ");
}
