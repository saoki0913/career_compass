export const DEFAULT_THRESHOLDS = {
  swapUsedWarnGb: Number(process.env.DEV_DOCTOR_SWAP_WARN_GB) || 8,
  swapUsedCritGb: Number(process.env.DEV_DOCTOR_SWAP_CRIT_GB) || 11,
  memoryFreeWarnPct: Number(process.env.DEV_DOCTOR_MEMORY_FREE_WARN_PCT) || 15,
  memoryFreeCritPct: Number(process.env.DEV_DOCTOR_MEMORY_FREE_CRIT_PCT) || 5,
  nextServerRssWarnGb: Number(process.env.DEV_DOCTOR_NEXT_SERVER_RSS_WARN_GB) || 3,
  nextServerRssCritGb: Number(process.env.DEV_DOCTOR_NEXT_SERVER_RSS_CRIT_GB) || 5,
  nextDevDirWarnGb: Number(process.env.DEV_DOCTOR_NEXT_DEV_DIR_WARN_GB) || 5,
  nextDevDirCritGb: Number(process.env.DEV_DOCTOR_NEXT_DEV_DIR_CRIT_GB) || 10,
};

function addIssue(issues, { severity, source, description, suggestedAction }) {
  issues.push({
    severity,
    source,
    description,
    suggestedAction,
    signature: `${source}:${severity}`,
  });
}

function countBySeverity(issues, severity) {
  return issues.filter((issue) => issue.severity === severity).length;
}

function triageThreshold({
  issues,
  value,
  warn,
  crit,
  source,
  unit,
  label,
  suggestedAction,
  higherIsWorse = true,
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return;

  const critHit = higherIsWorse ? value >= crit : value <= crit;
  const warnHit = higherIsWorse ? value >= warn : value <= warn;
  if (critHit) {
    addIssue(issues, {
      severity: "P0",
      source,
      description: `${label} が ${value}${unit} で危険域です。`,
      suggestedAction,
    });
    return;
  }

  if (warnHit) {
    addIssue(issues, {
      severity: "P1",
      source,
      description: `${label} が ${value}${unit} で警戒域です。`,
      suggestedAction,
    });
  }
}

export function triageMemory(samples, thresholds = DEFAULT_THRESHOLDS) {
  const issues = [];

  triageThreshold({
    issues,
    value: samples.swap?.usedGb ?? null,
    warn: thresholds.swapUsedWarnGb,
    crit: thresholds.swapUsedCritGb,
    source: "swap",
    unit: "GB",
    label: "swap 使用量",
    suggestedAction: "AI/DB 不要な作業なら make db-down。dev サーバーが肥大なら再起動。",
  });

  triageThreshold({
    issues,
    value: samples.memoryFreePct,
    warn: thresholds.memoryFreeWarnPct,
    crit: thresholds.memoryFreeCritPct,
    source: "memory",
    unit: "%",
    label: "空きメモリ率",
    suggestedAction: "不要なアプリや開発サーバーを停止し、必要なら db / Next.js dev を再起動。",
    higherIsWorse: false,
  });

  triageThreshold({
    issues,
    value: samples.nextServer?.maxRssGb ?? null,
    warn: thresholds.nextServerRssWarnGb,
    crit: thresholds.nextServerRssCritGb,
    source: "next-server",
    unit: "GB",
    label: "next-server の最大 RSS",
    suggestedAction: "npm run dev のターミナルで Ctrl+C 後に再起動。",
  });

  if (samples.nextServer?.count >= 2) {
    addIssue(issues, {
      severity: "P1",
      source: "duplicate-next-dev",
      description: `next-server が ${samples.nextServer.count} 個動作しています。`,
      suggestedAction: "重複 next dev を 1 つに統合（確認の上、不要なターミナルを停止）。自動停止はしない。",
    });
  }

  triageThreshold({
    issues,
    value: samples.nextDevDirGb,
    warn: thresholds.nextDevDirWarnGb,
    crit: thresholds.nextDevDirCritGb,
    source: ".next/dev",
    unit: "GB",
    label: ".next/dev の容量",
    suggestedAction: "npm run dev 停止後に npm run dev:reset-next-cache（先に -- --dry-run で確認可）。",
  });

  if (samples.supabaseAnalyticsRunning === true) {
    addIssue(issues, {
      severity: "P2",
      source: "supabase-analytics",
      description: "supabase_analytics コンテナが稼働しています。",
      suggestedAction: "supabase/config.toml の [analytics] を enabled = false にして make db-restart（約1GB 解放）。",
    });
  }

  const summary = {
    p0: countBySeverity(issues, "P0"),
    p1: countBySeverity(issues, "P1"),
    p2: countBySeverity(issues, "P2"),
    total: issues.length,
  };

  return {
    // P2 は節約余地の提示に留め、開発を止める逼迫判定には含めない。
    ok: summary.p0 === 0 && summary.p1 === 0,
    issues,
    summary,
    thresholds,
  };
}
