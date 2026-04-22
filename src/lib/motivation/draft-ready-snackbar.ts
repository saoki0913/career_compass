/**
 * 志望動機 Draft Ready スナックバーの発火条件を判定する純粋関数。
 *
 * 既存の controller / playback フックは backend の `draftReadyJustUnlocked`
 * フラグに依存して通知を出している。一方このモジュールは
 * `MotivationConversationContent` 側で `isDraftReady` の `false → true`
 * 遷移を直接観測してフォールバック通知を出すための判定ロジックを
 * 提供する (再読み込み・別経路で `isDraftReady` が立った場合の保険)。
 *
 * 1 セッション中に 1 度しか通知しないため `alreadyNotified` を引数で受け取り、
 * UI 側 ref と組み合わせて再表示を抑制する。
 */
export type DraftReadyTransitionInput = {
  previous: boolean;
  current: boolean;
  alreadyNotified: boolean;
};

export function shouldNotifyDraftReadyTransition({
  previous,
  current,
  alreadyNotified,
}: DraftReadyTransitionInput): boolean {
  if (alreadyNotified) return false;
  if (current !== true) return false;
  if (previous === true) return false;
  return true;
}
