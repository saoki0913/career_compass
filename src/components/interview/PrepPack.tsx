"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type PrepPackSections = {
  likelyTopics: string[];
  mustCoverTopics: string[];
  motivationConnections: string[];
};

export type PrepPackProps = {
  sections: PrepPackSections;
  companyName?: string | null;
};

type Section = {
  id: keyof PrepPackSections;
  title: string;
  emptyMessage: string;
};

const SECTIONS: Section[] = [
  {
    id: "likelyTopics",
    title: "この会社で聞かれやすい論点",
    emptyMessage: "関連材料がまだ少ないため、企業情報を軸に面接を進めます。",
  },
  {
    id: "mustCoverTopics",
    title: "必ず触れるべき固有論点",
    emptyMessage: "面接計画の生成後に自動で反映されます。",
  },
  {
    id: "motivationConnections",
    title: "ES・志望動機との接続",
    emptyMessage: "志望動機データが揃うと、接続ポイントが自動で表示されます。",
  },
];

function nonEmpty(items: string[]): string[] {
  return items.filter((item) => typeof item === "string" && item.trim().length > 0).slice(0, 6);
}

export function PrepPack({ sections, companyName }: PrepPackProps) {
  const allEmpty = SECTIONS.every((section) => nonEmpty(sections[section.id]).length === 0);

  return (
    <Card className="border-border/60 bg-muted/10">
      <CardHeader className="py-4">
        <CardTitle className="text-base">
          準備カード{companyName ? ` — ${companyName}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {allEmpty ? (
          <div className="rounded-xl border border-border/60 bg-background px-4 py-3 text-sm text-muted-foreground">
            関連情報がまだ揃っていないため、準備カードは空の状態です。面接計画の生成後に自動で表示されます。
          </div>
        ) : (
          <div className="space-y-1">
            {SECTIONS.map((section) => {
              const items = nonEmpty(sections[section.id]);
              return (
                <details key={section.id} className="group rounded-xl border border-border/60 bg-background">
                  <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-foreground select-none [&::-webkit-details-marker]:hidden">
                    <span>{section.title}</span>
                    <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
                      {items.length > 0 ? items.length : "—"}
                    </span>
                  </summary>
                  <div className="border-t border-border/40 px-4 py-3">
                    {items.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{section.emptyMessage}</p>
                    ) : (
                      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
                        {items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
