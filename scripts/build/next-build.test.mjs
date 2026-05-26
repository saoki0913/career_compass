import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveNextBuildEnv, shouldDefaultToLocalBuildEnv } from "./next-build.mjs";

describe("next-build", () => {
  it("defaults local app env for local npm builds", () => {
    const env = resolveNextBuildEnv({});

    assert.equal(env.APP_ENV, "local");
    assert.equal(env.NEXT_PUBLIC_APP_ENV, "local");
  });

  it("does not override explicit app env", () => {
    const env = resolveNextBuildEnv({
      APP_ENV: "production",
      NEXT_PUBLIC_APP_ENV: "production",
    });

    assert.equal(env.APP_ENV, "production");
    assert.equal(env.NEXT_PUBLIC_APP_ENV, "production");
  });

  it("does not default in CI or provider deployments", () => {
    assert.equal(shouldDefaultToLocalBuildEnv({ CI: "true" }), false);
    assert.equal(shouldDefaultToLocalBuildEnv({ VERCEL_ENV: "production" }), false);
    assert.equal(shouldDefaultToLocalBuildEnv({ RAILWAY_ENVIRONMENT_NAME: "production" }), false);
  });
});
