const VALID_AUTH_MODES = new Set(["none", "guest", "mock", "real"]);
const VALID_SURFACES = new Set(["marketing", "product"]);

export function getUiPreflightUsage() {
  return "Usage: npm run ui:preflight -- /route --surface=marketing|product [--auth=none|guest|mock|real]";
}

export function parseUiPreflightArgs(argv) {
  let authMode = "none";
  let surface = "";
  let routePath = "";

  for (const arg of argv) {
    if (arg.startsWith("--auth=")) {
      authMode = arg.slice("--auth=".length).trim();
      continue;
    }

    if (arg.startsWith("--surface=")) {
      surface = arg.slice("--surface=".length).trim();
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}\n${getUiPreflightUsage()}`);
    }

    if (routePath) {
      throw new Error(`UI preflight accepts exactly one route.\n${getUiPreflightUsage()}`);
    }

    routePath = normalizeUiRoutePath(arg);
  }

  if (!routePath) {
    throw new Error(getUiPreflightUsage());
  }

  if (!VALID_AUTH_MODES.has(authMode)) {
    throw new Error("UI preflight auth must be one of: none, guest, mock, real");
  }

  if (!VALID_SURFACES.has(surface)) {
    throw new Error("UI preflight surface must be one of: marketing, product");
  }

  return { authMode, routePath, surface };
}

export function getUiPreflightQuestions(surface) {
  return [
    {
      key: "visualThesis",
      label: "visual thesis",
      prompt: "visual thesis: 1文でムード、質感、情報密度、エネルギーを書いてください",
    },
    {
      key: "contentPlan",
      label: "content plan",
      prompt:
        surface === "marketing"
          ? "content plan: Hero / support / detail / final CTA の流れで短く書いてください"
          : "content plan: workspace / status / detail / next action の流れで短く書いてください",
    },
    {
      key: "interactionThesis",
      label: "interaction thesis",
      prompt: "interaction thesis: 印象を変えるモーションを 2-3 個の短文で書いてください",
    },
    {
      key: "designTokens",
      label: "design tokens",
      prompt:
        "design tokens: background / surface / primary text / muted text / accent を短く書いてください",
    },
    {
      key: "desktopFirstView",
      label: "desktop first view",
      prompt: "desktop first view: 初期 viewport に何を見せるかを書いてください",
    },
    {
      key: "mobileFirstView",
      label: "mobile first view",
      prompt: "mobile first view: 初期 viewport に何を見せるかを書いてください",
    },
    {
      key: "existingConstraints",
      label: "existing visual language / constraints",
      prompt:
        "existing visual language / constraints: 既存画面との整合、崩してはいけない構造、再利用するパターンを書いてください",
    },
  ];
}

export function buildUiPreflightReviewCommand({ authMode, routePath }) {
  return authMode === "none"
    ? `npm run test:ui:review -- ${routePath}`
    : `npm run test:ui:review -- ${routePath} --auth=${authMode}`;
}

export function formatUiPreflightMarkdown({ authMode, routePath, surface, answers }) {
  assertAnswer("visual thesis", answers.visualThesis);
  assertAnswer("content plan", answers.contentPlan);
  assertAnswer("interaction thesis", answers.interactionThesis);
  assertAnswer("design tokens", answers.designTokens);
  assertAnswer("desktop first view", answers.desktopFirstView);
  assertAnswer("mobile first view", answers.mobileFirstView);
  assertAnswer("existing visual language / constraints", answers.existingConstraints);

  const reviewCommand = buildUiPreflightReviewCommand({ authMode, routePath });
  const hardRules =
    surface === "marketing"
      ? [
          "最初の viewport は 1 つの強い構図にする",
          "brand / product を hero レベルで見せる",
          "full-bleed hero を基本にし、hero に cards や chips を積まない",
        ]
      : [
          "workspace / status / filter / task context を先に見せる",
          "dashboard-card のモザイクを避ける",
          "utility copy を優先し、装飾カードではなく layout と spacing で整理する",
        ];

  return [
    "## UI Preflight",
    "",
    `- Route: \`${routePath}\``,
    `- Surface: \`${surface}\``,
    `- Auth: \`${authMode}\``,
    "",
    "### visual thesis",
    answers.visualThesis.trim(),
    "",
    "### content plan",
    answers.contentPlan.trim(),
    "",
    "### interaction thesis",
    answers.interactionThesis.trim(),
    "",
    "### design tokens",
    answers.designTokens.trim(),
    "",
    "### desktop first view",
    answers.desktopFirstView.trim(),
    "",
    "### mobile first view",
    answers.mobileFirstView.trim(),
    "",
    "### existing visual language / constraints",
    answers.existingConstraints.trim(),
    "",
    "### hard rules reminder",
    ...hardRules.map((rule) => `- ${rule}`),
    "- cards は操作コンテナとして必要な時だけ使う",
    "- mobile で fixed / floating 要素が本文や CTA を塞がないことを前提にする",
    "",
    "### implementation follow-up",
    `- Review command: \`${reviewCommand}\``,
    "- この block を会話、PR 本文、作業ログのいずれかに貼ってから UI 実装を始める",
    "",
  ].join("\n");
}

function assertAnswer(label, value) {
  if (!value?.trim()) {
    throw new Error(`UI preflight ${label} is required`);
  }
}

function normalizeUiRoutePath(routePath) {
  const trimmed = routePath.trim();
  if (!trimmed) {
    throw new Error("UI preflight route cannot be empty");
  }

  if (!trimmed.startsWith("/")) {
    throw new Error(`UI preflight route must start with '/': ${routePath}`);
  }

  const [pathname] = trimmed.split(/[?#]/, 1);
  if (!pathname) {
    return "/";
  }

  if (pathname === "/") {
    return "/";
  }

  return pathname.replace(/\/+$/, "");
}
