#!/usr/bin/env node
import { runUpdateCli } from "./lib/plan-task-store.mjs";

runUpdateCli({ sourcePlan: "monitoring-logging-incident-response-plan.md" });
