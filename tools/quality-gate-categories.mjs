/**
 * quality-gate-categories.mjs
 * SSOT mapping from file paths to quality gate categories.
 * Used by the quality gate system to determine which checklist categories
 * to check based on which files were changed.
 */
import process from "node:process";

export const HOTSPOT_FILES = [
  "backend/app/routers/company_info.py",
  "backend/app/routers/es_review.py",
  "backend/app/utils/llm.py",
  "src/components/companies/CorporateInfoSection.tsx",
  "src/components/es/ReviewPanel.tsx",
  "src/hooks/useESReview.ts",
  "src/lib/server/app-loaders.ts",
];

export const QUALITY_GATE_CATEGORIES = {
  security: {
    patterns: [
      /^src\/app\/api\/.+\.ts$/u,
      /^src\/lib\/auth\/.+/u,
      /^src\/lib\/csrf\.ts$/u,
      /^src\/lib\/trusted-origins\.ts$/u,
      /^src\/bff\/identity\/.+/u,
      /^backend\/app\/security\/.+/u,
      /^backend\/app\/routers\/.+/u,
    ],
    severity: "critical",
    agents: ["security-auditor"],
    priority: 1,
  },

  auth: {
    patterns: [
      /^src\/lib\/auth\/.+/u,
      /^src\/app\/api\/.+\/route\.ts$/u,
      /^src\/bff\/identity\/.+/u,
      /^backend\/app\/security\/.+/u,
    ],
    severity: "critical",
    agents: ["security-auditor"],
    priority: 1,
  },

  payment: {
    patterns: [
      /^src\/lib\/stripe\/.+/u,
      /^src\/app\/api\/(?:stripe|webhooks\/stripe|credits)\/.+/u,
      /^src\/bff\/billing\/.+/u,
    ],
    severity: "critical",
    agents: ["security-auditor"],
    priority: 1,
  },

  database: {
    patterns: [
      /^src\/lib\/db\/schema\.ts$/u,
      /^src\/lib\/db\/relations\.ts$/u,
      /^drizzle_pg\/.+/u,
    ],
    severity: "high",
    agents: ["database-engineer"],
    priority: 2,
  },

  datetime: {
    patterns: [
      /^src\/lib\/datetime\/.+/u,
    ],
    contentPatterns: [
      "new Date(",
      "toLocaleDateString",
      "timezone",
      "Asia/Tokyo",
      "toISOString",
    ],
    severity: "high",
    agents: ["nextjs-developer", "fastapi-developer"],
    priority: 3,
  },

  apiDesign: {
    patterns: [
      /^src\/app\/api\/.+\/route\.ts$/u,
      /^backend\/app\/routers\/.+/u,
    ],
    severity: "high",
    agents: ["nextjs-developer", "fastapi-developer"],
    priority: 3,
  },

  aiLlm: {
    patterns: [
      /^backend\/app\/prompts\/.+/u,
      /^backend\/app\/utils\/llm[^/]*\.py$/u,
      /^backend\/app\/evaluators\/.+/u,
      /^backend\/app\/rag\/.+/u,
    ],
    severity: "high",
    agents: ["prompt-engineer", "rag-engineer"],
    priority: 3,
  },

  performance: {
    patterns: [
      /^src\/app\/api\/.+\/route\.ts$/u,
      /^backend\/app\/routers\/.+/u,
      /^src\/hooks\/.+/u,
      /^src\/lib\/db\/.+/u,
    ],
    severity: "high",
    agents: ["nextjs-developer", "fastapi-developer"],
    priority: 4,
  },

  cost: {
    patterns: [
      /^backend\/app\/prompts\/.+/u,
      /^backend\/app\/utils\/llm[^/]*\.py$/u,
      /^backend\/app\/rag\/.+/u,
      /^backend\/app\/utils\/bm25[^/]*\.py$/u,
      /^backend\/app\/utils\/reranker[^/]*\.py$/u,
      /^backend\/app\/utils\/embeddings[^/]*\.py$/u,
      /^backend\/app\/utils\/web_search[^/]*\.py$/u,
    ],
    severity: "high",
    agents: ["prompt-engineer", "rag-engineer"],
    priority: 4,
  },

  frontend: {
    patterns: [
      /^src\/components\/.+/u,
      /^src\/app\/.+\/(?:page|layout|loading)\.tsx$/u,
      /^src\/hooks\/.+/u,
    ],
    severity: "high",
    agents: ["ui-designer", "nextjs-developer"],
    priority: 4,
  },

  externalServices: {
    patterns: [
      /^src\/lib\/calendar\/.+/u,
      /^backend\/app\/utils\/web_search[^/]*\.py$/u,
      /^src\/app\/api\/(?:calendar|cron)\/.+/u,
    ],
    severity: "high",
    agents: ["nextjs-developer", "fastapi-developer"],
    priority: 4,
  },

  correctness: {
    patterns: [
      /^.+\.tsx?$/u,
      /^.+\.py$/u,
    ],
    excludePatterns: [
      /\.test\.[^.]+$/u,
      /\.spec\.[^.]+$/u,
      /^backend\/tests\/.+/u,
      /^e2e\/.+/u,
      /^\.(?:eslint|prettier|github|vscode|kiro|omm|claude|codex|agents)\/.+/u,
      /\.(?:json|yml|yaml|toml|md|env|lock)$/u,
    ],
    severity: "high",
    agents: ["nextjs-developer", "fastapi-developer"],
    priority: 5,
  },

  testing: {
    patterns: [
      /^.+\.tsx?$/u,
      /^.+\.py$/u,
    ],
    excludePatterns: [
      /\.test\.[^.]+$/u,
      /\.spec\.[^.]+$/u,
      /^backend\/tests\/.+/u,
      /^e2e\/.+/u,
    ],
    severity: "high",
    agents: ["test-automator"],
    priority: 5,
  },

  maintainability: {
    patterns: [
      /^.+\.tsx?$/u,
      /^.+\.py$/u,
    ],
    severity: "high",
    agents: ["code-reviewer"],
    priority: 5,
  },

  operations: {
    patterns: [
      /^\.github\/workflows\/.+/u,
      /^scripts\/release\/.+/u,
      /^Makefile$/u,
    ],
    severity: "high",
    agents: ["release-engineer"],
    priority: 5,
  },

  deployment: {
    patterns: [
      /^\.github\/workflows\/.+/u,
      /^Dockerfile[^/]*$/u,
      /^railway\.toml$/u,
      /^vercel\.json$/u,
      /^scripts\/release\/.+/u,
    ],
    severity: "high",
    agents: ["release-engineer"],
    priority: 5,
  },

  documentation: {
    patterns: [
      /^docs\/.+/u,
      /^README\.md$/u,
      /^CLAUDE\.md$/u,
      /^AGENTS\.md$/u,
    ],
    severity: "medium",
    agents: ["architect"],
    priority: 6,
  },
};

export const ALL_CATEGORIES = Object.keys(QUALITY_GATE_CATEGORIES);

export const CRITICAL_CATEGORIES = ALL_CATEGORIES.filter(
  (name) => QUALITY_GATE_CATEGORIES[name].severity === "critical",
);

export function normalizePath(path) {
  const normalized = String(path || "")
    .replaceAll("\\", "/")
    .trim()
    .replace(/\/+$/u, "");
  if (!normalized) {
    return "";
  }

  const repoRoot = String(process.cwd() || "")
    .replaceAll("\\", "/")
    .replace(/\/+$/u, "");
  if (repoRoot && normalized.startsWith(`${repoRoot}/`)) {
    return normalized.slice(repoRoot.length + 1);
  }

  return normalized.replace(/^\.\/+/u, "");
}

function matchesPatterns(normalizedPath, patterns) {
  return patterns.some((pattern) => pattern.test(normalizedPath));
}

export function classifyFileToCategories(filePath) {
  const normalizedPath = normalizePath(filePath);
  if (!normalizedPath) {
    return [];
  }

  const matched = [];

  for (const [name, config] of Object.entries(QUALITY_GATE_CATEGORIES)) {
    if (!matchesPatterns(normalizedPath, config.patterns)) {
      continue;
    }

    if (
      config.excludePatterns &&
      matchesPatterns(normalizedPath, config.excludePatterns)
    ) {
      continue;
    }

    matched.push({ name, priority: config.priority });
  }

  matched.sort((a, b) => a.priority - b.priority);

  return matched.map((entry) => entry.name);
}

export function buildCategoryCheckPlan(files) {
  const categories = new Map();

  for (const filePath of files) {
    const matchedCategories = classifyFileToCategories(filePath);
    const normalizedPath = normalizePath(filePath);

    for (const categoryName of matchedCategories) {
      const config = QUALITY_GATE_CATEGORIES[categoryName];

      if (!categories.has(categoryName)) {
        categories.set(categoryName, {
          files: [],
          severity: config.severity,
          agents: [...config.agents],
        });
      }

      categories.get(categoryName).files.push(normalizedPath);
    }
  }

  const sorted = new Map(
    [...categories.entries()].sort((a, b) => {
      const configA = QUALITY_GATE_CATEGORIES[a[0]];
      const configB = QUALITY_GATE_CATEGORIES[b[0]];
      return configA.priority - configB.priority;
    }),
  );

  return { categories: sorted };
}

export function getCategoryConfig(categoryName) {
  return QUALITY_GATE_CATEGORIES[categoryName] ?? null;
}
