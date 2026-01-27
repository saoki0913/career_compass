---
name: ukarun:ai
description: AI機能開発ガイド。FastAPI + LLM
---

# Skill: ウカルン AI機能開発

Use this skill when implementing AI-powered features for the Career Compass (ウカルン) application.

## When to Use
- User asks to implement AI features (ES添削, ガクチカ深掘り, etc.)
- User mentions "AI", "添削", "深掘り", "LLM"
- User wants to add AI-powered functionality

## Context
- **Backend**: Python FastAPI
- **Location**: `backend/app/`
- **AI Provider**: OpenAI API / Claude API
- **Credit System**: Success-only consumption

## FastAPI Structure

### Router Template
```python
# backend/app/routers/ai/review.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter(prefix="/ai/review", tags=["ai", "review"])

class ReviewRequest(BaseModel):
    document_id: str
    text: str
    style: str = "balanced"  # balanced, formal, unique
    section_id: Optional[str] = None

class ReviewScore(BaseModel):
    logic: int  # 1-5
    specificity: int
    enthusiasm: int
    company_connection: int  # Only if RAG available
    readability: int

class ReviewResponse(BaseModel):
    success: bool
    scores: ReviewScore
    top3_improvements: List[str]
    rewrites: List[dict]  # {style: str, text: str}
    section_feedback: Optional[List[dict]] = None  # For paid users

@router.post("/", response_model=ReviewResponse)
async def review_es(
    request: ReviewRequest,
    user_id: str = Depends(get_current_user)
):
    # Implementation
    pass
```

### Main App Integration
```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers.ai import review, deepdive
from .routers import health

app = FastAPI(title="Career Compass AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(review.router)
app.include_router(deepdive.router)
```

## Key AI Features

### 1. ES Review (添削)

#### Credit Calculation
```python
def calculate_review_cost(text: str) -> int:
    """ceil(文字数 / 800), max 5"""
    char_count = len(text)
    cost = math.ceil(char_count / 800)
    return min(cost, 5)  # Cap at 5
```

#### Review Output Structure
```python
class ESReviewOutput:
    # Scores (5-axis)
    scores: {
        "logic": int,           # 論理性
        "specificity": int,     # 具体性
        "enthusiasm": int,      # 熱意
        "company_connection": int,  # 企業接続 (only if RAG available)
        "readability": int      # 読みやすさ
    }

    # Top 3 improvements
    top3_improvements: List[str]

    # Rewrites (1 for Free, 3 for Paid)
    rewrites: [
        {"style": "balanced", "text": "..."},
        {"style": "formal", "text": "..."},     # Paid only
        {"style": "unique", "text": "..."},     # Paid only
    ]

    # Section feedback (Paid only, 100-150 chars per H2)
    section_feedback: [
        {"section_id": "h2-1", "feedback": "..."},
    ]
```

#### Styles
```python
REVIEW_STYLES = {
    # Free (3 styles)
    "balanced": "バランス重視",
    "formal": "堅め",
    "unique": "個性強め",

    # Paid additional (5 styles)
    "concise": "短く",
    "enthusiastic": "熱意強め",
    "conclusion_first": "結論先出し",
    "example_rich": "具体例強め",
    "direct": "端的",
}
```

### 2. Gakuchika Deepdive (ガクチカ深掘り)

#### Session Flow
```python
class DeepDiveSession:
    material_id: str
    current_question: int
    total_questions: int = 8  # Target ~8 questions
    qa_history: List[dict]
    status: str  # "in_progress", "completed", "paused"

@router.post("/start")
async def start_deepdive(material_id: str, user_id: str):
    """Start new deepdive session"""
    session = create_session(material_id, user_id)
    first_question = generate_first_question(material)
    return {"session_id": session.id, "question": first_question}

@router.post("/answer")
async def answer_question(session_id: str, answer: str):
    """Submit answer and get next question"""
    session = get_session(session_id)

    # Save Q&A
    save_qa(session, answer)

    # Check if should continue
    if should_end_session(session):
        return {"status": "completed", "summary": generate_summary(session)}

    # Generate next question based on context
    next_question = generate_follow_up(session, answer)
    return {"question": next_question, "progress": f"{session.current_question}/8"}

@router.post("/pause")
async def pause_session(session_id: str):
    """Pause session for later resumption"""
    pass

@router.post("/resume")
async def resume_session(session_id: str):
    """Resume paused session"""
    pass
```

#### Credit Consumption
```python
def calculate_deepdive_cost(questions_answered: int) -> int:
    """1 credit per 5 questions answered"""
    if questions_answered < 5:
        return 0
    return questions_answered // 5
```

### 3. Company RAG (企業情報取得)

#### Scraping & Storage
```python
class CompanyRAG:
    async def fetch_company_pages(
        self,
        official_urls: List[str],
        page_limit: int  # Free: 10, Standard: 50, Pro: 150
    ) -> List[PageContent]:
        """Fetch and store company pages for RAG"""
        pass

    async def extract_info(
        self,
        company_id: str
    ) -> ExtractionResult:
        """Extract deadlines, positions, requirements"""
        return {
            "deadlines": [
                {
                    "title": "ES提出",
                    "due_at": "2024-06-30T23:59:00+09:00",
                    "confidence": "HIGH",  # HIGH/MEDIUM/LOW
                    "source_url": "https://...",
                }
            ],
            "positions": [...],
            "requirements": [...],
        }
```

### 4. Error Handling

```python
class AIServiceError(Exception):
    def __init__(self, code: str, message: str, retry_allowed: bool = False):
        self.code = code
        self.message = message
        self.retry_allowed = retry_allowed

# Usage
try:
    result = await call_ai_api(prompt)
except RateLimitError:
    raise AIServiceError(
        code="RATE_LIMIT",
        message="APIの利用制限に達しました。しばらくお待ちください。",
        retry_allowed=True
    )
except TokenLimitError:
    raise AIServiceError(
        code="TEXT_TOO_LONG",
        message="文章が長すぎます。セクションごとに添削してください。",
        retry_allowed=False
    )
```

## Prompt Engineering Guidelines

### System Prompts
```python
ES_REVIEW_SYSTEM_PROMPT = """
あなたは就活ESの添削エキスパートです。
以下の観点で評価してください：
- 論理性：主張と根拠の繋がり
- 具体性：数字やエピソードの詳細さ
- 熱意：志望度や意欲の伝わり方
- 企業接続：企業の特徴との関連性
- 読みやすさ：文章の構成と表現

スコアは1-5の整数で評価してください。
改善点は具体的かつ実行可能な形で提示してください。
"""

DEEPDIVE_SYSTEM_PROMPT = """
あなたは就活コーチです。
学生のガクチカ（学生時代に力を入れたこと）を深掘りし、
ES・面接で使える具体的なエピソードを引き出してください。

質問のポイント：
- STAR法（状況・課題・行動・結果）を意識
- 数字で表せる成果を引き出す
- 困難とその乗り越え方を掘り下げる
- チームでの役割と学びを明確化
"""
```

### Response Format
Always request structured JSON responses from LLM for parsing:
```python
RESPONSE_FORMAT = """
以下のJSON形式で回答してください：
{
  "scores": {
    "logic": 4,
    "specificity": 3,
    ...
  },
  "top3_improvements": [
    "改善点1",
    "改善点2",
    "改善点3"
  ],
  "rewrites": [
    {"style": "balanced", "text": "リライト文..."}
  ]
}
"""
```

## Testing
- Unit tests for prompt formatting
- Mock AI responses for integration tests
- Test credit calculation edge cases
