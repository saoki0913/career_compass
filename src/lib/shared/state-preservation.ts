/**
 * 楽観的更新の前に復旧対象フィールドを切り出して保存する state 保持ユーティリティ。
 */

export interface RollbackSnapshot<S extends object> {
  readonly fields: Readonly<Partial<S>>;
}

/**
 * 楽観的更新を行う前に、復旧対象フィールドの現在値を切り出して保存する。
 * エラー catch でこの snapshot を使ってフィールドを巻き戻すことで、
 * 「一部だけ復旧して整合性が崩れる」状態を防ぐ。
 */
export function captureRollback<S extends object>(
  source: S,
  keys: ReadonlyArray<keyof S>,
): RollbackSnapshot<S> {
  const fields = {} as Partial<S>;
  for (const key of keys) fields[key] = source[key];
  return { fields };
}
