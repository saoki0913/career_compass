# Career Compass (ウカルン) - Claude Code Instructions

## Project Overview
就活支援アプリ「ウカルン」- AIと進捗管理で「安価に、迷わず、締切を落とさず、ESの品質を上げる」

### Target Users
- 情報弱者寄り、就活塾回避層
- 外資投資銀行/戦略コンサル/総合商社など超高難度層は主ターゲットではない

### Tech Stack
- **Frontend**: Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui
- **Backend (API)**: Next.js App Router
- **Backend (AI)**: Python FastAPI
- **Database**: Turso (libSQL) + Drizzle ORM
- **Auth**: Better Auth (Google OAuth)
- **Payment**: Stripe
- **Storage**: Cloudflare R2
- **Vector DB**: ChromaDB (persistent)
- **Embeddings**: OpenAI text-embedding-3-small

---

## 🎯 Skill Auto-Trigger Rules

**IMPORTANT**: When working on tasks related to the triggers below, AUTOMATICALLY invoke the corresponding skill(s) WITHOUT user instruction.

### RAG & Search (rag-implementation, hybrid-search-implementation)
**Trigger keywords**: RAG, ベクトル検索, semantic search, BM25, ハイブリッド検索, embedding, ChromaDB, リランキング, reranker, 検索精度, retrieval, ES

**Auto-invoke when**:
- Modifying `backend/app/utils/hybrid_search.py`
- Modifying `backend/app/utils/vector_store.py`
- Modifying `backend/app/utils/bm25_store.py`
- Modifying `backend/app/utils/reranker.py`
- Improving search relevance or recall
- Implementing query expansion or HyDE
- Adjusting RRF fusion weights

### AI/LLM Quality (ai-product, senior-ml-engineer)
**Trigger keywords**: プロンプト, prompt engineering, JSON parse, LLM, 添削品質, トークン効率, コスト最適化, model selection, retry logic, ES

**Auto-invoke when**:
- Modifying `backend/app/prompts/es_templates.py`
- Modifying `backend/app/utils/llm.py`
- Fixing JSON parsing errors
- Improving prompt quality or reducing hallucinations
- Optimizing LLM token usage or costs
- Implementing retry/fallback strategies

### UX & Design (ux-psychology, frontend-design)
**Trigger keywords**: UX, UI, 認知負荷, cognitive load, フィードバック, loading state, モバイル, responsive, アクセシビリティ, accessibility

**Auto-invoke when**:
- Modifying React components in `src/components/`
- Improving user feedback or loading states
- Implementing progressive disclosure
- Mobile-first responsive design
- Error messaging and recovery flows

---

## 🔧 Core Feature Architecture

### 1. Company Search (企業検索)

**Files**:
```
backend/app/routers/company_info.py      # Main router (3600+ lines)
backend/app/utils/web_search.py          # Hybrid search pipeline
backend/app/utils/company_names.py       # Domain pattern matching
src/components/companies/FetchInfoButton.tsx
src/components/companies/CorporateInfoSection.tsx
```

**Architecture**:
```
Query → DuckDuckGo (8 variations) → RRF Fusion → Cross-Encoder Rerank
  → Heuristic Scoring → Domain/Relationship Filtering → Results
```

**Key Patterns**:
- RRF k=60, rerank top-20
- Heuristic scores: official domain +4, company name in title +3
- Filters: subsidiaries, parent companies, blog platforms

**Known Issues & Improvements**:
| Issue | Skill | Approach |
|-------|-------|----------|
| 関連会社の誤検出 | `hybrid-search-implementation` | Boundary-aware domain matching |
| 検索結果の信頼度表示 | `ux-psychology` | Confidence badges with explanations |
| 長時間検索のUX | `frontend-design` | Skeleton loading + cancel option |

### 2. RAG System (企業RAG)

**Files**:
```
backend/app/utils/hybrid_search.py       # Main pipeline (1254 lines)
backend/app/utils/vector_store.py        # ChromaDB operations (1227 lines)
backend/app/utils/reranker.py            # Cross-encoder reranking
backend/app/utils/bm25_store.py          # Keyword search index
backend/app/utils/content_classifier.py  # Content type classification
backend/app/utils/content_types.py       # 9 content type definitions
```

**Architecture**:
```
Query → [Query Expansion (LLM)] → [HyDE] → Multi-Query Semantic Search
  → RRF Merge → MMR Diversity → [Reranking] → BM25 Fusion
  → Content-Type Boost → Domain Boost → Final Results
```

**Content Types** (9 categories):
- new_grad_recruitment, midcareer_recruitment, corporate_site
- ir_materials, ceo_message, employee_interviews
- press_release, csr_sustainability, midterm_plan

**Key Parameters**:
```python
EXPANSION_MIN_QUERY_CHARS = 10
DEFAULT_MAX_TOTAL_QUERIES = 4
RRF_K = 60
CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
```

**Known Issues & Improvements**:
| Issue | Skill | Approach |
|-------|-------|----------|
| Query expansion遅延 | `rag-implementation` | Similarity-based expansion cache |
| BM25が元クエリのみ | `hybrid-search-implementation` | Run BM25 on all expanded queries |
| コンテンツ分類曖昧性 | `ai-product` | Priority-based tie-breaking rules |
| リランク閾値固定 | `senior-ml-engineer` | Query complexity adaptive threshold |

### 3. ES Review (ES添削)

**Files**:
```
backend/app/routers/es_review.py         # Main review logic
backend/app/prompts/es_templates.py      # 7 specialized templates
backend/app/utils/llm.py                 # JSON parsing & retry logic
src/components/es/ReviewPanel.tsx        # Review UI
src/hooks/useESReview.ts                 # Review hook
```

**Architecture**:
```
ES Content → [RAG Context] → Template Selection → LLM Review
  → JSON Parse (6-layer recovery) → Char Validation → [Repair if needed]
  → Scores + Improvements + Rewrites
```

**Templates** (7 types):
- company_motivation, gakuchika, intern_reason
- intern_goals, role_course_reason, self_pr, work_values

**JSON Parsing Recovery Chain** (`llm.py`):
1. Direct parse
2. Markdown code block extraction
3. Trailing comma removal
4. Newline sanitization
5. Bracket repair with depth tracking
6. LLM retry with stricter instructions

**Known Issues & Improvements**:
| Issue | Skill | Approach |
|-------|-------|----------|
| 文字数超過頻発 | `ai-product` | Character budget in system prompt (15/70/15) |
| JSON切れ端許容 | `senior-ml-engineer` | Schema validation after parse |
| リトライ回数固定 | `senior-ml-engineer` | Cascading repair with adaptive retries |
| 添削結果の比較UI | `ux-psychology`, `frontend-design` | Side-by-side diff view |

---

## 📋 Development Rules

### Critical Business Rules
1. **成功時のみ消費**: クレジット/無料回数は成功時のみカウント
2. **JST基準**: 日次通知、リセットはJST（Asia/Tokyo）
3. **締切は承認必須**: 自動抽出した締切は必ずユーザー承認
4. **非同期UX**: 外部I/Oは「処理中→結果通知」パターン

### Code Patterns

**Credit Consumption**:
```typescript
const result = await operation();
if (result.success) {
  await consumeCredits(userId, cost);
}
```

**Async UX Pattern**:
```typescript
// 1. Show processing state immediately
setIsProcessing(true);
toast.info("処理を開始しました");

// 2. Execute async operation
const result = await longOperation();

// 3. Notify completion
if (result.success) {
  toast.success("完了しました", { description: `${cost}クレジット消費` });
} else {
  toast.error("失敗しました", { description: result.error });
}
```

**JSON Parse with Recovery**:
```python
# Always use _parse_json_response() from llm.py
# It handles: markdown blocks, trailing commas, unescaped newlines, bracket repair
parsed = _parse_json_response(raw_text, retry_llm_on_fail=True)
```

---

## 🧠 UX Psychology Guidelines

When modifying UI components, apply these principles:

### Cognitive Load Reduction
- **Progressive Disclosure**: Show essential info first, details on demand
- **Chunking**: Group related items (max 7±2 per group)
- **Recognition over Recall**: Use icons + labels, not just icons

### Feedback Clarity
- **Processing States**: Always show what's happening (skeleton, spinner, progress)
- **Success/Error**: Clear visual distinction with actionable messages
- **Confidence Levels**: HIGH (green), MEDIUM (yellow), LOW (red) badges

### Mobile-First
- **Touch Targets**: Minimum 44x44px
- **Thumb Zone**: Critical actions in bottom 1/3 of screen
- **Vertical Scroll**: Avoid horizontal scroll, stack vertically

---

## 🤖 AI/ML Best Practices

### Prompt Engineering
- Include output format examples in system prompt
- Specify character budgets explicitly (e.g., "15% intro, 70% body, 15% conclusion")
- Use JSON schema validation hints
- Forbid markdown in JSON responses

### JSON Reliability
- Always validate against expected schema after parsing
- Implement multi-layer recovery (see `llm.py`)
- Log raw LLM responses for debugging
- Set reasonable max_tokens to prevent truncation

### Cost Optimization
- Cache query expansions by similarity
- Use cross-encoder reranking over LLM reranking when possible
- Batch similar operations
- Track token usage in telemetry

---

## 📁 Key File Locations

```
# API Routes (Next.js)
src/app/api/{feature}/route.ts

# Pages
src/app/{feature}/page.tsx

# Components
src/components/features/     # Feature-specific
src/components/ui/           # shadcn/ui components

# Database
src/lib/db/schema.ts         # Drizzle schema

# FastAPI (AI Backend)
backend/app/routers/         # API endpoints
backend/app/utils/           # Utilities (RAG, LLM, search)
backend/app/prompts/         # Prompt templates

# Data
backend/data/chroma/         # ChromaDB persistent storage
backend/data/bm25/           # BM25 indices (pickle)
backend/data/company_mappings.json  # Domain patterns

# Documentation
docs/SPEC.md                 # Full specification
docs/COMPANY_RAG.md          # RAG documentation
docs/ES_REVIEW.md            # ES review documentation
```

---

## 🚀 Quick Start

### Resume Development
```
/dev-continue
```
This command:
1. Auto-detects current project state
2. Resumes in-progress tasks if any
3. Suggests next feature to implement
4. Loads necessary context automatically

### Development Commands
```bash
# Development servers
npm run dev                  # Next.js dev server
cd backend && uvicorn app.main:app --reload  # FastAPI dev

# Database
npm run db:push              # Push schema to Turso
npm run db:studio            # Open Drizzle Studio

# Build & Test
npm run build                # Production build
npm run test                 # Run tests
```

---

## 🔗 Related Documentation

- **仕様書**: `docs/SPEC.md`
- **開発ガイド**: `docs/DEVELOPMENT.md`
- **企業RAG**: `docs/COMPANY_RAG.md`
- **ES添削**: `docs/ES_REVIEW.md`
- **Steering**: `.kiro/steering/`

---

## Language
- Think in English, generate responses in English
- All documentation and spec files: **日本語** (target language)
