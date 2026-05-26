import { describe, expect, it } from "vitest";
import {
  isDeployedAppEnvironment,
  resolveAppEnvironment,
  validateAppEnvironmentConfiguration,
} from "./deployment";

describe("deployment env", () => {
  it("defaults local outside production builds", () => {
    expect(resolveAppEnvironment({ NODE_ENV: "development" })).toBe("local");
    expect(isDeployedAppEnvironment({ NODE_ENV: "test" })).toBe(false);
  });

  it("uses explicit APP_ENV over Vercel provider env", () => {
    expect(
      resolveAppEnvironment({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        APP_ENV: "staging",
        NEXT_PUBLIC_APP_ENV: "staging",
      }),
    ).toBe("staging");
  });

  it("does not map Vercel preview to staging", () => {
    expect(resolveAppEnvironment({ NODE_ENV: "development", VERCEL_ENV: "preview" })).toBe("local");
  });

  it("requires matching server and public app env in production builds", () => {
    expect(
      validateAppEnvironmentConfiguration({
        NODE_ENV: "production",
        APP_ENV: "staging",
        NEXT_PUBLIC_APP_ENV: "production",
      }).join("\n"),
    ).toMatch(/must match/);
  });

  it("allows explicit local app env during local production builds", () => {
    expect(
      validateAppEnvironmentConfiguration({
        NODE_ENV: "production",
        APP_ENV: "local",
        NEXT_PUBLIC_APP_ENV: "local",
      }).join("\n"),
    ).toBe("");
    expect(
      resolveAppEnvironment({
        NODE_ENV: "production",
        APP_ENV: "local",
        NEXT_PUBLIC_APP_ENV: "local",
      }),
    ).toBe("local");
  });

  it("rejects local app env in provider deployments", () => {
    expect(
      validateAppEnvironmentConfiguration({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        APP_ENV: "local",
        NEXT_PUBLIC_APP_ENV: "local",
      }).join("\n"),
    ).toMatch(/must not be local/);
  });

  it("requires explicit app env in production builds unless both values are local", () => {
    expect(
      validateAppEnvironmentConfiguration({
        NODE_ENV: "production",
      }).join("\n"),
    ).toMatch(/must be configured in production builds/);
  });
});
