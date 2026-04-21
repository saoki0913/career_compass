"use client";

/**
 * Phase 2 Stage 8-3: Company x 7-axis heatmap.
 * Cell color maps 0..5 to a red -> amber -> green scale.
 */

import {
  INTERVIEW_AXES,
  INTERVIEW_AXIS_LABELS,
  type CompanyHeatmapCell,
} from "@/lib/interview/dashboard";

function cellColor(avgScore: number, sampleSize: number): { background: string; color: string } {
  if (sampleSize === 0) {
    return { background: "#f3f4f6", color: "#9ca3af" };
  }
  // clamp 0..5
  const clamped = Math.max(0, Math.min(5, avgScore));
  // 0 -> rose-200, 2.5 -> amber-200, 5 -> emerald-300
  if (clamped < 1.5) return { background: "#fecaca", color: "#7f1d1d" };
  if (clamped < 2.5) return { background: "#fed7aa", color: "#7c2d12" };
  if (clamped < 3.5) return { background: "#fef08a", color: "#713f12" };
  if (clamped < 4.5) return { background: "#bbf7d0", color: "#14532d" };
  return { background: "#86efac", color: "#14532d" };
}

export type CompanyHeatmapProps = {
  cells: CompanyHeatmapCell[];
};

function groupByCompany(cells: CompanyHeatmapCell[]): { company: string; cells: CompanyHeatmapCell[] }[] {
  const map = new Map<string, CompanyHeatmapCell[]>();
  for (const cell of cells) {
    const list = map.get(cell.company) ?? [];
    list.push(cell);
    map.set(cell.company, list);
  }
  return [...map.entries()].map(([company, cellsForCompany]) => ({
    company,
    cells: cellsForCompany,
  }));
}

export function CompanyHeatmap({ cells }: CompanyHeatmapProps) {
  const rows = groupByCompany(cells);
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">まだ企業別の集計データがありません。</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-background px-2 py-1 text-left font-medium text-muted-foreground">
              企業
            </th>
            {INTERVIEW_AXES.map((axis) => (
              <th key={axis} className="px-2 py-1 text-center font-medium text-muted-foreground">
                {INTERVIEW_AXIS_LABELS[axis]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ company, cells: cellsForCompany }) => (
            <tr key={company}>
              <th
                scope="row"
                className="sticky left-0 bg-background px-2 py-1 text-left font-medium text-foreground"
              >
                {company}
              </th>
              {INTERVIEW_AXES.map((axis) => {
                const cell = cellsForCompany.find((c) => c.axis === axis);
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
