#!/usr/bin/env node
import { runUpdateCli } from "./lib/plan-task-store.mjs";

runUpdateCli({ sourcePlan: "test-quality-gate-plan.md" });
