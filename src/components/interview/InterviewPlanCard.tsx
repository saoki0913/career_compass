"use client";

import type { InterviewPlan } from "@/lib/interview/session";

export function InterviewPlanCard({ plan }: { plan: InterviewPlan | null }) {
  if (!plan) return null;
  const priorityTopics = Array.isArray(plan.priorityTopics) ? plan.priorityTopics : [];
  const riskTopics = Array.isArray(plan.riskTopics) ? plan.riskTopics : [];

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-4">
      <div>
        <p className="text-[11px] text-muted-foreground">面接タイプ</p>
        <p className="mt-1 text-sm font-medium text-foreground">{plan.interviewType}</p>
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground">優先論点</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {priorityTopics.map((topic) => (
            <span key={topic} className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] text-foreground/80">
              {topic}
            </span>
          ))}
        </div>
      </div>
      {riskTopics.length > 0 ? (
        <div>
          <p className="text-[11px] text-muted-foreground">注意論点</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {riskTopics.map((topic) => (
              <span key={topic} className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-900">
                {topic}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
