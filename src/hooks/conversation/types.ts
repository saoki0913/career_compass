import type { BaseMessage as SharedBaseMessage } from "@/lib/shared";
import type { SSEEvent } from "./sse-stream-parser";

export interface BaseMessage extends SharedBaseMessage {
  isOptimistic?: boolean;
}

/**
 * TDomainState: complete イベントから構築される typed ドメイン状態
 * TMessage: 会話メッセージ型（BaseMessage 拡張可）
 * TContext: ストリーム中に蓄積される機能固有コンテキスト（pure immutable）
 */
export interface ConversationStreamAdapter<
  TDomainState,
  TMessage extends BaseMessage,
  TContext = void,
> {
  createStreamContext(): TContext;

  fetchStream(answer: string, signal?: AbortSignal): Promise<Response>;

  buildOptimisticMessage(optimisticId: string, content: string): TMessage;

  /**
   * Pure reducer — 副作用禁止。
   * 新しい context を StreamEventResult.context に含めて返す。
   */
  processSSEEvent(
    event: SSEEvent,
    context: TContext,
    accumulated: StreamAccumulator,
  ): StreamEventResult<TDomainState, TContext>;

  getPlaybackText(domainState: TDomainState): string;

  /**
   * Playback 完了後の state 適用。React setter はここだけで呼ぶ。
   */
  commitState(domainState: TDomainState, context: TContext): void;

  /**
   * ストリーム中の副作用（progress 以外の UI 更新）。
   * processSSEEvent が pure なので、副作用が必要な場合はここに集約する。
   */
  onSideEffect?(context: TContext): void;

  onError(error: unknown, originalAnswer: string): void;

  errorMeta: StreamErrorMeta;

  useStreamTimeout?: boolean;
}

export interface StreamAccumulator {
  readonly streamedQuestionText: string;
  readonly startedPlayback: boolean;
}

export interface StreamErrorMeta {
  code: string;
  userMessage: string;
  action: string;
  retryable: boolean;
  logContext: string;
}

export type StreamEventResult<TDomainState, TContext = void> =
  | { action: "noop"; context: TContext }
  | { action: "set_progress"; label: string | null; context: TContext }
  | { action: "accumulate_chunk"; text: string; context: TContext }
  | {
      action: "complete";
      domainState: TDomainState;
      playbackText: string;
      context: TContext;
    }
  | { action: "error"; message: string; context: TContext };
