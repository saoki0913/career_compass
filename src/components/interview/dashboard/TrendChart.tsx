"use client";

/**
 * Phase 2 Stage 8-3: Interview trend chart (SVG).
 *
 * Shows 7 axes * last N sessions as a multi-line chart. The implementation is
 * intentionally a small inline SVG (no recharts) to keep the dependency list
 * short — `recharts` is not present in this repo.
 */

import {
  INTERVIEW_AXES,
  INTERVIEW_AXIS_LABELS,
  type InterviewAxis,
  type TrendPoint,
} from "@/lib/interview/dashboard";

const AXIS_COLORS: Record<InterviewAxis, string> = {
  company_fit: "#2563eb",
  role_fit: "#db2777",
  specificity: "#16a34a",
  logic: "#f59e0b",
  persuasiveness: "#0891b2",
  consistency: "#9333ea",
  credibility: "#dc2626",
};

export type TrendChartProps = {
  points: TrendPoint[];
};

type Session = { session: string; sessionAt: string };

function collectSessions(points: TrendPoint[]): Session[] {
  const seen = new Map<string, Session>();
  for (const point of points) {
    if (!seen.has(point.sessionAt)) {
      seen.set(point.sessionAt, { session: point.session, sessionAt: point.sessionAt });
    }
  }
  return [...seen.values()];
}

function groupByAxis(points: TrendPoint[]): Record<InterviewAxis, Map<string, number>> {
  const result = {} as Record<InterviewAxis, Map<string, number>>;
  for (const axis of INTERVIEW_AXES) {
    result[axis] = new Map();
  }
  for (const point of points) {
    result[point.axis].set(point.sessionAt, point.score);
  }
  return result;
}

export function TrendChart({ points }: TrendChartProps) {
  const sessions = collectSessions(points);
  if (sessions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        まだ最終講評の履歴がないため、推移は表示できません。面接対策を完了すると自動で集計されます。
      </p>
    );
  }

  const grouped = groupByAxis(points);

  const width = 640;
  const height = 260;
  const paddingTop = 16;
  const paddingRight = 16;
  const paddingBottom = 32;
  const paddingLeft = 32;
  const innerWidth = width - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;

  const xStep = sessions.length > 1 ? innerWidth / (sessions.length - 1) : 0;
  const yMax = 5;

  function xFor(sessionIndex: number): number {
    return paddingLeft + sessionIndex * xStep;
  }
  function yFor(score: number): number {
    const clamped = Math.max(0, Math.min(yMax, score));
    return paddingTop + innerHeight - (clamped / yMax) * innerHeight;
  }

  const gridLines = [0, 1, 2, 3, 4, 5];

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block min-w-[640px] w-full"
          role="img"
          aria-label="7 軸スコア推移"
        >
          {gridLines.map((level) => (
            <g key={level}>
              <line
                x1={paddingLeft}
                x2={paddingLeft + innerWidth}
                y1={yFor(level)}
                y2={yFor(level)}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text
                x={paddingLeft - 6}
                y={yFor(level) + 4}
                textAnchor="end"
                fontSize={10}
                fill="#6b7280"
              >
                {level}
              </text>
            </g>
          ))}

          {sessions.map((session, i) => (
            <text
              key={session.sessionAt}
              x={xFor(i)}
              y={height - 10}
              textAnchor="middle"
              fontSize={9}
              fill="#6b7280"
            >
              {session.session.slice(5, 10)}
            </text>
          ))}

          {INTERVIEW_AXES.map((axis) => {
            const axisMap = grouped[axis];
            const segments: string[] = [];
            sessions.forEach((session, i) => {
              const score = axisMap.get(session.sessionAt);
              if (typeof score !== "number") return;
              const x = xFor(i);
              const y = yFor(score);
              segments.push(`${segments.length === 0 ? "M" : "L"}${x},${y}`);
            });
            if (segments.length === 0) return null;
            return (
              <g key={axis}>
                <path
                  d={segments.join(" ")}
                  stroke={AXIS_COLORS[axis]}
                  strokeWidth={1.5}
                  fill="none"
                />
                {sessions.map((session, i) => {
                  const score = axisMap.get(session.sessionAt);
                  if (typeof score !== "number") return null;
                  return (
                    <circle
                      key={`${axis}-${session.sessionAt}`}
                      cx={xFor(i)}
                      cy={yFor(score)}
                      r={2.5}
                      fill={AXIS_COLORS[axis]}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
        {INTERVIEW_AXES.map((axis) => (
          <div key={axis} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-3 rounded-sm"
              style={{ backgroundColor: AXIS_COLORS[axis] }}
              aria-hidden="true"
            />
            <span>{INTERVIEW_AXIS_LABELS[axis]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
