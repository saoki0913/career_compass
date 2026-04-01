# Tenant 分離監査メモ

本書は 2026-03-30 時点の実装を基に、`companyId` を使う企業機能と企業 RAG で、他ユーザーのデータが混ざる・参照される・紐づけられる余地がないかを確認した監査メモです。

参照実装:

- `src/lib/db/schema.ts`
- `src/app/api/companies/**`
- `src/app/api/motivation/**`
- `backend/app/routers/company_info.py`
- `backend/app/utils/vector_store.py`
- `backend/app/utils/bm25_store.py`

---

## 1. 結論

現状は、**通常運用で他ユーザーの企業 RAG がそのまま混ざる設計ではない**。主な理由は次の 2 点。

1. `companies.id` は `crypto.randomUUID()` で生成されるため、`companyId` はグローバル一意で推測も難しい
2. 企業 RAG の主要な Next API は、FastAPI に渡す前に `companyId + userId` で所有権確認をしている

ただし、**分離保証としては弱い**。理由は次のとおり。

- ChromaDB / BM25 / RAG cache は `company_id` を主キーとして扱い、`userId` / `guestId` / `tenant_key` を持たない
- FastAPI は internal JWT で Next BFF だけを受けるが、`company_id` の owner を再検証しない
- Postgres の XOR 制約は `companies` などの owner を守るが、外部ストアである ChromaDB / BM25 には及ばない

したがって、現状の分離は **`companyId` の一意性 + Next API の owner check 依存**で成り立っている。

---

## 2. 確認した事実

### 2.1 Postgres 側の owner 設計

- `companies` は `userId` / `guestId` の XOR 制約を持つ
- `motivation_conversations` も `userId` / `guestId` の XOR 制約を持つ
- `company_pdf_ingest_jobs` は `companyId` に FK を持つが、tenant 情報は持たない

ここまでは「会社レコード」「会話レコード」単位の owner は表現できている。

### 2.2 RAG 実体の保存キー

- Chroma metadata の主要キーは `company_id`, `source_url`, `content_type`, `ingest_session_id`
- BM25 の永続化ファイル名は `backend/data/bm25/{company_id}.json`
- RAG の検索・削除・ステータス取得・BM25 更新はいずれも `company_id` で絞る

つまり、RAG 実体の境界は tenant ではなく `company_id` である。

### 2.3 FastAPI 境界

- FastAPI ルーター全体は `require_internal_service` で internal JWT を要求する
- これは「Next BFF から来た内部通信か」を確認するもので、`company_id` の owner 検証ではない
- `/company-info/rag/*` は受け取った `company_id` をそのまま使って RAG を保存・検索・削除する

したがって、FastAPI 単体は tenant 分離の最終防衛線ではない。

---

## 3. 機能別の監査結果

### 3.1 企業 RAG

状態:

- `fetch-corporate` / `fetch-corporate-upload` / `delete-corporate-urls` は Next API で owner を確認してから FastAPI を呼ぶ
- FastAPI 側は tenant を再検証しない
- Chroma/BM25 は `company_id` 単独で分離される

評価:

- **High**
- 通常は混ざりにくいが、分離保証が Next API の所有権確認に偏っている

### 3.2 志望動機

状態:

- `motivation_conversations` の取得・保存は `companyId + userId` または `companyId + guestId` で行う
- ただし `conversation` / `conversation/start` / `conversation/stream` / `generate-draft` は、会社レコードの取得で `companies.id = companyId` しか見ていない箇所がある
- そのため、他人の `companyId` を知っていれば、自分の会話をその会社に紐づける余地がある

評価:

- **Critical**
- 直接 RAG 混在ではないが、tenant 境界としては明確な欠陥

### 3.3 面接対策

状態:

- `buildInterviewContext()` が `companyId + userId` で owner を確認しており、企業データへのアクセス境界は明示的

評価:

- **Low**
- 少なくとも現行の面接 API では、志望動機より分離が堅い

---

## 4. 見つかった問題

### Critical

1. `motivation` 系 API に、会社 owner の未確認経路がある
   - 会話 owner は確認しているが、会社 owner を確認していない
   - 他人の `companyId` に自分の会話を作成・接続できる余地がある

### High

1. RAG / BM25 / FastAPI が `company_id` 単独で tenant 境界を表現している
   - `tenant_key` がない
   - owner check が Next API に偏っている

2. FastAPI が internal JWT だけで `company_id` を信頼する
   - 内部通信の認証はある
   - ただし tenant 再検証はない

### Medium

1. `company_pdf_ingest_jobs.source_url` がグローバル unique
   - 現行の `upload://corporate-pdf/{companyId}/{uuid}` では衝突しにくい
   - ただし設計としては tenant を越えた一意制約であり、`companyId + sourceUrl` の複合一意の方が意味は明確

2. DB 設計ドキュメントだけ読むと、XOR 制約で tenant 分離が十分に見える
   - 実際には Chroma/BM25 の外部ストア境界が別にある

---

## 5. 改善の優先順位

### すぐ直すべき

1. `motivation` 系 API で `getOwnedCompany` 相当の owner check を必須にする
2. `companyId` を受ける API の owner check を共通 helper に寄せる

### 次の段階で直すべき

1. Chroma metadata / BM25 / cache に `tenant_key` を追加する
2. 保存・検索・削除・status 取得で `company_id` だけでなく `tenant_key` でも絞る

### より強い分離にしたい場合

1. FastAPI request contract に tenant 情報を載せる
2. FastAPI 側でも `company ownership` を再検証できる構成にする

---

## 6. この監査メモの読み方

- 「今すぐ他人の RAG が勝手に混ざる」と断定するものではない
- 「現在の分離保証はどこで成立していて、どこが弱いか」を明文化したもの
- 実装修正の正本はコードであり、本書は 2026-03-30 時点の監査結果である
