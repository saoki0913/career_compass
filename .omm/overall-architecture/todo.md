1. Feature ごとに UI/controller、BFF route、application policy、domain model、infrastructure adapter の境界を固定する。
2. ES review、company-info、RAG、conversation state、billing policy を優先して use case と adapter を分ける。
3. `.omm/state-transitions` を使って deadline、billing、conversation、RAG ingest の状態正本を追跡できるように保つ。
4. compatibility shim と unused export を削除候補として反証し、dead code が新規変更の入口にならないようにする。
