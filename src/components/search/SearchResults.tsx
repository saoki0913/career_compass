/**
 * SearchResults Component
 *
 * Full search results display with grouped sections
 */

"use client";

import { Building2, FileText, Calendar, Loader2 } from "lucide-react";
import { SearchResultItem } from "./SearchResultItem";
import type { SearchResponse } from "@/lib/search/utils";
import Link from "next/link";

interface SearchResultsProps {
  results: SearchResponse | null;
  query: string;
  isLoading: boolean;
  error: string | null;
}

export function SearchResults({
  results,
  query,
  isLoading,
  error,
}: SearchResultsProps) {
  if (isLoading && !results) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground mt-4">検索中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-destructive">{error}</p>
          <p className="text-muted-foreground text-sm mt-2">
            再度お試しください
          </p>
        </div>
      </div>
    );
  }

  if (!results || results.counts.total === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-lg font-medium">
            「{query}」に一致する結果がありません
          </p>
          <p className="text-muted-foreground text-sm mt-2">
            別のキーワードで検索してみてください
          </p>
        </div>
      </div>
    );
  }

  const { companies, documents, deadlines } = results.results;

  return (
    <div className="space-y-8">
      {/* Summary */}
      <div className="text-sm text-muted-foreground">
        「{query}」の検索結果 - {results.counts.total}件
      </div>

      {/* Companies Section */}
      {companies.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">企業</h2>
            <span className="text-sm text-muted-foreground">
              ({companies.length}件)
            </span>
          </div>
          <div className="bg-card rounded-xl border divide-y divide-border">
            {companies.map((company) => (
              <SearchResultItem
                key={company.id}
                type="company"
                item={company}
                query={query}
              />
            ))}
          </div>
          {companies.length >= 5 && (
            <div className="mt-2 text-center">
              <Link
                href={`/companies?search=${encodeURIComponent(query)}`}
                className="text-sm text-primary hover:underline"
              >
                企業一覧でもっと見る
              </Link>
            </div>
          )}
        </section>
      )}

      {/* Documents Section */}
      {documents.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-lg font-semibold">ES・ドキュメント</h2>
            <span className="text-sm text-muted-foreground">
              ({documents.length}件)
            </span>
          </div>
          <div className="bg-card rounded-xl border divide-y divide-border">
            {documents.map((doc) => (
              <SearchResultItem
                key={doc.id}
                type="document"
                item={doc}
                query={query}
              />
            ))}
          </div>
          {documents.length >= 5 && (
            <div className="mt-2 text-center">
              <Link
                href={`/es?search=${encodeURIComponent(query)}`}
                className="text-sm text-primary hover:underline"
              >
                ES一覧でもっと見る
              </Link>
            </div>
          )}
        </section>
      )}

      {/* Deadlines Section */}
      {deadlines.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
            <h2 className="text-lg font-semibold">締切</h2>
            <span className="text-sm text-muted-foreground">
              ({deadlines.length}件)
            </span>
          </div>
          <div className="bg-card rounded-xl border divide-y divide-border">
            {deadlines.map((deadline) => (
              <SearchResultItem
                key={deadline.id}
                type="deadline"
                item={deadline}
                query={query}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
