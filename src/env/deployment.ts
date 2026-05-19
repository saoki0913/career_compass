export const APP_ENVIRONMENTS = ["local", "staging", "production"] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

type RuntimeEnv = Record<string, string | undefined>;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseAppEnvironment(value: string | undefined): AppEnvironment | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  return APP_ENVIRONMENTS.includes(cleaned as AppEnvironment)
    ? (cleaned as AppEnvironment)
    : null;
}

export function resolveAppEnvironment(env: RuntimeEnv = process.env): AppEnvironment {
  if (env.NODE_ENV === "production" && !env.VITEST) {
    const appEnv = parseAppEnvironment(env.APP_ENV);
    if (appEnv === "staging" || appEnv === "production") return appEnv;
    const publicAppEnv = parseAppEnvironment(env.NEXT_PUBLIC_APP_ENV);
    if (publicAppEnv === "staging" || publicAppEnv === "production") return publicAppEnv;
    return "production";
  }

  const appEnv = parseAppEnvironment(env.APP_ENV);
  if (appEnv) return appEnv;

  const publicAppEnv = parseAppEnvironment(env.NEXT_PUBLIC_APP_ENV);
  if (publicAppEnv) return publicAppEnv;

  return "local";
}

export function isDeployedAppEnvironment(env: RuntimeEnv = process.env): boolean {
  return resolveAppEnvironment(env) !== "local";
}

export function validateAppEnvironmentConfiguration(env: RuntimeEnv = process.env): string[] {
  const errors: string[] = [];
  const appEnvRaw = clean(env.APP_ENV);
  const publicAppEnvRaw = clean(env.NEXT_PUBLIC_APP_ENV);
  const appEnv = parseAppEnvironment(appEnvRaw);
  const publicAppEnv = parseAppEnvironment(publicAppEnvRaw);

  if (appEnvRaw && !appEnv) {
    errors.push("APP_ENV must be one of local, staging, production.");
  }
  if (publicAppEnvRaw && !publicAppEnv) {
    errors.push("NEXT_PUBLIC_APP_ENV must be one of local, staging, production.");
  }
  if (appEnv && publicAppEnv && appEnv !== publicAppEnv) {
    errors.push("APP_ENV and NEXT_PUBLIC_APP_ENV must match.");
  }
  const isRealProductionBuild = env.NODE_ENV === "production" && !env.VITEST;
  const isDeployedProfile =
    appEnv === "staging" ||
    appEnv === "production" ||
    publicAppEnv === "staging" ||
    publicAppEnv === "production";
  const hasExplicitLocalProfile = appEnv === "local" || publicAppEnv === "local";
  if ((isRealProductionBuild || isDeployedProfile) && (!appEnvRaw || !publicAppEnvRaw)) {
    errors.push("APP_ENV and NEXT_PUBLIC_APP_ENV must be configured in deployed builds.");
  }
  if (hasExplicitLocalProfile && (isRealProductionBuild || isDeployedProfile || Boolean(env.VERCEL_ENV))) {
    errors.push("APP_ENV and NEXT_PUBLIC_APP_ENV must not be local in deployed builds.");
  }

  return errors;
}
