#!/usr/bin/env node

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const LOCAL_APP_ENV = "local";

function clean(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function shouldDefaultToLocalBuildEnv(env) {
  if (clean(env.APP_ENV) || clean(env.NEXT_PUBLIC_APP_ENV)) return false;
  if (clean(env.CI)) return false;
  if (clean(env.VERCEL_ENV) || clean(env.RAILWAY_ENVIRONMENT_NAME)) return false;
  return true;
}

export function resolveNextBuildEnv(env = process.env) {
  if (!shouldDefaultToLocalBuildEnv(env)) return { ...env };
  return {
    ...env,
    APP_ENV: LOCAL_APP_ENV,
    NEXT_PUBLIC_APP_ENV: LOCAL_APP_ENV,
  };
}

export function runNextBuild() {
  const child = spawn("next", ["build"], {
    env: resolveNextBuildEnv(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runNextBuild();
}
