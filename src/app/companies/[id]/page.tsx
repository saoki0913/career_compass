"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getDeviceToken } from "@/lib/auth/device-token";
import {
  CompanyStatus,
  getStatusConfig,
} from "@/lib/constants/status";
import {
  useCompanyDeadlines,
  Deadline,
  CreateDeadlineInput,
  UpdateDeadlineInput,
  DEADLINE_TYPE_LABELS,
} from "@/hooks/useCompanyDeadlines";
import {
  useApplications,
  Application,
  APPLICATION_TYPE_LABELS,
  APPLICATION_STATUS_LABELS,
  CreateApplicationInput,
  UpdateApplicationInput,
} from "@/hooks/useApplications";
import { DeadlineModal } from "@/components/deadlines/DeadlineModal";
import { ApplicationModal } from "@/components/applications/ApplicationModal";
import { FetchInfoButton } from "@/components/companies/FetchInfoButton";
import { DeadlineApprovalModal } from "@/components/companies/DeadlineApprovalModal";
import { CorporateInfoSection } from "@/components/companies/CorporateInfoSection";
import { CompanyEditModal, UpdateCompanyData } from "@/components/companies/CompanyEditModal";
import { OperationLockProvider } from "@/hooks/useOperationLock";
import { NavigationGuard } from "@/components/ui/NavigationGuard";

interface Company {
  id: string;
  name: string;
  industry: string | null;
  recruitmentUrl: string | null;
  corporateUrl: string | null;
  mypageUrl: string | null;
  mypageLoginId: string | null;
  hasCredentials: boolean;
  notes: string | null;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
}

interface ESDocument {
  id: string;
  title: string;
  type: string;
  status: string;
  updatedAt: string;
}


// Icons
const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
    />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
    />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
);

const BriefcaseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const FileTextIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const DocumentIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const SparklesIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const AlertCircleIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const LoadingSpinner = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

// Password display with on-demand fetch and show/hide toggle
function PasswordDisplay({ companyId }: { companyId: string }) {
  const [password, setPassword] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPassword = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/credentials`, {
        headers: buildHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch credentials");
      const data = await res.json();
      setPassword(data.mypagePassword);
      setFetched(true);
    } catch {
      setError("パスワードの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [companyId, fetched]);

  if (!fetched && !loading && !error) {
    return (
      <button
        type="button"
        onClick={fetchPassword}
        className="flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        PWを表示
      </button>
    );
  }

  if (loading) {
    return <span className="text-xs text-muted-foreground">読み込み中...</span>;
  }

  if (error) {
    return <span className="text-xs text-destructive">{error}</span>;
  }

  if (!password) {
    return <span className="text-xs text-muted-foreground">PW: 未設定</span>;
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">PW:</span>
      <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
        {showPassword ? password : "••••••••"}
      </code>
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="p-0.5 text-muted-foreground hover:text-foreground"
        title={showPassword ? "隠す" : "表示"}
      >
        {showPassword ? (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(password)}
        className="p-0.5 text-muted-foreground hover:text-foreground"
        title="コピー"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>
    </div>
  );
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof window !== "undefined") {
    try {
      const deviceToken = getDeviceToken();
      if (deviceToken) {
        headers["x-device-token"] = deviceToken;
      }
    } catch {
      // Ignore errors
    }
  }
  return headers;
}

export default function CompanyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Company edit modal state
  const [showEditModal, setShowEditModal] = useState(false);

  // Deadline modal state
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState<Deadline | undefined>();

  // Application modal state
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [editingApplication, setEditingApplication] = useState<Application | undefined>();

  // Deadline approval modal state
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  // ES documents state
  const [esDocuments, setEsDocuments] = useState<ESDocument[]>([]);
  const [isLoadingES, setIsLoadingES] = useState(true);

  // Use the applications hook
  const {
    applications,
    isLoading: isLoadingApplications,
    createApplication,
    updateApplication,
    deleteApplication,
  } = useApplications(companyId);

  // Use the deadlines hook
  const {
    deadlines,
    isLoading: isLoadingDeadlines,
    refresh: refreshDeadlines,
    createDeadline,
    updateDeadline,
    deleteDeadline,
    toggleComplete,
    confirmDeadline,
  } = useCompanyDeadlines(companyId);

  const fetchCompany = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/companies/${companyId}`, {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 404) {
          setError("企業が見つかりません");
          return;
        }
        throw new Error("Failed to fetch company");
      }

      const data = await response.json();
      setCompany(data.company);
    } catch (err) {
      setError(err instanceof Error ? err.message : "企業情報の取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  // Fetch ES documents linked to this company
  const fetchESDocuments = useCallback(async () => {
    try {
      setIsLoadingES(true);
      const response = await fetch(`/api/documents?companyId=${companyId}&type=es`, {
        headers: buildHeaders(),
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setEsDocuments(data.documents || []);
      }
    } catch {
      // Ignore errors - ES list is non-critical
    } finally {
      setIsLoadingES(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchCompany();
    fetchESDocuments();
  }, [fetchCompany, fetchESDocuments]);

  // Handle company update from modal
  const handleUpdateCompany = async (data: UpdateCompanyData) => {
    const response = await fetch(`/api/companies/${companyId}`, {
      method: "PUT",
      headers: buildHeaders(),
      credentials: "include",
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error("Failed to update company");
    }

    const result = await response.json();
    setCompany(result.company);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/companies/${companyId}`, {
        method: "DELETE",
        headers: buildHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to delete company");
      }

      router.push("/companies");
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-32 bg-muted rounded-lg" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-64 bg-muted rounded-2xl" />
              <div className="h-64 bg-muted rounded-2xl" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error && !company) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Card className="border-red-200 bg-red-50/50 max-w-xl mx-auto">
            <CardContent className="py-6 text-center">
              <h2 className="text-lg font-semibold text-red-800 mb-2">{error}</h2>
              <Button variant="outline" asChild className="mt-4">
                <Link href="/companies">企業一覧に戻る</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!company) return null;

  const statusConfigData = getStatusConfig(company.status);

  return (
    <OperationLockProvider>
    <NavigationGuard />
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Back button */}
        <Link
          href="/companies"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeftIcon />
          企業一覧に戻る
        </Link>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 mb-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Company Header with Quick Actions */}
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4 pb-4 border-b border-border/50">
          {/* Left: Company Info */}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">{company.name}</h1>
              {company.recruitmentUrl && (
                <a
                  href={company.recruitmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLinkIcon />
                  採用ページ
                </a>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium",
                  statusConfigData.bgColor,
                  statusConfigData.color
                )}
              >
                {statusConfigData.label}
              </span>
              {company.industry && (
                <>
                  <span className="text-sm text-muted-foreground">•</span>
                  <span className="text-sm text-muted-foreground">{company.industry}</span>
                </>
              )}
              {company.corporateUrl && (
                <>
                  <span className="text-sm text-muted-foreground">•</span>
                  <a
                    href={company.corporateUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLinkIcon />
                    企業HP
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Right: Quick Actions + Edit/Delete */}
          <div className="flex flex-col gap-1.5 items-end">
            <div className="flex items-center gap-2">
              <Link
                href={`/companies/${company.id}/motivation`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors text-sm font-medium"
              >
                <SparklesIcon />
                志望動機
              </Link>
              <Link
                href={`/es?companyId=${company.id}`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm font-medium"
              >
                <FileTextIcon />
                ES作成
              </Link>
              <FetchInfoButton
                companyId={company.id}
                companyName={company.name}
                hasRecruitmentUrl={!!company.recruitmentUrl}
                onSuccess={refreshDeadlines}
              />
              <div className="flex gap-0.5 ml-1 pl-2 border-l border-border/50">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEditModal(true)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                >
                  <EditIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <TrashIcon />
                </Button>
              </div>
            </div>
            {/* マイページ情報（コンパクト表示） */}
            {(company.mypageUrl || company.mypageLoginId || company.hasCredentials) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {company.mypageUrl && (
                  <a
                    href={company.mypageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLinkIcon />
                    マイページ
                  </a>
                )}
                {company.mypageLoginId && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">ID:</span>
                    <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">{company.mypageLoginId}</code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(company.mypageLoginId || "")}
                      className="p-0.5 text-muted-foreground hover:text-foreground"
                      title="コピー"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                )}
                {company.hasCredentials && (
                  <PasswordDisplay companyId={company.id} />
                )}
              </div>
            )}
          </div>
        </div>

        {/* 2-column grid: Deadlines + Applications */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Left column: Deadlines */}
          <Card className={cn(
            "border-border/50",
            (() => {
              const now = new Date();
              const hasOverdue = deadlines.some(d => {
                const dueDate = new Date(d.dueDate);
                return !d.completedAt && dueDate < now;
              });
              const hasThisWeek = deadlines.some(d => {
                const dueDate = new Date(d.dueDate);
                const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                return !d.completedAt && dueDate >= now && daysLeft <= 7;
              });
              if (hasOverdue) return "bg-red-50/30 border-red-200";
              if (hasThisWeek) return "bg-amber-50/30 border-amber-200/50";
              return "";
            })()
          )}>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarIcon />
              締切・予定
              {deadlines.filter(d => !d.isConfirmed).length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  {deadlines.filter(d => !d.isConfirmed).length}件要確認
                </span>
              )}
              {(() => {
                const now = new Date();
                const thisWeekCount = deadlines.filter(d => {
                  const dueDate = new Date(d.dueDate);
                  const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  return !d.completedAt && dueDate >= now && daysLeft <= 7;
                }).length;
                return thisWeekCount > 0 ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                    今週中に{thisWeekCount}件
                  </span>
                ) : null;
              })()}
            </CardTitle>
            <div className="flex gap-2">
              {deadlines.filter(d => !d.isConfirmed).length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowApprovalModal(true)}
                  className="text-amber-700 border-amber-300 hover:bg-amber-50"
                >
                  一括承認
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingDeadline(undefined);
                  setShowDeadlineModal(true);
                }}
              >
                追加
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoadingDeadlines ? (
              <div className="flex items-center justify-center py-6">
                <LoadingSpinner />
              </div>
            ) : deadlines.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CalendarIcon />
                <p className="text-sm mt-2">まだ締切が登録されていません</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setEditingDeadline(undefined);
                    setShowDeadlineModal(true);
                  }}
                >
                  締切を追加する
                </Button>
              </div>
            ) : (() => {
              // Group deadlines by urgency
              const now = new Date();
              const overdueDeadlines = deadlines.filter(d => {
                const dueDate = new Date(d.dueDate);
                return !d.completedAt && dueDate < now;
              });
              const thisWeekDeadlines = deadlines.filter(d => {
                const dueDate = new Date(d.dueDate);
                const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                return !d.completedAt && dueDate >= now && daysLeft <= 7;
              });
              const futureDeadlines = deadlines.filter(d => {
                const dueDate = new Date(d.dueDate);
                const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                return !d.completedAt && daysLeft > 7;
              });
              const completedDeadlines = deadlines.filter(d => d.completedAt);

              const renderDeadlineItem = (deadline: Deadline) => {
                const isCompleted = !!deadline.completedAt;
                const dueDate = new Date(deadline.dueDate);
                const isOverdue = !isCompleted && dueDate < now;
                const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                const confidenceConfig = {
                  high: { bg: "bg-emerald-100", text: "text-emerald-700", label: "高" },
                  medium: { bg: "bg-amber-100", text: "text-amber-700", label: "中" },
                  low: { bg: "bg-red-100", text: "text-red-700", label: "低" },
                };
                const confidenceStyle = deadline.confidence ? confidenceConfig[deadline.confidence] : null;

                return (
                  <div
                    key={deadline.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg transition-colors",
                      isCompleted
                        ? "bg-muted/30 opacity-60"
                        : isOverdue
                        ? "bg-red-50/80"
                        : !deadline.isConfirmed
                        ? "bg-amber-50/50"
                        : "bg-muted/30"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleComplete(deadline.id)}
                      className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer",
                        isCompleted
                          ? "bg-primary border-primary text-primary-foreground"
                          : isOverdue
                          ? "border-red-400 hover:border-red-500"
                          : "border-muted-foreground/40 hover:border-primary"
                      )}
                    >
                      {isCompleted && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {DEADLINE_TYPE_LABELS[deadline.type] || deadline.type}
                        </span>
                        {!deadline.isConfirmed && (
                          <button
                            type="button"
                            onClick={() => confirmDeadline(deadline.id)}
                            className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition-colors cursor-pointer"
                          >
                            要確認
                          </button>
                        )}
                        {confidenceStyle && !deadline.isConfirmed && (
                          <span className={cn("text-xs px-2 py-0.5 rounded-full", confidenceStyle.bg, confidenceStyle.text)}>
                            信頼度: {confidenceStyle.label}
                          </span>
                        )}
                      </div>
                      <p className={cn("font-medium text-sm mt-1", isCompleted && "line-through text-muted-foreground")}>{deadline.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className={cn("text-xs", isOverdue ? "text-red-600 font-medium" : "text-muted-foreground")}>
                          {dueDate.toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" })}
                          {!isCompleted && (
                            <span className="ml-1">
                              {isOverdue
                                ? "（期限切れ）"
                                : daysLeft === 0
                                ? "（今日）"
                                : daysLeft === 1
                                ? "（明日）"
                                : `（${daysLeft}日後）`}
                            </span>
                          )}
                        </p>
                        {deadline.sourceUrl && !deadline.isConfirmed && (
                          <a
                            href={deadline.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ExternalLinkIcon />
                            取得元
                          </a>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingDeadline(deadline);
                        setShowDeadlineModal(true);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    >
                      <EditIcon />
                    </button>
                  </div>
                );
              };

              // Combine urgent deadlines (overdue + this week)
              const urgentDeadlines = [...overdueDeadlines, ...thisWeekDeadlines];

              return (
                <div className="space-y-2 max-h-[220px] overflow-y-auto">
                  {/* Urgent deadlines (overdue + this week) */}
                  {urgentDeadlines.length > 0 ? (
                    <div className="space-y-1.5">
                      {urgentDeadlines.slice(0, 4).map(renderDeadlineItem)}
                      {urgentDeadlines.length > 4 && (
                        <p className="text-xs text-muted-foreground text-center py-1">
                          他 {urgentDeadlines.length - 4} 件の今週締切
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">今週の締切はありません</p>
                  )}

                  {/* Future + Completed (collapsed) */}
                  {(futureDeadlines.length > 0 || completedDeadlines.length > 0) && (
                    <div className="pt-2 border-t border-border/30 flex items-center gap-4 text-xs text-muted-foreground">
                      {futureDeadlines.length > 0 && (
                        <span>今後: {futureDeadlines.length}件</span>
                      )}
                      {completedDeadlines.length > 0 && (
                        <span>完了: {completedDeadlines.length}件</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
          </Card>

          {/* Right column: Applications */}
          <Card className="border-border/50">
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BriefcaseIcon />
                  応募枠
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingApplication(undefined);
                    setShowApplicationModal(true);
                  }}
                >
                  追加
                </Button>
              </CardHeader>
              <CardContent className="pt-0">
                {isLoadingApplications ? (
                  <div className="flex items-center justify-center py-6">
                    <LoadingSpinner />
                  </div>
                ) : applications.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                      <BriefcaseIcon />
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">まだ応募枠が登録されていません</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingApplication(undefined);
                        setShowApplicationModal(true);
                      }}
                    >
                      応募枠を追加
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto">
                    {applications.map((app) => {
                      const statusColors = {
                        active: { bg: "bg-blue-100", text: "text-blue-700" },
                        completed: { bg: "bg-emerald-100", text: "text-emerald-700" },
                        withdrawn: { bg: "bg-gray-100", text: "text-gray-600" },
                      };
                      const colors = statusColors[app.status];
                      const nearestDate = app.nearestDeadline ? new Date(app.nearestDeadline) : null;
                      const now = new Date();
                      const daysUntilDeadline = nearestDate
                        ? Math.ceil((nearestDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                        : null;

                      return (
                        <button
                          key={app.id}
                          type="button"
                          onClick={() => {
                            setEditingApplication(app);
                            setShowApplicationModal(true);
                          }}
                          className="w-full flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left cursor-pointer"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                {APPLICATION_TYPE_LABELS[app.type]}
                              </span>
                              <span className={cn("text-xs px-2 py-0.5 rounded-full", colors.bg, colors.text)}>
                                {APPLICATION_STATUS_LABELS[app.status]}
                              </span>
                            </div>
                            <p className="font-medium text-sm mt-1 truncate">{app.name}</p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span>締切 {app.deadlineCount}件</span>
                              {nearestDate && (
                                <span
                                  className={cn(
                                    daysUntilDeadline !== null && daysUntilDeadline <= 3
                                      ? "text-red-600"
                                      : daysUntilDeadline !== null && daysUntilDeadline <= 7
                                      ? "text-amber-600"
                                      : ""
                                  )}
                                >
                                  次: {nearestDate.toLocaleDateString("ja-JP", { month: "short", day: "numeric" })}
                                  {daysUntilDeadline !== null && daysUntilDeadline >= 0 && (
                                    <span className="ml-1">
                                      ({daysUntilDeadline === 0 ? "今日" : `${daysUntilDeadline}日後`})
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRightIcon />
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
          </Card>
        </div>

        {/* Full-width bottom section: Corporate Info DB + ES Documents */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Corporate Info (RAG) section */}
          <CorporateInfoSection
            companyId={company.id}
            companyName={company.name}
            onUpdate={fetchCompany}
          />

          {/* Linked ES Documents section */}
          <Card className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-base flex items-center gap-2">
                <DocumentIcon />
                この企業のES
                {esDocuments.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {esDocuments.length}
                  </span>
                )}
              </CardTitle>
              <Link
                href={`/es?companyId=${company.id}`}
                className="text-xs text-primary hover:underline"
              >
                新規作成
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoadingES ? (
                <div className="flex items-center justify-center py-6">
                  <LoadingSpinner />
                </div>
              ) : esDocuments.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <p className="text-sm">まだESが作成されていません</p>
                  <Link
                    href={`/es?companyId=${company.id}`}
                    className="inline-flex items-center gap-1 mt-2 text-sm text-primary hover:underline"
                  >
                    <FileTextIcon />
                    ESを作成する
                  </Link>
                </div>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {esDocuments.map((doc) => {
                    const statusConfig = {
                      draft: { bg: "bg-gray-100", text: "text-gray-600", label: "下書き" },
                      published: { bg: "bg-emerald-100", text: "text-emerald-700", label: "提出済み" },
                      in_review: { bg: "bg-amber-100", text: "text-amber-700", label: "レビュー中" },
                      completed: { bg: "bg-emerald-100", text: "text-emerald-700", label: "完了" },
                    };
                    const status = statusConfig[doc.status as keyof typeof statusConfig] || statusConfig.draft;
                    const updatedDate = new Date(doc.updatedAt);

                    return (
                      <Link
                        key={doc.id}
                        href={`/es/${doc.id}`}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
                      >
                        <FileTextIcon />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                            {doc.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={cn("text-xs px-2 py-0.5 rounded-full", status.bg, status.text)}>
                              {status.label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {updatedDate.toLocaleDateString("ja-JP", { month: "short", day: "numeric" })}
                            </span>
                          </div>
                        </div>
                        <ChevronRightIcon />
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Application modal */}
        <ApplicationModal
          isOpen={showApplicationModal}
          application={editingApplication}
          onClose={() => {
            setShowApplicationModal(false);
            setEditingApplication(undefined);
          }}
          onSubmit={async (data) => {
            if (editingApplication) {
              await updateApplication(editingApplication.id, data as UpdateApplicationInput);
            } else {
              await createApplication(data as CreateApplicationInput);
            }
          }}
          onDelete={
            editingApplication
              ? async () => {
                  await deleteApplication(editingApplication.id);
                }
              : undefined
          }
        />

        {/* Deadline modal */}
        <DeadlineModal
          isOpen={showDeadlineModal}
          deadline={editingDeadline}
          onClose={() => {
            setShowDeadlineModal(false);
            setEditingDeadline(undefined);
          }}
          onSubmit={async (data) => {
            if (editingDeadline) {
              await updateDeadline(editingDeadline.id, data as UpdateDeadlineInput);
            } else {
              await createDeadline(data as CreateDeadlineInput);
            }
          }}
          onDelete={editingDeadline ? async () => {
            await deleteDeadline(editingDeadline.id);
          } : undefined}
        />

        {/* Deadline Approval Modal */}
        <DeadlineApprovalModal
          isOpen={showApprovalModal}
          deadlines={deadlines}
          onClose={() => setShowApprovalModal(false)}
          onConfirm={async (deadlineIds) => {
            // Confirm all selected deadlines
            await Promise.all(deadlineIds.map((id) => confirmDeadline(id)));
          }}
        />

        {/* Company Edit Modal */}
        {company && (
          <CompanyEditModal
            isOpen={showEditModal}
            company={company}
            onClose={() => setShowEditModal(false)}
            onSave={handleUpdateCompany}
          />
        )}

        {/* Delete confirmation dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="max-w-md w-full">
              <CardHeader>
                <CardTitle className="text-lg">企業を削除しますか？</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-6">
                  「{company.name}」を削除すると、関連する締切や選考情報もすべて削除されます。この操作は取り消せません。
                </p>
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                  >
                    キャンセル
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <>
                        <LoadingSpinner />
                        <span className="ml-2">削除中...</span>
                      </>
                    ) : (
                      "削除する"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
    </OperationLockProvider>
  );
}
