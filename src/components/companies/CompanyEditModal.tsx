/**
 * CompanyEditModal Component
 *
 * Modal for editing company information with the same UI as company creation
 */

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompanyAutocomplete } from "@/components/companies/CompanyAutocomplete";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INDUSTRIES } from "@/lib/constants/industries";
import {
  CompanyStatus,
  GROUPED_STATUSES,
  CATEGORY_LABELS,
  getStatusLabel,
} from "@/lib/constants/status";

// Icons
const XIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const EyeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const EyeOffIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
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

export interface Company {
  id: string;
  name: string;
  industry: string | null;
  recruitmentUrl: string | null;
  corporateUrl: string | null;
  mypageUrl: string | null;
  mypageLoginId: string | null;
  mypagePassword: string | null;
  notes: string | null;
  status: CompanyStatus;
}

export interface UpdateCompanyData {
  name: string;
  industry: string | null;
  recruitmentUrl: string | null;
  corporateUrl: string | null;
  mypageUrl: string | null;
  mypageLoginId: string | null;
  mypagePassword: string | null;
  notes: string | null;
  status: CompanyStatus;
}

interface CompanyEditModalProps {
  isOpen: boolean;
  company: Company;
  onClose: () => void;
  onSave: (data: UpdateCompanyData) => Promise<void>;
}

export function CompanyEditModal({ isOpen, company, onClose, onSave }: CompanyEditModalProps) {
  const [name, setName] = useState(company.name);
  const [industry, setIndustry] = useState(company.industry || "");
  const [recruitmentUrl, setRecruitmentUrl] = useState(company.recruitmentUrl || "");
  const [corporateUrl, setCorporateUrl] = useState(company.corporateUrl || "");
  const [mypageUrl, setMypageUrl] = useState(company.mypageUrl || "");
  const [mypageLoginId, setMypageLoginId] = useState(company.mypageLoginId || "");
  const [mypagePassword, setMypagePassword] = useState(company.mypagePassword || "");
  const [showPassword, setShowPassword] = useState(false);
  const [notes, setNotes] = useState(company.notes || "");
  const [status, setStatus] = useState<CompanyStatus>(company.status);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when company changes
  useEffect(() => {
    setName(company.name);
    setIndustry(company.industry || "");
    setRecruitmentUrl(company.recruitmentUrl || "");
    setCorporateUrl(company.corporateUrl || "");
    setMypageUrl(company.mypageUrl || "");
    setMypageLoginId(company.mypageLoginId || "");
    setMypagePassword(company.mypagePassword || "");
    setNotes(company.notes || "");
    setStatus(company.status);
    setError(null);
  }, [company]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("企業名を入力してください");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSave({
        name: name.trim(),
        industry: industry.trim() || null,
        recruitmentUrl: recruitmentUrl.trim() || null,
        corporateUrl: corporateUrl.trim() || null,
        mypageUrl: mypageUrl.trim() || null,
        mypageLoginId: mypageLoginId.trim() || null,
        mypagePassword: mypagePassword.trim() || null,
        notes: notes.trim() || null,
        status,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-background rounded-xl shadow-2xl border border-border/50">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-background border-b border-border/50">
          <div>
            <h2 className="text-lg font-semibold">企業情報を編集</h2>
            <p className="text-sm text-muted-foreground">{company.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
          >
            <XIcon />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
            {/* Left column: Basic info */}
            <div className="space-y-4">
              {/* Company name */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">
                  企業名 <span className="text-red-500">*</span>
                </Label>
                <CompanyAutocomplete
                  id="edit-name"
                  value={name}
                  onChange={setName}
                  onSelect={(selectedName, selectedIndustry) => {
                    setName(selectedName);
                    if (selectedIndustry && !industry) {
                      setIndustry(selectedIndustry);
                    }
                  }}
                  required
                />
              </div>

              {/* Industry */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-industry">業界</Label>
                <Select value={industry} onValueChange={setIndustry}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((ind) => (
                      <SelectItem key={ind} value={ind}>
                        {ind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* URLs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-recruitmentUrl">採用ページURL</Label>
                  <Input
                    id="edit-recruitmentUrl"
                    type="url"
                    value={recruitmentUrl}
                    onChange={(e) => setRecruitmentUrl(e.target.value)}
                    placeholder="https://"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-corporateUrl">企業HP URL</Label>
                  <Input
                    id="edit-corporateUrl"
                    type="url"
                    value={corporateUrl}
                    onChange={(e) => setCorporateUrl(e.target.value)}
                    placeholder="https://"
                    className="h-10"
                  />
                </div>
              </div>

              {/* Status selection */}
              <div className="space-y-1.5">
                <Label>選考ステータス</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as CompanyStatus)}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="選択してください">
                      {getStatusLabel(status)}
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
            </div>

            {/* Right column: Mypage info + Notes */}
            <div className="space-y-4">
              {/* Mypage Info */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">マイページ情報</Label>
                <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-muted/20">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-mypageUrl" className="text-xs">マイページURL</Label>
                    <Input
                      id="edit-mypageUrl"
                      type="url"
                      value={mypageUrl}
                      onChange={(e) => setMypageUrl(e.target.value)}
                      placeholder="https://"
                      className="h-9"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-mypageLoginId" className="text-xs">ログインID</Label>
                      <Input
                        id="edit-mypageLoginId"
                        type="text"
                        value={mypageLoginId}
                        onChange={(e) => setMypageLoginId(e.target.value)}
                        placeholder="ID / メールアドレス"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-mypagePassword" className="text-xs">パスワード</Label>
                      <div className="relative">
                        <Input
                          id="edit-mypagePassword"
                          type={showPassword ? "text" : "password"}
                          value={mypagePassword}
                          onChange={(e) => setMypagePassword(e.target.value)}
                          placeholder="••••••••"
                          className="h-9 pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="edit-notes">メモ</Label>
                <textarea
                  id="edit-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="選考に関するメモや志望理由など..."
                  className="w-full min-h-[120px] px-3 py-2 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-border/50">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              キャンセル
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <LoadingSpinner />
                  <span className="ml-2">保存中...</span>
                </>
              ) : (
                "保存"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
