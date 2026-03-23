#!/usr/bin/env node

import process from "node:process";
import { collectUiGuardrailFindings, formatUiGuardrailReport } from "../src/lib/ui-guardrails.mjs";

const findings = collectUiGuardrailFindings();
process.stdout.write(`${formatUiGuardrailReport(findings)}\n`);

if (findings.length > 0) {
  process.exit(1);
}

