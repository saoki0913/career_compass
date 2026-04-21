"use client";

/**
 * Phase 2 Stage 8-3: Format x 7-axis heatmap.
 * Shows all 4 interview formats (standard_behavioral / case / technical /
 * life_history) even if some have zero samples, to keep the UI grid stable.
 */

import {
  INTERVIEW_AXES,
  INTERVIEW_AXIS_LABELS,
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_FORMATS,
  type FormatHeatmapCell,
} from "@/lib/interview/dashboard";

function cellColor(avgScore: number, sampleSize: number): { background: string; color: string } {
  if (sampleSize === 0) {
    return { background: "#f3f4f6", color: "#9ca3af" };
  }
  const clamped = Math.max(0, Math.min(5, avgScore));
  if (clamped < 1.5) return { background: "#fecaca", color: "#7f1d1d" };
  if (clamped < 2.5) return { background: "#fed7aa", color: "#7c2d12" };
  if (clamped < 3.5) return { background: "#fef08a", color: "#713f12" };
  if (clamped < 4.5) return { background: "#bbf7d0", color: "#14532d" };
  return { background: "#86efac", color: "#14532d" };
}

export type FormatHeatmapProps = {
  cells: FormatHeatmapCell[];
};

export function FormatHeatmap({ cells }: FormatHeatmapProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-background px-2 py-1 text-left font-medium text-muted-foreground">
              面接方式
            </th>
            {INTERVIEW_AXES.map((axis) => (
              <th key={axis} className="px-2 py-1 text-center font-medium text-muted-foreground">
                {INTERVIEW_AXIS_LABELS[axis]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {INTERVIEW_FORMATS.map((format) => {
            const row = cells.filter((cell) => cell.format === format);
            return (
              <tr key={format}>
                <th
                  scope="row"
                  className="sticky left-0 bg-background px-2 py-1 text-left font-medium text-foreground"
                >
                  {INTERVIEW_FORMAT_LABELS[format]}
                </th>
                {INTERVIEW_AXES.map((axis) => {
                  const cell = row.find((c) => c.axis === axis);
                  const score = cell?.avgScore ?? 0;
                  const sampleSize = cell?.sampleSize ?? 0;
                  const { background, color } = cellColor(score, sampleSize);
                  return (
                    <td
                      key={axis}
                      className="px-2 py-1 text-center rounded"
                      style={{ background, color }}
                      title={`${INTERVIEW_AXIS_LABELS[axis]} — 平均 ${score.toFixed(2)} / サンプル ${sampleSize}`}
                    >
                      {sampleSize === 0 ? "—" : score.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
