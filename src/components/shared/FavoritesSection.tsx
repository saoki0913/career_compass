"use client";

import { Star } from "lucide-react";

interface FavoritesSectionProps {
  count: number;
  children: React.ReactNode;
}

export function FavoritesSection({ count, children }: FavoritesSectionProps) {
  if (count === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
        <h2 className="text-lg font-semibold text-foreground">お気に入り</h2>
        <span className="text-sm text-muted-foreground">({count})</span>
      </div>
      <div className="p-4 -m-4 mb-4 rounded-xl bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-950/20 dark:to-transparent">
        {children}
      </div>
    </section>
  );
}
