type TimingEntry = {
  name: string;
  durationMs: number;
};

function formatDuration(durationMs: number): string {
  return durationMs.toFixed(1);
}

export function createServerTimingRecorder() {
  const entries: TimingEntry[] = [];

  return {
    async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const startedAt = performance.now();
      try {
        return await fn();
      } finally {
        entries.push({
          name,
          durationMs: performance.now() - startedAt,
        });
      }
    },
    apply(response: Response): Response {
      if (entries.length === 0) {
        return response;
      }

      response.headers.set(
        "Server-Timing",
        entries.map((entry) => `${entry.name};dur=${formatDuration(entry.durationMs)}`).join(", ")
      );
      return response;
    },
  };
}
