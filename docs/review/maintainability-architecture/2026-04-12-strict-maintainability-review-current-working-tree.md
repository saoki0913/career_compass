# 保守性レビュー結果

- レビュー対象: `/Users/saoki/work/career_compass`
- レビュー日: 2026-04-12
- 目的: 今後のリファクタリング対象を厳しめに洗い出し、改善優先順位を明確にする
- 前提: `git status --short` 時点の **current working tree** を正本として評価。`HEAD` ではなく未コミット変更を含む現在のコードを対象にした
- 参照ソース: `.omm/overall-architecture`, `.omm/request-lifecycle`, `.omm/data-flow`, `.omm/external-integrations`, `.omm/route-page-map`, `docs/architecture/ARCHITECTURE.md`
- 総合判定: `PASS_WITH_REFACTOR`

## 1. 全体像

- ディレクトリ構成の要約
  - `src/app` が App Router の page / layout / API route、`src/components` が UI、`src/hooks` がクライアント側状態管理、`src/lib` が shared domain / integration / loader、`backend/app` が FastAPI + AI / RAG の中核、`.omm` と `docs/architecture` が設計意図の補助資料という構成。
  - レビュー対象として特に重いのは `src/hooks`, `src/app/api`, `backend/app/routers`, `backend/app/utils`。現時点の保守負債は UI そのものより、会話状態・SSE・課金・所有権・AI orchestration の境界に集中している。
- レイヤー構成の要約
  - 基本の設計意図は `Page/Hook/Component -> Next API -> DB/FastAPI -> Provider`。
  - ただし実装では、`Page + giant hook + route handler + FastAPI router` がそれぞれ独自に状態遷移や副作用を持ち、きれいな縦分割より「複数レイヤーにまたがるワークフローの寄せ集め」に近い箇所が残っている。
- 全体の保守性の総評
  - identity 解決、FastAPI 呼び出し、owner access など、一部の土台は整っている。
  - 一方で、会話系 feature と AI streaming feature は、状態主体の分け方が不自然で、1 箇所直すために把握すべき前提知識が多すぎる。現状は「動くが、安全に読める構造ではない」箇所が複数残っている。
- 今のまま開発を続けた場合の主要リスク
  - AI 機能追加のたびに、会話 hook と stream route に局所分岐が増え、変更影響範囲の予測がさらに難しくなる。
  - FastAPI 側の巨大 router / util は、分割済みに見えても親モジュール依存や責務重複が残っており、継ぎ足しで再肥大化しやすい。
  - `.omm` / `ARCHITECTURE.md` が想定する thin wrapper / server-first の前提と、実コードの巨大 `use client` page の差が広がっており、設計資料が変更安全性のガイドとして機能しづらくなっている。
- 可読性・認知負荷の観点で特に危険な領域
  - `src/hooks/useMotivationConversationController.ts` 1012 行
  - `src/hooks/useInterviewConversationController.ts` 751 行
  - `src/hooks/useGakuchikaConversationController.ts` 696 行
  - `src/hooks/useESReview.ts` 627 行
  - `src/app/(product)/companies/[id]/motivation/page.tsx` 1038 行
  - `src/app/(product)/companies/[id]/interview/page.tsx` 1111 行
  - `src/components/es/ReviewPanel.tsx` 1332 行
  - `src/components/companies/CompanyDetailPageClient.tsx` 1140 行
  - `backend/app/routers/motivation.py` 3784 行
  - `backend/app/routers/company_info.py` 3156 行
  - `backend/app/utils/llm.py` 2809 行
  - `backend/app/utils/web_search.py` 2303 行
- 状態管理の観点で特に危険な領域
  - 志望動機: `src/hooks/useMotivationConversationController.ts`, `src/lib/motivation/conversation.ts`, `src/app/api/motivation/[companyId]/conversation/stream/route.ts`, `backend/app/routers/motivation.py`
  - 面接: `src/hooks/useInterviewConversationController.ts`, `src/app/api/companies/[id]/interview/context.ts`, `src/app/api/companies/[id]/interview/persistence.ts`, `backend/app/routers/interview.py`
  - ガクチカ: `src/hooks/useGakuchikaConversationController.ts`, `src/app/api/gakuchika/state.ts`, `src/app/api/gakuchika/[id]/conversation/stream/route.ts`, `backend/app/routers/gakuchika.py`
  - ES 添削: `src/hooks/useESReview.ts`, `src/app/api/documents/_services/handle-review-stream.ts`, `backend/app/routers/es_review.py`

## 2. 良い点

- `src/app/api/_shared/request-identity.ts` と `src/app/api/_shared/owner-access.ts` により、identity / owner 判定の入口をある程度共通化できている。guest / user 両対応の土台としては妥当。
- `src/lib/fastapi/client.ts` が FastAPI への内部呼び出しを集約しており、Next 側から外部 AI バックエンドを直接叩く散在を抑えている。
- `src/lib/fastapi/sse-proxy.ts`、`src/lib/api-route/billing/*` など、SSE と billing の共通化方向は正しい。まだ feature 間で揺れはあるが、改善の軸として維持すべき。
- `src/lib/calendar/google.ts` や Stripe 初期化周辺のように、外部依存を adapter 層へ寄せている箇所は保守しやすい。
- `src/app/(product)/companies/[id]/page.tsx` と `src/lib/server/company-loaders.ts` のような thin wrapper + loader パターンは、App Router と server-first 方針に合っている。今後もこの形を基準にすべき。
- `CorporateInfoSection.tsx` 自体は依然重いが、`use-corporate-info-controller.ts` と sub-component への分割が始まっている点は前進。問題は「分割した先の責務設計」であって、分割方針そのものではない。

## 3. 重大な問題

### 3-1. 会話系 hook が UI controller ではなく巨大状態機械になっている

- 問題
  - 会話系 hook が UI state、業務 state、永続化用 state、stream transport、playback、error 処理、開始条件、完了条件を同時に抱えている。
- 該当箇所
  - `src/hooks/useMotivationConversationController.ts`
  - `src/hooks/useInterviewConversationController.ts`
  - `src/hooks/useGakuchikaConversationController.ts`
- なぜ重大か
  - 1 機能追加のたびに、送信前提、保存条件、表示制御、stream 完了条件、draft readiness まで横断理解が必要になる。hook が「画面の補助」ではなく「feature の実行環境」になっている。
- 放置リスク
  - 質問進行、再開、draft 生成、講評生成、role setup のどれかを直すと、別の state 遷移が壊れる。回帰が局所テストで見えにくい。
- 可読性・認知負荷への悪影響
  - `useState` が多く、どれが表示用 state でどれが業務の正本かを即座に判別しづらい。読み手は state 名だけでなく、各 setter がいつ呼ばれるかも追う必要がある。
- 状態管理への悪影響
  - `pendingCompleteData`、`streamingTargetText`、`setupSnapshot`、`stageStatus`、`progress` のように、同じ会話の異なる投影が並立している。状態主体の責務境界が不明確。
- 改善の方向性
  - transport、conversation state、UI playback、setup state、persistence sync を別主体へ分離し、hook 自体は orchestration に留める。
- 優先度
  - High

### 3-2. product page が thin wrapper 方針から外れ、大型 `use client` ページに戻っている

- 問題
  - page が表示専用 wrapper ではなく、状態解釈、setup 完了判定、表示モード切替、進行条件の計算まで持っている。
- 該当箇所
  - `src/app/(product)/companies/[id]/motivation/page.tsx`
  - `src/app/(product)/companies/[id]/interview/page.tsx`
  - `src/app/(product)/calendar/page.tsx`
- なぜ重大か
  - `.omm` と `docs/architecture/ARCHITECTURE.md` が想定する thin wrapper / server-first 前提と実装が乖離し、設計資料を見ても危険箇所が読めない。
- 放置リスク
  - feature ごとに「page でどこまでやるか」が揺れ続け、今後の実装者が同じ責務を page / hook / component のどこへ置くべきか判断できなくなる。
- 可読性・認知負荷への悪影響
  - page を読むだけで setup 判定、文言制御、tracker 表示条件、draft 生成条件まで出てくるため、ルート入口としての見通しが悪い。
- 状態管理への悪影響
  - hook から大量の state を destructure し、page 側で再度派生 state を作るため、状態遷移の起点と解釈層が増える。
- 改善の方向性
  - page は routing / preload / layout composition に寄せ、会話ロジックの条件分岐は dedicated view model か feature component 側へ寄せる。
- 優先度
  - High

### 3-3. AI stream route の責務境界が feature ごとに揺れている

- 問題
  - SSE consume、DB 保存、billing、structured error、completion 条件が feature ごとに微妙に異なる書き方で実装されている。
- 該当箇所
  - `src/app/api/documents/_services/handle-review-stream.ts`
  - `src/app/api/motivation/[companyId]/conversation/stream/route.ts`
  - `src/app/api/gakuchika/[id]/conversation/stream/route.ts`
- なぜ重大か
  - 似たフローなのに、どこまで共通でどこから feature 固有かがコードから即断できない。設計知識が API 実装ごとに分岐している。
- 放置リスク
  - timeout、課金、error shape、SSE event の扱いが機能追加のたびにずれ、障害時の調査と修正が feature 単位の属人的対応になる。
- 可読性・認知負荷への悪影響
  - route を読むたびに、identity、precheck、payload build、FastAPI call、stream consume、DB 更新の順序を毎回再学習する必要がある。
- 状態管理への悪影響
  - complete event 後に何を正本として保存するかが feature ごとに異なる。UI の期待状態と DB の確定状態の対応が追いにくい。
- 改善の方向性
  - SSE orchestration の共通プロトコルをさらに明示化し、route は `identity + feature-specific payload + feature-specific post-complete policy` だけに縮める。
- 優先度
  - High

### 3-4. Next API の shared / context / persistence が façade ではなく業務本体になっている

- 問題
  - API route 補助モジュールが serialization、DB restore、seed data、status 計算、persistence patch まで抱えており、shared という名前に対して責務が重すぎる。
- 該当箇所
  - `src/app/api/companies/[id]/interview/context.ts`
  - `src/app/api/companies/[id]/interview/persistence.ts`
  - `src/app/api/gakuchika/state.ts`
- なぜ重大か
  - route 層の近くにドメイン本体が沈んでおり、他 feature から再利用しづらい。結果として会話 feature ごとに似た責務配置が再発しやすい。
- 放置リスク
  - route 変更が state schema 変更や persistence 変更に直結し、境界を跨ぐ回帰が増える。
- 可読性・認知負荷への悪影響
  - `context`, `persistence`, `state` という一般名から想像される軽さを超えて重い。読む前に責務を予測しにくい。
- 状態管理への悪影響
  - hydrate、parse、normalize、save のどこが正本かが feature ごとにずれる。状態翻訳層が増え、直す前に読む量が多すぎる。
- 改善の方向性
  - route support ではなく domain module として整理し、serialization / persistence / read model / policy を明示分離する。
- 優先度
  - High

### 3-5. FastAPI 側の巨大 router / util は、分割済みに見えても責務の正本が戻り切っていない

- 問題
  - router / util が分割された一方で、親モジュール依存、責務重複、facade 的再 export が残り、「分かれたが読みやすくなった」とは言い切れない。
- 該当箇所
  - `backend/app/routers/motivation.py`
  - `backend/app/routers/company_info.py`
  - `backend/app/utils/llm.py`
- なぜ重大か
  - 分割後の依存が不自然だと、変更時に「どこを直せばよいか」が逆に分かりにくくなる。巨大ファイル問題が「巨大 + 分割先の往復読解」に進化している。
- 放置リスク
  - 次の改修で親モジュールへロジックが戻り、再肥大化する。分割の投資が保守性改善ではなくノイズ増加で終わる。
- 可読性・認知負荷への悪影響
  - import 量が多く、どの責務がどこにあるか追跡コストが高い。`llm.py` は provider routing, client init, prompt safety, cost, logging など概念数が依然多い。
- 状態管理への悪影響
  - request ごとの判断材料、fallback、provider 状態、usage 集計が複数モジュールに散り、暗黙依存が生まれやすい。
- 改善の方向性
  - 分割単位を「ファイルサイズ」ではなく「正本責務」で再整理し、親モジュールをただの import ハブにするか、逆に orchestration に限定するかを明確に決める。
- 優先度
  - High

### 3-6. 状態の正本と翻訳層が多く、会話ドメインを安全に追えない

- 問題
  - 同じ会話を、DB JSON、TS domain state、UI state、SSE payload、FastAPI request/response、Python 内部 state の複数表現で持っている。
- 該当箇所
  - `src/lib/motivation/conversation.ts`
  - `src/lib/interview/conversation.ts`
  - `src/app/api/gakuchika/state.ts`
- なぜ重大か
  - 「状態の正本が 1 つか」以前に、「変更時に何層の翻訳を読む必要があるか」が多すぎる。人間が安全に変更する前提を崩している。
- 放置リスク
  - 旧フィールド互換、parse / serialize 差分、UI 用派生 state のずれにより、再開時だけ壊れる、特定 feature だけ表示が古い、といったバグが増える。
- 可読性・認知負荷への悪影響
  - 型定義自体が大きく、`Python-owned` や legacy field を理解しないと安全に触れない。新規実装者の参入コストが高い。
- 状態管理への悪影響
  - 状態主体の責務分担が曖昧。保存用構造、推論用構造、表示用構造が過度に重なっている。
- 改善の方向性
  - feature ごとに canonical conversation model を定め、UI 派生 state と transport payload をそこから一方向生成する形へ寄せる。
- 優先度
  - High

## 4. 中程度の負債

### 4-1. 大型 UI composition root が workflow と表示を同時に抱えている

- 問題
  - UI component が画面レイアウトだけでなく、操作フローやモード分岐の知識を引き受けている。
- 該当箇所
  - `src/components/es/ReviewPanel.tsx`
  - `src/components/companies/CompanyDetailPageClient.tsx`
  - `src/components/companies/FetchInfoButton.tsx`
- 放置リスク
  - 画面改善のつもりで workflow 条件を壊す可能性が高い。レビューもしづらい。
- 可読性・認知負荷への悪影響
  - JSX を読みながら state / side effect も同時に追う必要がある。
- 状態管理への悪影響
  - 派生 state の計算場所が component と hook に分散しやすい。
- 改善の方向性
  - view model と presentational boundary を明示し、component は表示責務を優先させる。
- 優先度
  - Medium

### 4-2. `CorporateInfoSection` 分割後も controller に状態責務が集まりすぎている

- 問題
  - 分割の結果、`use-corporate-info-controller.ts` が mode、modal、delete、search、fetch、upload、step navigation のハブになっている。
- 該当箇所
  - `src/components/companies/CorporateInfoSection.tsx`
  - `src/components/companies/corporate-info-section/use-corporate-info-controller.ts`
- 放置リスク
  - 今後 input mode や compliance 条件が増えると、controller が再び巨大 state machine 化する。
- 可読性・認知負荷への悪影響
  - 分割前よりは改善しているが、依然として「controller を読まないと何も分からない」状態。
- 状態管理への悪影響
  - `inputMode`, `modalStep`, `displayedStep`, `fetchResult`, `status`, `draft` 群の責務境界が薄い。
- 改善の方向性
  - workflow 単位で state 主体を切り、controller はそれらを束ねるだけにする。
- 優先度
  - Medium

### 4-3. ES 添削フローは transport 分割後も route service に知識が集まりすぎている

- 問題
  - `useESReview.ts` の transport 抽出は進んだが、`handle-review-stream.ts` に retrieval query、template 推論、profile/gakuchika context、billing policy 接続が集中している。
- 該当箇所
  - `src/hooks/useESReview.ts`
  - `src/app/api/documents/_services/handle-review-stream.ts`
- 放置リスク
  - template 拡張、companyless 処理、context 強化のたびに route service がさらに肥大化する。
- 可読性・認知負荷への悪影響
  - 「stream handler」の名前に対して、実際は ES review orchestration 本体になっている。
- 状態管理への悪影響
  - review 実行条件と review state の確定条件が hook と handler の両方にまたがる。
- 改善の方向性
  - ES review use case と stream transport をさらに分離し、handler は HTTP 入口に限定する。
- 優先度
  - Medium

### 4-4. shared module 名と実責務のずれが残っている

- 問題
  - `context`, `persistence`, `state`, `conversation` などの一般名が広すぎて、ファイル名だけでは役割を推測しづらい。
- 該当箇所
  - `src/app/api/companies/[id]/interview/context.ts`
  - `src/app/api/companies/[id]/interview/persistence.ts`
  - `src/lib/motivation/conversation.ts`
- 放置リスク
  - 新規変更時に誤った層へ処理を足しやすい。
- 可読性・認知負荷への悪影響
  - 命名だけで責務が伝わらず、ファイルを開いて初めて重さが分かる。
- 状態管理への悪影響
  - 状態変換責務の置き場が曖昧なまま残る。
- 改善の方向性
  - naming を「保存」「復元」「正規化」「transport」「policy」など責務寄りに寄せる。
- 優先度
  - Medium

### 4-5. FastAPI の prompt / rule / transport / policy 境界が feature ごとに不揃い

- 問題
  - `motivation`, `interview`, `gakuchika`, `es_review`, `company_info` で、prompt 定義、request model、retry policy、streaming helper の置き場所が統一されていない。
- 該当箇所
  - `backend/app/routers/motivation.py`
  - `backend/app/routers/interview.py`
  - `backend/app/prompts/es_templates.py`
- 放置リスク
  - 新規 AI feature 追加時に毎回別様式が生まれ、共通基盤化が進まない。
- 可読性・認知負荷への悪影響
  - feature ごとに読む順序が変わるため、横断理解コストが高い。
- 状態管理への悪影響
  - retry / fallback / evaluation の状態遷移も feature ごとに異なる設計になる。
- 改善の方向性
  - AI feature 共通の分割規約を決め、router / prompt / policy / transport の責務を揃える。
- 優先度
  - Medium

## 5. 軽微だが整えたい点

### 5-1. 一部の外部依存集約は良いが、観測や logging の様式がまだ揺れている

- 問題
  - logger の利用は改善しているが、feature ごとの telemetry / debug / user-facing error の書き方が揃っていない。
- 該当箇所
  - `backend/app/utils/llm.py`
  - `backend/app/utils/web_search.py`
  - `src/lib/logger` を使わない route 群
- 改善の方向性
  - 機能単位ではなく観測責務単位で logging policy を整理する。

### 5-2. `schema.ts` は巨大だが、現時点では深刻度は中以下

- 問題
  - `src/lib/db/schema.ts` は 963 行と大きいが、現時点では「責務混在」よりも Drizzle 集約の性質が強い。
- 該当箇所
  - `src/lib/db/schema.ts`
- 改善の方向性
  - まず会話状態と route/service 境界の整理を優先し、schema 分割は後順位で判断する。

### 5-3. legacy 互換フィールドは必要だが、散在の見え方が悪い

- 問題
  - legacy 互換自体は必要だが、どこまで現役でどこから移行待ちかが読み手に明確でない。
- 該当箇所
  - `src/lib/motivation/conversation.ts`
  - `src/components/gakuchika/CompletionSummary.tsx`
  - `src/components/companies/corporate-info-section/workflow-config.ts`
- 改善の方向性
  - legacy 対応箇所を feature 単位の移行ポリシーとして整理し、散在を減らす。

## 6. 観点別レビュー

### 6-1. 責務の混在

- 最も混在が強いのは会話 hook と AI stream route。UI、workflow、billing、persistence、transport が同居している。
- FastAPI 側では router と util に prompt policy、provider routing、search strategy、retry、telemetry が重なっている。

### 6-2. ファイル肥大化

- 3000 行級の `motivation.py`、1000 行級の `useMotivationConversationController.ts` は、読む前提知識の量として重すぎる。
- ただし「行数が多いから悪い」ではなく、状態・副作用・外部依存の概念数が多いことが本質的な問題。

### 6-3. 密結合・レイヤー違反

- page が thin wrapper から外れ、hook と一緒に feature orchestration を抱えるため、UI 層と業務層の境界が弱い。
- route support module が domain service と persistence policy を抱えており、HTTP 入口の層に業務の本体が沈んでいる。

### 6-4. 重複した知識・ロジック

- SSE 実行、billing precheck、error handling、conversation restore の知識が feature ごとに別実装で再出現している。
- FastAPI 側でも provider / retry / prompt 組み立ての知識が複数モジュールに分散している。

### 6-5. 外部依存の散在

- 良い例として `src/lib/fastapi/client.ts` はあるが、AI 実行まわりの知識は Next route と FastAPI util にまたがる。
- `llm.py` 周辺は provider 依存が強く、抽出済みモジュールも含めて責務境界がまだ不安定。

### 6-6. データ境界・状態管理

- 会話ドメインは DB 保存形、TS domain 形、UI 派生形、FastAPI request/response 形が多い。
- `Python-owned` の明記は良いが、それは「責務が明示された」だけで、「読みやすくなった」こととは別。翻訳層の数は依然多い。

### 6-7. 画面遷移と責務分担

- 会話開始前の setup、会話進行、draft 生成、完了後フォローアップが page / hook / route にまたがっており、責務分担がやや崩れている。
- `CompanyDetailPageClient` も detail page の orchestration を抱え込みやすい構造。

### 6-8. 可読性の低さ

- 命名よりも、1 ファイル内で同時に扱う概念数の多さが可読性を下げている。
- 大型 hook と大型 router は、読み始める前に地図がない。追跡コストが高い。

### 6-9. 開発時の認知負荷の高さ

- 志望動機、面接、ガクチカ、ES 添削はいずれも「直す前に読む量」が多い。
- 特に stream completion 後の保存・課金・UI 更新の順序は、実装者が頭の中で再構成しないと把握しづらい。

### 6-10. 状態主体の妥当性

- 状態主体の分け方が自然な箇所もあるが、会話 feature は `UI controller`, `stored conversation`, `backend conversation context`, `playback state` が重なりすぎている。
- 「UI state」と「会話 state」を分けるだけでは足りず、「transport 一時 state」も別主体として扱う必要がある。

### 6-11. 状態遷移の追跡容易性

- `pendingCompleteData` のような buffering state は必要だが、複数 feature で別様式になっており、追跡の抽象化が不足している。
- route 側でも complete event の後処理が feature ごとに異なるため、状態遷移を横断比較しづらい。

### 6-12. AI継ぎ足し開発で負債化しやすい箇所

- 会話 hook
- AI stream route
- `backend/app/utils/llm.py`
- `backend/app/routers/company_info.py`
- `backend/app/prompts/es_templates.py`
- これらは「条件分岐を 1 個足す」形の継ぎ足しが成立しやすく、設計の一貫性を壊しやすい。

### 6-13. 将来の変更容易性

- 単純 CRUD や thin wrapper page は比較的変更しやすい。
- 逆に会話系 feature と AI orchestration は、変更容易性より既存挙動の維持コストが勝っている。今のままでは機能追加の速度より回帰確認コストの方が増える。

## 7. 優先度付き改善候補一覧

### 7-1. 会話 hook を state 主体ごとに再分割する

- 対象
  - `src/hooks/useMotivationConversationController.ts`
  - `src/hooks/useInterviewConversationController.ts`
  - `src/hooks/useGakuchikaConversationController.ts`
- 問題の概要
  - UI / domain / transport / playback / persistence sync が単一 hook に集中している。
- 主に改善されるもの
  - 保守性
  - 可読性
  - 認知負荷
  - 状態管理の理解容易性
- 期待できる改善
  - 変更前に読む量が減る。state 遷移の責任箇所が明確になる。
- 影響範囲
  - 高い。会話系 product 全体。
- 放置リスク
  - 今後の会話機能追加のたびに回帰コストが上がる。
- 優先度（High / Medium / Low）
  - High

### 7-2. AI stream route の共通プロトコルを明示化する

- 対象
  - `src/app/api/documents/_services/handle-review-stream.ts`
  - `src/app/api/motivation/[companyId]/conversation/stream/route.ts`
  - `src/app/api/gakuchika/[id]/conversation/stream/route.ts`
- 問題の概要
  - SSE 完了条件、billing、保存、error shape が feature ごとに揺れている。
- 主に改善されるもの
  - 保守性
  - 変更容易性
  - 障害調査容易性
  - 状態管理の理解容易性
- 期待できる改善
  - 類似 feature の挙動差分が減り、障害時に比較しやすくなる。
- 影響範囲
  - 高い。AI 関連 Next API 全般。
- 放置リスク
  - 新 feature 追加時にさらに別流儀が増える。
- 優先度（High / Medium / Low）
  - High

### 7-3. page を thin wrapper へ戻し、派生 state を view model 側へ寄せる

- 対象
  - `src/app/(product)/companies/[id]/motivation/page.tsx`
  - `src/app/(product)/companies/[id]/interview/page.tsx`
  - `src/app/(product)/calendar/page.tsx`
- 問題の概要
  - page が routing 以上の責務を持っている。
- 主に改善されるもの
  - 保守性
  - 可読性
  - 認知負荷
  - 変更容易性
- 期待できる改善
  - `.omm` / docs と実装が近づき、入口の見通しが良くなる。
- 影響範囲
  - 中〜高。
- 放置リスク
  - page / hook / component の責務配置がさらに揺れる。
- 優先度（High / Medium / Low）
  - High

### 7-4. route support module を domain service/persistence/serialization に再整理する

- 対象
  - `src/app/api/companies/[id]/interview/context.ts`
  - `src/app/api/companies/[id]/interview/persistence.ts`
  - `src/app/api/gakuchika/state.ts`
- 問題の概要
  - shared/support の名前に対して、実際には業務本体が入っている。
- 主に改善されるもの
  - 保守性
  - 可読性
  - テスト容易性
  - 状態管理の理解容易性
- 期待できる改善
  - route 入口の薄さが増し、状態変換の責務が明確になる。
- 影響範囲
  - 中〜高。
- 放置リスク
  - route 変更が state schema 変更に直結する構造が残る。
- 優先度（High / Medium / Low）
  - High

### 7-5. FastAPI 巨大 router / util の「正本責務」を決め直す

- 対象
  - `backend/app/routers/motivation.py`
  - `backend/app/routers/company_info.py`
  - `backend/app/utils/llm.py`
- 問題の概要
  - 分割後も orchestration と dependency hub が混線している。
- 主に改善されるもの
  - 保守性
  - 可読性
  - 認知負荷
  - 変更容易性
- 期待できる改善
  - 分割が本当に読解負債削減に効くようになる。
- 影響範囲
  - 高い。FastAPI 中核。
- 放置リスク
  - 次の改修で再肥大化しやすい。
- 優先度（High / Medium / Low）
  - High

### 7-6. canonical conversation model を feature ごとに明示する

- 対象
  - `src/lib/motivation/conversation.ts`
  - `src/lib/interview/conversation.ts`
  - `src/app/api/gakuchika/state.ts`
- 問題の概要
  - 保存形、表示形、transport 形が過度に重なっている。
- 主に改善されるもの
  - 保守性
  - 認知負荷
  - 状態管理の理解容易性
- 期待できる改善
  - 状態の翻訳層が減り、再開や互換処理の扱いが明確になる。
- 影響範囲
  - 高い。会話ドメイン全般。
- 放置リスク
  - 特定条件だけ壊れる会話バグが増える。
- 優先度（High / Medium / Low）
  - High

### 7-7. `CorporateInfoSection` 系の workflow state を mode ごとに切る

- 対象
  - `src/components/companies/corporate-info-section/use-corporate-info-controller.ts`
  - `src/components/companies/CorporateInfoSection.tsx`
- 問題の概要
  - mode、modal、delete、fetch、upload の state が 1 controller に集まりすぎている。
- 主に改善されるもの
  - 保守性
  - 可読性
  - 認知負荷
- 期待できる改善
  - input mode 追加や compliance 条件追加の影響範囲が狭くなる。
- 影響範囲
  - 中。
- 放置リスク
  - 企業情報 UI が再度巨大 state machine 化する。
- 優先度（High / Medium / Low）
  - Medium

### 7-8. ES 添削 orchestration を stream handler からさらに切り出す

- 対象
  - `src/app/api/documents/_services/handle-review-stream.ts`
  - `src/hooks/useESReview.ts`
- 問題の概要
  - ES review の use case と stream transport がまだ密着している。
- 主に改善されるもの
  - 保守性
  - テスト容易性
  - 障害調査容易性
- 期待できる改善
  - template 推論、context 収集、stream 実行の責務が読み分けやすくなる。
- 影響範囲
  - 中。
- 放置リスク
  - template 機能追加で handler がさらに肥大化する。
- 優先度（High / Medium / Low）
  - Medium

### 7-9. AI feature 共通の module layout ルールを定める

- 対象
  - `backend/app/routers/**`
  - `backend/app/prompts/**`
  - `backend/app/utils/llm*.py`
- 問題の概要
  - feature ごとに prompt / policy / transport / request model の置き方が違う。
- 主に改善されるもの
  - 保守性
  - 可読性
  - 変更容易性
- 期待できる改善
  - 新規 AI feature 追加時の設計揺れが減る。
- 影響範囲
  - 広いが、即時の実装修正範囲は限定可能。
- 放置リスク
  - AI feature ごとのローカルルールが増殖する。
- 優先度（High / Medium / Low）
  - Medium

### 7-10. naming を責務基準で再整理する

- 対象
  - `context.ts`, `persistence.ts`, `state.ts`, `conversation.ts` 系
- 問題の概要
  - 一般名が広すぎて責務が即読できない。
- 主に改善されるもの
  - 可読性
  - 認知負荷
- 期待できる改善
  - 実装者がファイルを開く前に役割を推測しやすくなる。
- 影響範囲
  - 中。
- 放置リスク
  - 間違った層へロジックを足し続ける温床になる。
- 優先度（High / Medium / Low）
  - Medium

### 7-11. logging / telemetry の責務を feature 単位ではなく観測単位で揃える

- 対象
  - `backend/app/utils/llm.py`
  - `backend/app/utils/web_search.py`
  - AI 関連 Next route 群
- 問題の概要
  - user-facing error、debug、cost telemetry の扱いが統一されていない。
- 主に改善されるもの
  - 障害調査容易性
  - 保守性
- 期待できる改善
  - 障害時の比較や追跡が容易になる。
- 影響範囲
  - 中。
- 放置リスク
  - 異常時の証拠が feature ごとに欠落する。
- 優先度（High / Medium / Low）
  - Low

## 8. 追加で確認したい質問

- なし。今回のレビュー目的、対象、厳しさ、出力先は十分に確定しており、致命的な不明点はなかった。
