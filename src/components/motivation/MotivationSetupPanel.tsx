"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { findRoleOption, type RoleOptionsResponse, type RoleSelectionSource } from "@/lib/motivation/ui";

export function MotivationSetupPanel({
  companyName,
  effectiveIndustry,
  requiresIndustrySelection,
  selectedIndustry,
  selectedRoleName,
  customRoleInput,
  roleOptionsData,
  roleOptionsError,
  roleSelectionSource,
  isRoleOptionsLoading,
  isSetupComplete,
  disableSetupEditing,
  isCustomRoleActive,
  onIndustryChange,
  onSelectedRoleNameChange,
  onRoleSelectionSourceChange,
  onCustomRoleInputChange,
}: {
  companyName: string;
  effectiveIndustry: string;
  requiresIndustrySelection: boolean;
  selectedIndustry: string;
  selectedRoleName: string;
  customRoleInput: string;
  roleOptionsData: RoleOptionsResponse | null;
  roleOptionsError: string | null;
  roleSelectionSource: RoleSelectionSource | null;
  isRoleOptionsLoading: boolean;
  isSetupComplete: boolean;
  disableSetupEditing: boolean;
  isCustomRoleActive: boolean;
  onIndustryChange: (value: string) => void;
  onSelectedRoleNameChange: (value: string) => void;
  onRoleSelectionSourceChange: (value: RoleSelectionSource | null) => void;
  onCustomRoleInputChange: (value: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4 sm:py-4">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <div className="shrink-0 px-1 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">最初に業界と職種を確定します</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                企業情報、ガクチカ、プロフィール、志望職種を踏まえた質問にするため、チャット前に前提を揃えます。
              </p>
            </div>
            {isSetupComplete ? (
              <Badge variant="soft-success" className="px-3 py-1 text-[11px]">
                準備完了
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-1">
          <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">企業</p>
              <div className="rounded-2xl border border-border/50 bg-muted/15 px-4 py-3">
                <p className="text-sm font-medium text-foreground">{companyName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {effectiveIndustry ? `業界: ${effectiveIndustry}` : "業界は次で指定します"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">業界</p>
              <p className="text-xs leading-5 text-muted-foreground">
                {requiresIndustrySelection
                  ? "企業情報だけでは広いため、ここで必須選択します。"
                  : "企業情報から解決できているため確認のみです。"}
              </p>

              {requiresIndustrySelection ? (
                <Select
                  value={selectedIndustry}
                  disabled={disableSetupEditing}
                  onValueChange={onIndustryChange}
                >
                  <SelectTrigger className="h-11 rounded-2xl">
                    <SelectValue placeholder="業界を選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {(roleOptionsData?.industryOptions || []).map((industry) => (
                      <SelectItem key={industry} value={industry}>
                        {industry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-2xl border border-border/50 bg-muted/15 px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{effectiveIndustry || "業界未取得"}</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">志望職種</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  候補から選び、見つからない場合だけ自由入力を使ってください。
                </p>
              </div>
              {isRoleOptionsLoading ? (
                <span className="text-xs text-muted-foreground">候補を読み込み中...</span>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <div>
                <Select
                  disabled={disableSetupEditing || !effectiveIndustry || (roleOptionsData?.roleGroups.length ?? 0) === 0}
                  value={roleSelectionSource === "custom" ? "" : selectedRoleName}
                  onValueChange={(value) => {
                    const matched = roleOptionsData ? findRoleOption(roleOptionsData.roleGroups, value) : null;
                    onSelectedRoleNameChange(value);
                    onRoleSelectionSourceChange(matched?.source || null);
                    onCustomRoleInputChange("");
                  }}
                >
                  <SelectTrigger className="h-11 rounded-2xl">
                    <SelectValue placeholder={effectiveIndustry ? "職種を選択してください" : "先に業界を選択してください"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(roleOptionsData?.roleGroups || []).map((group) => (
                      <SelectGroup key={group.id}>
                        <SelectLabel className="text-xs font-normal text-muted-foreground">
                          {group.label}
                        </SelectLabel>
                        {group.options.map((option) => (
                          <SelectItem key={`${group.id}-${option.value}`} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  候補にない場合のみ入力
                </label>
                <Input
                  className="mt-2"
                  disabled={disableSetupEditing || !effectiveIndustry}
                  placeholder="例: デジタル企画、プロダクトマネージャー"
                  value={customRoleInput}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    onCustomRoleInputChange(nextValue);
                    onSelectedRoleNameChange(nextValue);
                    onRoleSelectionSourceChange(nextValue.trim() ? "custom" : null);
                  }}
                />
                {isCustomRoleActive ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    現在は自由入力の職種を優先して質問を組み立てます。
                  </p>
                ) : null}
              </div>
            </div>

            {roleOptionsError ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-muted-foreground">
                {roleOptionsError}
              </div>
            ) : null}

            {!roleOptionsError && effectiveIndustry && (roleOptionsData?.roleGroups.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">
                候補がないため、右側の自由入力で職種を指定してください。
              </p>
            ) : null}
          </div>

          {(effectiveIndustry || selectedRoleName) && (
            <div className="flex flex-wrap items-center gap-2 px-1">
              <span className="text-xs text-muted-foreground">現在の設定:</span>
              {effectiveIndustry ? (
                <Badge variant="soft-info" className="px-3 py-1 text-[11px]">
                  業界: {effectiveIndustry}
                </Badge>
              ) : null}
              {selectedRoleName ? (
                <Badge variant="soft-primary" className="px-3 py-1 text-[11px]">
                  職種: {selectedRoleName}
                </Badge>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
