"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { DashboardHeader } from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getDeviceToken } from "@/lib/auth/device-token";
import {
  CompanyStatus,
  GROUPED_STATUSES,
  CATEGORY_LABELS,
  getStatusConfig,
  getStatusLabel,
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

interface Company {
  id: string;
  name: string;
  industry: string | null;
  recruitmentUrl: string | null;
  corporateUrl: string | null;
  notes: string | null;
  status: CompanyStatus;
  createdAt: string;
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
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Deadline modal state
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState<Deadline | undefined>();

  // Application modal state
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [editingApplication, setEditingApplication] = useState<Application | undefined>();

  // Deadline approval modal state
  const [showApprovalModal, setShowApprovalModal] = useState(false);

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


  // Edit form state
  const [editName, setEditName] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editRecruitmentUrl, setEditRecruitmentUrl] = useState("");
  const [editCorporateUrl, setEditCorporateUrl] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<CompanyStatus>("inbox");

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

      // Initialize edit form
      setEditName(data.company.name);
      setEditIndustry(data.company.industry || "");
      setEditRecruitmentUrl(data.company.recruitmentUrl || "");
      setEditCorporateUrl(data.company.corporateUrl || "");
      setEditNotes(data.company.notes || "");
      setEditStatus(data.company.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "企業情報の取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  const handleSave = async () => {
    if (!editName.trim()) {
      setError("企業名を入力してください");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/companies/${companyId}`, {
        method: "PUT",
        headers: buildHeaders(),
        credentials: "include",
        body: JSON.stringify({
          name: editName.trim(),
          industry: editIndustry.trim() || null,
          recruitmentUrl: editRecruitmentUrl.trim() || null,
          corporateUrl: editCorporateUrl.trim() || null,
          notes: editNotes.trim() || null,
          status: editStatus,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update company");
      }

      const data = await response.json();
      setCompany(data.company);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
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

  const cancelEdit = () => {
    if (company) {
      setEditName(company.name);
      setEditIndustry(company.industry || "");
      setEditRecruitmentUrl(company.recruitmentUrl || "");
      setEditCorporateUrl(company.corporateUrl || "");
      setEditNotes(company.notes || "");
      setEditStatus(company.status);
    }
    setIsEditing(false);
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

        {/* 2-column grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left column: Company info + Corporate RAG */}
          <div className="space-y-4">
            {/* Company info card */}
            <Card className="border-border/50">
              <CardHeader className="flex flex-row items-start justify-between py-3">
                <div className="flex-1">
                  {isEditing ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="text-lg font-bold h-auto py-1"
                    />
                  ) : (
                    <CardTitle className="text-lg">{company.name}</CardTitle>
                  )}
                  {!isEditing && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium",
                          statusConfigData.bgColor,
                          statusConfigData.color
                        )}
                      >
                        {statusConfigData.label}
                      </span>
                      {company.industry && (
                        <span className="text-sm text-muted-foreground">{company.industry}</span>
                      )}
                    </div>
                  )}
                </div>
                {!isEditing && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                      <EditIcon />
                      <span className="ml-1">編集</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                )}
              </CardHeader>

              <CardContent className="space-y-3 pt-0">
                {isEditing ? (
                  // Edit form
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="industry" className="text-xs">業界</Label>
                      <Input
                        id="industry"
                        value={editIndustry}
                        onChange={(e) => setEditIndustry(e.target.value)}
                        placeholder="IT・通信"
                        className="h-9"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="recruitmentUrl" className="text-xs">採用ページURL</Label>
                        <Input
                          id="recruitmentUrl"
                          type="url"
                          value={editRecruitmentUrl}
                          onChange={(e) => setEditRecruitmentUrl(e.target.value)}
                          placeholder="https://"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="corporateUrl" className="text-xs">企業HP URL</Label>
                        <Input
                          id="corporateUrl"
                          type="url"
                          value={editCorporateUrl}
                          onChange={(e) => setEditCorporateUrl(e.target.value)}
                          placeholder="https://"
                          className="h-9"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">選考ステータス</Label>
                      <Select value={editStatus} onValueChange={(v) => setEditStatus(v as CompanyStatus)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="選択してください">
                            {getStatusLabel(editStatus)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel className="text-xs text-muted-foreground font-normal">
                              {CATEGORY_LABELS.not_started}
                            </SelectLabel>
                            {GROUPED_STATUSES.not_started.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel className="text-xs text-muted-foreground font-normal">
                              {CATEGORY_LABELS.in_progress}
                            </SelectLabel>
                            {GROUPED_STATUSES.in_progress.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectGroup>
                            <SelectLabel className="text-xs text-muted-foreground font-normal">
                              {CATEGORY_LABELS.completed}
                            </SelectLabel>
                            {GROUPED_STATUSES.completed.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="notes" className="text-xs">メモ</Label>
                      <textarea
                        id="notes"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="選考に関するメモ..."
                        className="w-full min-h-[60px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={cancelEdit} disabled={isSaving}>
                        キャンセル
                      </Button>
                      <Button size="sm" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? (
                          <>
                            <LoadingSpinner />
                            <span className="ml-2">保存中...</span>
                          </>
                        ) : (
                          "保存"
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  // View mode
                  <>
                    {/* Links and AI Fetch */}
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {company.recruitmentUrl && (
                        <a
                          href={company.recruitmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLinkIcon />
                          採用ページ
                        </a>
                      )}
                      {company.corporateUrl && (
                        <a
                          href={company.corporateUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-muted-foreground hover:text-primary"
                        >
                          <ExternalLinkIcon />
                          企業HP
                        </a>
                      )}
                      <FetchInfoButton
                        companyId={company.id}
                        companyName={company.name}
                        hasRecruitmentUrl={!!company.recruitmentUrl}
                        onSuccess={refreshDeadlines}
                      />
                    </div>

                    {/* Notes */}
                    {company.notes && (
                      <div>
                        <h3 className="text-xs font-medium text-muted-foreground mb-1">メモ</h3>
                        <p className="text-sm whitespace-pre-wrap line-clamp-3">{company.notes}</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Corporate Info (RAG) section */}
            <CorporateInfoSection
              companyId={company.id}
              companyName={company.name}
              onUpdate={fetchCompany}
            />
          </div>

          {/* Right column: Applications + Deadlines */}
          <div className="space-y-4">
            {/* Applications section */}
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
                  <div className="text-center py-6 text-muted-foreground">
                    <p className="text-sm">まだ応募枠が登録されていません</p>
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
                          className="w-full flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors text-left cursor-pointer"
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

            {/* Deadlines section */}
            <Card className="border-border/50">
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarIcon />
                  締切・予定
                  {deadlines.filter(d => !d.isConfirmed).length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      {deadlines.filter(d => !d.isConfirmed).length}件要確認
                    </span>
                  )}
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
                    <p className="text-sm">まだ締切が登録されていません</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[280px] overflow-y-auto">
                    {deadlines.map((deadline) => {
                      const isCompleted = !!deadline.completedAt;
                      const dueDate = new Date(deadline.dueDate);
                      const now = new Date();
                      const isOverdue = !isCompleted && dueDate < now;
                      const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                      // Confidence color mapping
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
                            "flex items-center gap-3 p-3 rounded-lg transition-colors",
                            isCompleted
                              ? "bg-muted/30 opacity-60"
                              : isOverdue
                              ? "bg-red-50 border border-red-200"
                              : !deadline.isConfirmed
                              ? "bg-amber-50/50 border border-amber-200"
                              : "bg-muted/50"
                          )}
                        >
                          {/* Complete checkbox */}
                          <button
                            type="button"
                            onClick={() => toggleComplete(deadline.id)}
                            className={cn(
                              "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer",
                              isCompleted
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-muted-foreground/40 hover:border-primary"
                            )}
                          >
                            {isCompleted && (
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                            <p className={cn("font-medium text-sm mt-1", isCompleted && "line-through")}>{deadline.title}</p>
                            <p className={cn("text-xs", isOverdue ? "text-red-600" : "text-muted-foreground")}>
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
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                              >
                                <ExternalLinkIcon />
                                取得元を確認
                              </a>
                            )}
                          </div>

                          {/* Edit button */}
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
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
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
  );
}
