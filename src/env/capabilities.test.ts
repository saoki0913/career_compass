import { describe, expect, it } from "vitest";
import {
  AuthConfigurationError,
  getDatabaseEnvStatus,
  requireAuthEnv,
  validateStartupCapabilities,
} from "./capabilities";

const validAuthEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
  GOOGLE_CLIENT_ID: "google-client",
  GOOGLE_CLIENT_SECRET: "google-secret",
};

describe("capability env validation", () => {
  it("allows auth env without unrelated Stripe, FastAPI, cron, or encryption env", () => {
    const authEnv = requireAuthEnv({
      ...validAuthEnv,
      NEXT_PUBLIC_APP_URL: "",
    });

    expect(authEnv.GOOGLE_CLIENT_ID).toBe("google-client");
    expect(authEnv.baseURL).toBe("http://localhost:3000");
  });

  it("reports auth env failures as typed safe keys", () => {
    expect(() =>
      requireAuthEnv({
        ...validAuthEnv,
        GOOGLE_CLIENT_SECRET: "",
      }),
    ).toThrow(AuthConfigurationError);
  });

  it("does not require DB for the local startup profile", () => {
    const report = validateStartupCapabilities("development", {});

    expect(report.fatal).toEqual([]);
    expect(report.disabled).toContain("database");
  });

  it("requires deployed profile capabilities", () => {
    const report = validateStartupCapabilities("preview", validAuthEnv);

    expect(report.fatal.join("\n")).toMatch(/STRIPE_SECRET_KEY/);
    expect(report.fatal.join("\n")).toMatch(/FASTAPI_URL/);
  });

  it("validates DATABASE_URL only when database capability is configured", () => {
    expect(getDatabaseEnvStatus({}).configured).toBe(false);
    expect(getDatabaseEnvStatus({ DATABASE_URL: "postgresql://user:pass@localhost:5432/app" }).configured).toBe(true);
  });
});
