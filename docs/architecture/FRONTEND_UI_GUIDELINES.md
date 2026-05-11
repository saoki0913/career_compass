# Frontend UI Guidelines

Codex で新規 UI や大きな UI 改修を行うときの、repo 標準のフロントエンドデザイン指針です。

- 対象: `src/components/`、`src/app/**/page.tsx`、主要導線のレイアウト改修
- 優先度: 新規 UI / 大規模改修では強く適用する
- 例外: 既存のデザインシステムや画面構造が定着している箇所は、それを壊さずに拡張する

出典:
- OpenAI: `https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4`

---

## 1. 適用方針

- まず composition を決めてから component を組む。最初からカードや小要素を並べて組み立てない。
- 最初の viewport は「1つの強い構図」として読める状態を目指す。
- Public / marketing surface と product UI では最適な見せ方が違う。ページ種別ごとに設計する。
- UI の質は装飾量ではなく、階層、余白、視線誘導、ビジュアルアンカーで作る。
- 既存 UI の改善では、見た目の刷新よりも、現行導線を保ったまま hierarchy と clarity を上げる。

## 2. 作業開始前チェック（推奨）

設計判断や hero 構成、新規 route 追加など方向性の合意が要るときは、UI 実装前に次の preflight を実行することを推奨する（必須ではない）。

```bash
npm run ui:preflight -- <route> --surface=marketing|product [--auth=none|guest]
```

- 対象: `src/components/**`, `src/app/**/page.tsx`, `src/app/**/layout.tsx`, `src/app/**/loading.tsx`, `src/components/skeletons/**`
- この command は対話式で preflight を集め、会話、PR 本文、作業ログに貼れる Markdown を出力する
- 軽微な修正や既存パターン踏襲では省略してよい。判断に迷ったら preflight を回す

preflight では、最低限次の 7 点を言語化する。

1. `visual thesis`
- 1 文で、画面のムード、質感、情報密度、エネルギーを定義する。

2. `content plan`
- Hero / support / detail / final CTA のどこまで必要か決める。
- Product UI では hero を置かず、workspace 起点で始めてよい。

3. `interaction thesis`
- 印象を変えるモーションを 2-3 個だけ決める。

4. `design tokens`
- 少なくとも `background` / `surface` / `primary text` / `muted text` / `accent` を決める。
- typography role は `display` / `headline` / `body` / `caption` を意識する。

5. `viewport check`
- desktop と mobile の両方で、最初の画面に何を見せるかを先に固定する。

6. `existing visual language / constraints`
- 既存画面のパターンを継承するのか、どこを壊してはいけないのかを明記する。

## 3. Hard Rules

- One composition: 最初の viewport をダッシュボードの寄せ集めにしない。
- Brand first: branded page ではブランド名やプロダクト名を hero レベルで見せる。
- Brand test: nav を隠しても「何のページか」が一目で分かる状態にする。
- Typography: 目的あるタイポを使い、安易な default stack に逃げない。
- Background: 単色塗りだけで済ませず、gradient、image、pattern などで空気感を作る。
- Real visual anchor: 主役になる visual は、商品、プロダクト、利用文脈、空気感のどれかを担う。
- Hero budget: hero には要素を詰め込まない。通常は brand、headline、短い補足、CTA、dominant visual まで。
- No hero overlays: hero 上に badge、chip、promo、stat strip を重ねすぎない。
- Cards by exception: デフォルトは cardless。カードは「操作コンテナ」として必要な時だけ使う。
- One job per section: 1 section 1 purpose を守る。
- Reduce clutter: pill 群、アイコン列、boxed promo、細かい metadata 群を初期状態で置かない。
- Motion with intent: モーションは presence と hierarchy を作るために使い、飾りだけの動きは入れない。
- Mobile first validation: sticky 要素や floating 要素が主要コンテンツを塞がないことを確認する。

## 4. ページ種別別ガイド

### Marketing / LP / 公開ページ

- full-bleed hero を基本にする。inset hero image や小さな浮遊カードを初手にしない。
- first viewport は poster のように扱う。
- コピーは短く、headline が意味を持つようにする。
- デフォルト構成:
  1. Hero
  2. Support
  3. Detail
  4. Final CTA
- セクションが増える場合でも、同じ内容を言い換えて繰り返さない。
- 実在感のある imagery を優先し、decorative gradient だけを主役にしない。

### Product UI / Dashboard / 管理画面

- marketing copy より utility copy を優先する。
- hero 的な大見出しより、workspace、status、filter、table、chart、task context を先に見せる。
- dashboard-card のモザイクを避け、layout と spacing で情報を整理する。
- calm surface hierarchy、few colors、minimal chrome を基本にする。
- section heading は「その領域で何ができるか」「何を見ているか」を明示する。
- operator が heading、label、number だけを見ても理解できることを目指す。
- pipeline / kanban ではカラムヘッダーに飽和色（500 weight）を使い、パイプライン進行を視覚的に伝える。カウントバッジは `bg-white/90` + カラム固有テキスト色で視認性を確保する。
- タスクカードの最優先アイテムは shadow + ring + gradient で視覚的重みを付ける。通常行との階層差を明確にする。
- インラインアクションボタンは `border-[1.5px]` + `shadow-sm` + tone-specific `iconInline` 背景で深度を出す。

## 5. 実装と検証フロー（推奨）

- 設計判断が必要な場面では実装前に `npm run ui:preflight -- <route> --surface=marketing|product [--auth=none|guest]` を実行し、出力 Markdown を会話、PR 本文、作業ログのいずれかに残す。
- UI 変更後は `npm run lint:ui:guardrails` を通し、marketing の accent color 逸脱や `loading.tsx` の spinner-only 化を止める（推奨）。
- Tailwind / React では token と spacing rhythm を先に固めてから細部を積む。
- 余白、整列、contrast、crop を調整しても解決しない場合にだけ装飾を足す。
- motion は最低 2 個、多くても 3 個程度の意図的なものに留める。
- fixed / floating UI は safe area に置き、本文や CTA に重ならないようにする。
- desktop / mobile の両 viewport で確認する。
- responsive 改修では最低でも `320 / 390 / 768 / 1024 / 1440` を意識し、横スクロール、safe-area 欠け、sticky/fixed 干渉、tap blockage を確認する。
- full-screen overlay、bottom sheet、mobile menu、chat input、FAB は `env(safe-area-inset-*)` を考慮する。
- PR では `.github/PULL_REQUEST_TEMPLATE.md` の `UI Review Routes` を該当する場合に記入する。
- UI 変更後は `docs/testing/UI_PLAYWRIGHT_VERIFICATION.md` に従い、`npm run test:ui:review -- <route>` で見た目と導線を確認することを推奨する。

## 6. 禁止パターン

- generic SaaS card grid を第一印象にする
- brand が nav にしか存在しない
- hero に stats、chips、logo cloud、badge 群を詰め込む
- busy な背景画像の上に長文テキストを置く
- section ごとに同じメッセージを繰り返す
- product UI を装飾カードの積み上げで作る
- 意味のない hover animation や scroll animation を量産する
- decorative gradient や abstract background だけで「良いデザイン」に見せようとする

## 7. カラーシステム

- oklch カラー形式を使用（Tailwind CSS 4 互換）。
- プライマリカラーは hue 235（ブルー系）。`:root` と `.dark` の両方で `--primary` を基準に統一。
- LP やマーケティング面では `text-primary`、`bg-primary/10` などの CSS 変数ベースクラスを使用し、ハードコード色（`text-sky-700`、`bg-emerald-*` 等）は使わない。
- LP ボタンは `globals.css` の `.landing-cta-primary` / `.landing-cta-secondary` で定義。

## 8. ローディングパターン

- **標準は trust-oriented skeleton UI**。白い空白と小さい spinner だけの待機面は作らない。
- `src/components/ui/skeleton.tsx` をプリミティブにし、loading の主役は skeleton 自体にする。説明カードを積み増して情報量を増やさない。
- product UI ではトップレベルの汎用 loading surface を置かず、各 route segment の `loading.tsx` で本文と同じ skeleton を返す。`src/app/loading.tsx` で product 遷移を受ける実装は、ページ専用 skeleton と競合しやすいため採用しない。
- product route の `loading.tsx` は、可能な限りページ見出し・フィルタ帯など**本文**の文脈を保った skeleton を返す。`(product)/layout` はヘッダーを持たないため、**実装に応じて** `loading.tsx` やページ側で `<DashboardHeader />` を含め、遷移中もトップナビの見た目を揃える（通知・クレジットは SWR でキー共有されデデュープされる）。
- 一覧ページでは `ListPageFilterBar` を loading 中でも極力残し、検索・絞り込みの位置関係を消さない。
- 企業、ES、ガクチカ、タスク、締切などの一覧ページは `ListPageFilterBar` / `ListPageFilterBarSkeleton` を標準にする。バーは2行構成を基本にし、1行目へ検索、並び替え、追加フィルタ、表示切替、追加/CSV などの action を同じ横スクロール行で載せる。2行目へ filter tab と active filter chip を同じ横スクロール行で載せ、フィルタ適用時だけ3行目が増えないようにする。
- product workspace の見出しは、カテゴリ pill、H1、短い説明、右側 summary/action の順に揃える。カレンダーや会話画面のような作業画面は `max-w-[96rem]` を上限にし、通常一覧より広く使ってよい。
- ページ別 skeleton は `src/components/skeletons/` に配置し、`DashboardSkeleton`、`CompaniesListSkeleton`、`ESListSkeleton` などの naming を維持する。
- 会話系ページ（志望動機・面接・ガクチカ）の skeleton は `ConversationWorkspaceShellSkeleton` を共有基盤にし、`sidebarSkeleton` prop で機能固有のサイドバーを差し替える。Shell のレイアウトクラス（grid 比率・breakpoint・container 幅）を SSOT としてスケルトンにコピーし、drift を防ぐ。
- shimmer は控えめに使い、pulse や spinner を主役にしない。
- `RouteProgressBar` のような細い top bar 単体や、汎用 spinner + 「読み込み中...」だけの UI は使わない。

## 9. 会話 UI コンポーネント構成

ガクチカ深掘り、志望動機作成、面接練習などの会話系機能は、共通の chat コンポーネント群を使う。

### レイアウト: `ConversationWorkspaceShell`

`src/components/chat/ConversationWorkspaceShell.tsx` が会話画面の共通レイアウト。slot-based で以下を受け取る:

| slot | 用途 |
|---|---|
| `backHref` / `title` / `subtitle` | ヘッダー (戻るリンク + タイトル) |
| `titleExtra` | タイトル横の追加要素 (Badge 等) |
| `actionBar` | ES 生成バー / 生成済みカード |
| `headerActions` | ヘッダー右側のアクション |
| `mobileStatus` | モバイル用ステータスバー (`xl:hidden`) |
| `conversation` | メッセージリスト / セットアップ画面 |
| `composer` | 入力欄 / エラーバナー |
| `sidebar` | サイドバーカード (Fragment で渡す) |

各機能ページは Shell を使い、独自のレイアウト div を持たない。対応する skeleton は `ConversationWorkspaceShellSkeleton`（`src/components/skeletons/ConversationWorkspaceShellSkeleton.tsx`）を共有し、サイドバー slot で機能別コンテンツを注入する。

### ES 生成アクションバー: `ConversationActionBar`

`src/components/chat/ConversationActionBar.tsx` は文字数選択 + 生成ボタンのコンパクトなバー。`helperText` は省略可能で、省略時は 2 カラム (controls + button) のみの 1 行レイアウトになる。

### 文字数選択: `CharLimitSelector`

`src/components/chat/CharLimitSelector.tsx` は 300/400/500 字の選択ボタン。`ConversationActionBar` の `controls` slot に渡して使う。

### 下書きプレビュー: `DraftPreviewModal`

`src/components/chat/DraftPreviewModal.tsx` は ES 下書きのプレビューモーダル。ガクチカ・志望動機で共通。props で差分を吸収:
- `deepDiveConfirm` — ガクチカのみ AlertDialog 確認付き
- `draftQuality` — ガクチカのみ品質警告表示
- `preBodyNotice` — ガクチカのみ削除注意バナー

### 進捗表示: `ConversationProgressBar` / `ConversationPhaseBar`

`src/components/chat/ConversationProgressBar.tsx` はスロット進捗をピルバッジで表示する共通コンポーネント。ガクチカ（4要素: 状況/課題/行動/結果）と志望動機（6スロット）で共用する。`stages` 配列でデータ駆動、`variant: "stacked" | "inline"` でサイドバー/モバイル切替、`children` でカスタムコンテンツ（深掘りモードの CausalGapStep 等）を注入。配色: emerald (done), sky (current), muted (pending)。

`src/components/chat/ConversationPhaseBar.tsx` はライフサイクルフェーズを表示する共通コンポーネント。`phases` 配列でデータ駆動。各機能が独自のフェーズラベルを注入する。

### サイドバー: `ConversationSidebar`

`src/components/chat/ConversationSidebar.tsx` がサイドバーの共通構成を提供する composition コンポーネント。進捗表示（`ConversationProgressBar` + `ConversationPhaseBar`）、ヘルパーテキスト、リスタートボタン、バッジを内包し、各機能は `children` でドメイン固有カードを差し込む。

| prop | 用途 |
|---|---|
| `progressStages` / `progressHeaderSubtext` / `progressFooterMessage` | 進捗バーのデータ |
| `phases` | フェーズバーの `PhaseItem[]`（`computePhaseItems()` で生成） |
| `helperText` | 進捗カード下部のヘルパーテキスト |
| `badges` | AI/基本質問バッジ、業界/職種バッジ等 |
| `progressChildren` | `CausalGapSteps` 等の進捗バー内追加コンテンツ |
| `setupContent` | setup 中の代替表示（指定時は progress/phase を非表示） |
| `showReset` / `onReset` / `resetDisabled` | リスタートボタン制御 |
| `children` | セッション履歴、作成メモ、エビデンスカード等 |

各機能は feature-specific wrapper を持つ:
- ガクチカ: `GakuchikaConversationSidebar`（`src/components/gakuchika/`）
- 志望動機: `MotivationConversationSidebar`（`src/components/motivation/`）

`ConversationSidebarCard`（`ConversationWorkspaceShell.tsx` 内）をカード単位で使い、外側のラッパーは Shell が提供する。

### フェーズライフサイクル: `conversation-lifecycle`

`src/lib/shared/conversation-lifecycle.ts` がフェーズバーのラベルと状態計算を一元管理する。

- `StandardPhaseKey`: `"questioning" | "draft_ready" | "deep_dive" | "completed"` の union 型
- `STANDARD_PHASES`: 統一ラベル「ヒアリング中 / ES作成可 / 深掘り中 / 完了」の定義
- `computePhaseItems(currentPhaseKey, hasDraft?)`: current phase から `PhaseItem[]` を導出

各機能はドメイン stage → `StandardPhaseKey` のマッピングを持ち、`computePhaseItems()` に渡す。

### リスタートダイアログ: `ConversationRestartConfirmDialog`

`src/components/chat/ConversationRestartConfirmDialog.tsx` は会話やり直し確認の共通ダイアログ。`title`、`description`、`confirmLabel` でカスタマイズ可能。ガクチカ・志望動機の両方で使用。

### 材料揃い CTA: `DraftReadyCTA`

`src/components/chat/DraftReadyCTA.tsx` は材料が揃った時点で表示する CTA。`variant: "pre-draft" | "post-draft"` で生成前/生成後のスタイルを切り替える。

### モバイルステータス: `ConversationMobileStatus`

`src/components/chat/ConversationMobileStatus.tsx` はモバイル向けのインラインステータスバー。`badges`、`stages`、`actions`、collapsible `children` を持つ。

## 10. Codex 向け運用メモ

- UI タスクでは `frontend-design`, `ui-ux-pro-max`, `vercel-react-best-practices`, `component-refactoring` を適宜使う。
- 既存画面を触るときは、まず repo 内の既存 visual language と component pattern を確認する。
- 新規 UI や大きな改修では、この文書の hard rules を優先する。
- 迷ったら「要素を足す」より「構図を絞る」「コピーを削る」「ビジュアルアンカーを強くする」を先に検討する。
