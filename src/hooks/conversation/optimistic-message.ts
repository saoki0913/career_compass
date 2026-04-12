export function appendOptimisticUserMessage<T>(
  messages: T[],
  prefix: string,
  factory: (optimisticId: string) => T,
): { optimisticId: string; messages: T[] } {
  const optimisticId = `${prefix}-${Date.now()}`;
  return {
    optimisticId,
    messages: [...messages, factory(optimisticId)],
  };
}

export function rollbackOptimisticMessageById<T extends { id: string }>(
  messages: T[],
  optimisticId: string,
): T[] {
  return messages.filter((message) => message.id !== optimisticId);
}
