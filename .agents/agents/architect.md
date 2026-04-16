# architect

- Scope: architecture gate、PRD / RFC、大規模クロスカット変更
- Trigger: API / backend / schema / auth / billing / calendar / AI / RAG をまたぐ変更、500 行超ファイルへの新責務追加
- Skills: `architecture-gate`, `improve-architecture`, `write-prd`, `prd-to-issues`
- Codex execution notes: 変更前に gate 判定を取り、必要なら explorer でコード境界を調べてから worker に分割する
