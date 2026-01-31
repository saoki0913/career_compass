/**
 * SearchResultItem Component
 *
 * Individual search result item for companies, documents, and deadlines
 */

"use client";

import Link from "next/link";
import { Building2, FileText, Calendar, Clock, CheckCircle2 } from "lucide-react";
import { SearchHighlight } from "./SearchHighlight";
import type {
  SearchResultCompany,
  SearchResultDocument,
  SearchResultDeadline,
} from "@/lib/search/utils";

interface BaseSearchResultItemProps {
  query: string;
  onClick?: () => void;
}

interface CompanyResultItemProps extends BaseSearchResultItemProps {
  type: "company";
  item: SearchResultCompany;
}

interface DocumentResultItemProps extends BaseSearchResultItemProps {
  type: "document";
  item: SearchResultDocument;
}

interface DeadlineResultItemProps extends BaseSearchResultItemProps {
  type: "deadline";
  item: SearchResultDeadline;
}

type SearchResultItemProps =
  | CompanyResultItemProps
  | DocumentResultItemProps
  | DeadlineResultItemProps;

const STATUS_LABELS: Record<string, string> = {
  interested: "興味あり",
  applied: "応募済",
  interview: "面接中",
  offer: "内定",
  rejected: "不合格",
  withdrawn: "辞退",
};

const STATUS_COLORS: Record<string, string> = {
  interested: "bg-muted text-muted-foreground",
  applied: "bg-info/15 text-info",
  interview: "bg-primary/15 text-primary",
  offer: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  withdrawn: "bg-muted text-muted-foreground/70",
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  es: "ES",
  tips: "Tips",
  company_analysis: "企業分析",
};

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function isOverdue(dateString: string): boolean {
  try {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  } catch {
    return false;
  }
}

export function SearchResultItem(props: SearchResultItemProps) {
  const { type, query, onClick } = props;

  if (type === "company") {
    const { item } = props;
    return (
      <Link
        href={`/companies/${item.id}`}
        onClick={onClick}
        className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-all duration-200 cursor-pointer"
      >
        <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
          <Building2 className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              <SearchHighlight text={item.name} query={query} />
            </span>
            {item.status && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  STATUS_COLORS[item.status] || STATUS_COLORS.interested
                }`}
              >
                {STATUS_LABELS[item.status] || item.status}
              </span>
            )}
          </div>
          {item.industry && (
            <p className="text-xs text-muted-foreground mt-0.5">
              <SearchHighlight text={item.industry} query={query} />
            </p>
          )}
          {item.matchedField === "notes" && item.snippet && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
              <SearchHighlight text={item.snippet} query={query} />
            </p>
          )}
        </div>
      </Link>
    );
  }

  if (type === "document") {
    const { item } = props;
    const href = item.type === "es" && item.companyId
      ? `/es/${item.id}`
      : item.companyId
      ? `/companies/${item.companyId}`
      : `/documents/${item.id}`;

    return (
      <Link
        href={href}
        onClick={onClick}
        className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-all duration-200 cursor-pointer"
      >
        <div className="flex-shrink-0 w-8 h-8 bg-info/10 rounded-lg flex items-center justify-center">
          <FileText className="w-4 h-4 text-info" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              <SearchHighlight text={item.title} query={query} />
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {DOCUMENT_TYPE_LABELS[item.type] || item.type}
            </span>
          </div>
          {item.companyName && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {item.companyName}
            </p>
          )}
          {item.matchedField === "content" && item.snippet && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
              <SearchHighlight text={item.snippet} query={query} />
            </p>
          )}
        </div>
      </Link>
    );
  }

  if (type === "deadline") {
    const { item } = props;
    const overdue = item.dueDate && !item.isCompleted && isOverdue(item.dueDate);

    return (
      <Link
        href={`/companies/${item.companyId}`}
        onClick={onClick}
        className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-all duration-200 cursor-pointer"
      >
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
            item.isCompleted
              ? "bg-success/10"
              : overdue
              ? "bg-destructive/10"
              : "bg-warning/10"
          }`}
        >
          {item.isCompleted ? (
            <CheckCircle2 className="w-4 h-4 text-success" />
          ) : (
            <Calendar
              className={`w-4 h-4 ${
                overdue
                  ? "text-destructive"
                  : "text-warning-foreground"
              }`}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`font-medium text-sm truncate ${
                item.isCompleted ? "line-through text-muted-foreground" : ""
              }`}
            >
              <SearchHighlight text={item.title} query={query} />
            </span>
            {item.dueDate && (
              <span
                className={`text-xs flex items-center gap-1 ${
                  overdue ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                }`}
              >
                <Clock className="w-3 h-3" />
                {formatDate(item.dueDate)}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {item.companyName}
          </p>
          {(item.matchedField === "description" || item.matchedField === "memo") &&
            item.snippet && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                <SearchHighlight text={item.snippet} query={query} />
              </p>
            )}
        </div>
      </Link>
    );
  }

  return null;
}
