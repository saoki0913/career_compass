import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    const { getRuntimeEnvProfile, validateStartupCapabilities } = await import(
      "@/env/capabilities"
    );
    const profile = getRuntimeEnvProfile();
    const startupReport = validateStartupCapabilities(profile);
    if ((profile === "production" || profile === "staging") && startupReport.fatal.length > 0) {
      throw new Error(`Startup environment validation failed: ${startupReport.fatal.join("; ")}`);
    }

    const isProduction = profile === "production";
    if (isProduction || process.env.STRIPE_SECRET_KEY) {
      try {
        const { validateStripePriceConfig } = await import(
          "@/lib/stripe/config"
        );
        validateStripePriceConfig();
      } catch (e) {
        if (isProduction) throw e;
        console.warn(
          "[instrumentation] Stripe validation deferred:",
          (e as Error).message,
        );
      }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
