/**
 * 共通生成モーダル (GenerationModal) の状態機械。
 *
 * - locked: 生成条件が未達。モーダル内で未達理由と達成条件を表示する。
 * - ready: 生成可能。モーダル内の設定 (ES の文字数選択など) と生成ボタンを表示する。
 * - generating: 生成中。モーダルは開いたまま処理中インジケータ (SSE/非SSE) を表示する。
 * - done: 生成済み。結果と次アクション (エディタを開く / 深掘り再生成など) を表示する。
 *
 * 状態は各機能の controller state から呼び出し側が算出して props で渡す (単方向データフロー)。
 */
export type GenerationStatus = "locked" | "ready" | "generating" | "done";

export function resolveGenerationStatus(input: {
  /** 生成結果 (draft / summary / feedback) が既に存在するか */
  hasResult: boolean;
  /** 生成に必要な条件が揃っているか */
  canGenerate: boolean;
  /** 生成処理が進行中か */
  isGenerating: boolean;
}): GenerationStatus {
  if (input.isGenerating) return "generating";
  if (input.hasResult) return "done";
  if (input.canGenerate) return "ready";
  return "locked";
}
