# SEO / Google Search Console 運用手順

就活Pass（本番ドメイン `https://www.shupass.jp`）の Google Search Console（以下 GSC）接続・診断・月次モニタリング手順をまとめる。

## 前提（重要）

- GSC は「検索結果に出すための登録窓口」ではない。Google は GSC 登録や sitemap 提出なしでもサイトを discover できる。GSC の価値は **インデックス状況・カバレッジ・canonical / robots / noindex / rendering の事実確認** と **実クエリ performance の観測**。
- Google Analytics 4（GA4）は計測基盤。検索順位の直接的なランキング要因ではない。
- FAQPage の rich result は「well-known, authoritative government / health sites」に限定される（Google 公式、2026-04-08 時点）。FAQ JSON-LD の主目的は rich result ではなく **構造化データ整理の一環**。

実装の正本:
- sitemap: `src/app/sitemap.ts` → `https://www.shupass.jp/sitemap.xml`
- robots: `src/app/robots.ts` → `https://www.shupass.jp/robots.txt`
- 所有権確認 meta: `src/app/layout.tsx` の `metadata.verification.google`（`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` から読む）
- GA4 埋め込み: `src/components/analytics/GoogleAnalytics.tsx`（`NEXT_PUBLIC_GA_MEASUREMENT_ID` から読む）

## Phase 1: GSC プロパティ追加と所有権確認

### 1-1. プロパティ追加
1. https://search.google.com/search-console を開く
2. 「プロパティを追加」→「URL プレフィックス」を選択
3. `https://www.shupass.jp` を入力（`https://shupass.jp` ではなく `www` 付き）

### 1-2. 所有権確認（meta タグ方式 / 推奨）

meta タグ方式のほうが手数が少なく、Next.js Metadata API と相性がよい。

1. GSC の「HTML タグ」オプションを選び、表示された content 値をコピー
   - 例: `<meta name="google-site-verification" content="abc123..." />` の `abc123...` 部分
2. Vercel（career_compass プロジェクト）の環境変数に追加:
   - Name: `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`
   - Value: 上記の content 値
   - Environments: Production
3. 再デプロイ（Vercel dashboard → Redeploy、または main に push）
4. GSC に戻り「確認」ボタンを押下

### 1-3. 所有権確認（HTML ファイル方式 / 代替）

meta 方式で失敗した場合のバックアップ。`public/googleXXXXXX.html` を直接置く形。

1. GSC で「HTML ファイル」オプションを選びファイル名（例: `google1234567890abcdef.html`）と中身をダウンロード
2. `public/google1234567890abcdef.html` として配置
3. main に commit & push → 自動デプロイ
4. `curl -s https://www.shupass.jp/google1234567890abcdef.html` で到達確認してから GSC の「確認」

## Phase 2: sitemap 送信

1. GSC 左メニュー「サイトマップ」
2. `sitemap.xml` を入力し「送信」
3. ステータスが `成功` になることを確認（Google 側処理に数分〜数時間かかることがある）
4. 下記コマンドで sitemap の内容を事前チェック:
   ```bash
   curl -s https://www.shupass.jp/sitemap.xml | grep -c '<url>'
   ```

## Phase 3: 主要 URL のインデックス登録リクエスト

GSC 上部のツールバーから URL 検査を実行し「インデックス登録をリクエスト」。
下記 URL をすべて検査・リクエスト:

- `https://www.shupass.jp/`
- `https://www.shupass.jp/ai-mensetsu`
- `https://www.shupass.jp/shiboudouki-ai`
- `https://www.shupass.jp/gakuchika-ai`
- `https://www.shupass.jp/es-tensaku-ai`
- `https://www.shupass.jp/shukatsu-ai`
- `https://www.shupass.jp/entry-sheet-ai`
- `https://www.shupass.jp/es-ai-guide`
- `https://www.shupass.jp/shukatsu-kanri`
- `https://www.shupass.jp/pricing`

各 URL で以下の状態を記録する:
- カバレッジ（URL is on Google / URL is not on Google）
- インデックス可否判定理由（canonical / robots / noindex / クロール拒否 等）
- Render test のスクリーンショット OK/NG

## Phase 4: 本番確認コマンド（デプロイ後）

### HTML / meta / canonical / JSON-LD
```bash
curl -s https://www.shupass.jp/ | grep -i '<title>\|<meta name="description"\|<link rel="canonical"\|<script type="application/ld+json"'
curl -s https://www.shupass.jp/ | grep -i 'google-site-verification\|googletagmanager.com/gtag/js'
```

### robots / sitemap
```bash
curl -s https://www.shupass.jp/robots.txt
curl -s https://www.shupass.jp/sitemap.xml | grep -c '<url>'
curl -s https://www.shupass.jp/sitemap.xml | grep -E 'ai-mensetsu|shiboudouki-ai|gakuchika-ai|es-tensaku-ai|shukatsu-ai'
```

### HTTP ヘッダ（noindex 混入チェック）
```bash
curl -I https://www.shupass.jp/ | grep -i 'x-robots-tag\|cache-control'
```

### 新規 LP の構造化データ
```bash
for slug in ai-mensetsu shiboudouki-ai gakuchika-ai es-tensaku-ai shukatsu-ai; do
  echo "=== /$slug ==="
  curl -s "https://www.shupass.jp/$slug" | grep -i '<title>\|<meta name="description"\|<link rel="canonical"\|<script type="application/ld+json"'
done
```

### Google Rich Results Test
- https://search.google.com/test/rich-results に各 LP URL を投入
- Organization / SoftwareApplication / WebSite が警告なしでパース
- FAQPage は「Detected」として認識されればよい（rich result 適用対象外は想定内）
- `/tools/es-counter` 等では BreadcrumbList が検出される

## Phase 5: 診断チェックリスト

| チェック項目 | 期待値 | 確認方法 |
|---|---|---|
| canonical 自己参照 | 各 URL の `<link rel="canonical">` が自分自身を指す | 上記 curl |
| robots meta | `index, follow`（`noindex` になっていない） | GSC URL 検査の Rendering タブ |
| x-robots-tag ヘッダ | なし or `index, follow` | `curl -I` |
| sitemap に含まれる | 公開ページはすべて含まれる | 上記 `grep -c` |
| robots.txt の allow/disallow | `/api/` 以下や dashboard は Disallow、marketing は Allow | `curl` |
| render OK | JS 実行後にメインコンテンツが HTML に反映される | GSC URL 検査 → ライブテスト → スクリーンショット |
| 内部リンク | 主要 LP が relevant LP / hub から 3 クリック以内で到達 | 手動 + GSC 「リンク」レポート |
| 被リンク | GSC 「リンク」レポートに外部リンクが入っているか | GSC |

## Phase 6: 月次モニタリング KPI

`docs/marketing/README.md` の KPI と重複しないよう、GSC で確認できる観測指標に限定する。

| 指標 | 収集元 | 目標 |
|---|---|---|
| 検索パフォーマンス | GSC > 検索パフォーマンス | 表示回数 / クリック / CTR / 平均掲載順位の推移 |
| カバレッジ | GSC > ページ | 「インデックスに登録済み」= 公開 LP 数 |
| sitemap 状態 | GSC > サイトマップ | 成功 / 検出された URL 数 |
| 主要クエリ | GSC > 検索パフォーマンス > クエリ | 「就活Pass」「シューパス」「AI 面接対策」「志望動機 AI」等の impression 推移 |
| モバイル ユーザビリティ | GSC > エクスペリエンス | エラー 0 維持 |

### 現実的な到達タイムライン（期待値）

| タイムライン | 指標 | 期待値 |
|---|---|---|
| デプロイ後 48 時間以内 | sitemap 状態 | `成功` |
| 7 日以内 | 主要 URL の検査 | 「URL is available to Google」 |
| 14 日以内 | カバレッジ | 新規 3 LP が登場 |
| 14-30 日 | impression | 新規 LP への impression / click の立ち上がり |
| 30 日 | 指名検索 | 「就活Pass」「シューパス」で 1 位圏内 |
| 30-60 日 | ロングテール | 「AI 面接対策」「志望動機 AI」「ガクチカ AI」で top 50 圏内を目標（保証なし） |

## Phase 7: トラブル時の切り分け

### 「URL is not on Google」と出た場合
1. GSC URL 検査 → 「公開 URL のテスト」→ render OK か確認
2. `noindex` が入っていないか: HTML `<meta name="robots">` と HTTP `x-robots-tag`
3. canonical が他 URL を指していないか: `<link rel="canonical">`
4. robots.txt で Disallow に入っていないか: `curl https://www.shupass.jp/robots.txt`
5. soft 404（中身が薄すぎる）判定になっていないか: 本文の文字数を確認、thin content 回避
6. 被リンクが一切ない新規 LP は discovery 遅延が発生しやすい → 内部リンクハブ（`/shukatsu-ai`）と sitemap 経由で Googlebot のクロール動線を確保

### 「Discovered - currently not indexed」
- Google が URL を知っているがクロール優先度が低い状態
- 内部リンク強化 + sitemap 更新 + URL 検査で「インデックス登録をリクエスト」
- 本文を厚くし、固有性・一次情報（具体的な機能挙動・画面構成・サンプル出力）を増やす
- 類似コンテンツとの差異（keyword / title / H1 / FAQ 語彙）を明確にしてカニバリゼーションを回避

### 「Crawled - currently not indexed」
- クロールはしたが品質判定で除外された状態
- Thin content 疑い → 本文 800 字以上、FAQ 5-6 問、実装裏付けのスクリーンショット・図解を追加
- 他 LP と内容がかぶっていないか確認（title / H1 / primary keyword の排他設計）

## Phase 8: 新規 LP 追加時のチェックリスト

新しい SEO LP を追加する際は以下をすべて更新:

- [ ] `src/app/(marketing)/<slug>/page.tsx`（Server Component、`createMarketingMetadata` 使用）
- [ ] `src/lib/marketing/<slug>-faqs.ts`（FAQ SSOT 分離）
- [ ] `src/app/sitemap.ts` に追加（priority 0.9）
- [ ] `src/app/robots.ts` の allow に追加
- [ ] `docs/marketing/README.md` のデプロイ後確認 URL に追加
- [ ] `docs/marketing/LP.md` のキーワード戦略表に追加
- [ ] GSC の URL 検査 → インデックス登録リクエスト（手動）

## 関連ドキュメント

- `docs/marketing/LP.md` — LP の設計・コピー方針
- `docs/marketing/README.md` — マーケティング全体の運用
- `docs/architecture/FRONTEND_UI_GUIDELINES.md` — UI 規約
- `src/app/sitemap.ts` / `src/app/robots.ts` — 実装の正本
- `src/lib/seo/site-structured-data.ts` — 構造化データ SSOT
