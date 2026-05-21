"use client";

import { useId, useState } from "react";

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
import { cn } from "@/lib/utils";
import type {
  RoleGroup,
  RoleOptionsFallbackReason,
  RoleSelectionSource,
} from "@/shared/contracts/interview/role-options";

const CUSTOM_ROLE_MAX_LENGTH = 40;

type RoleInputMode = "candidate" | "custom";

export type RoleSelectorProps = {
  /** 候補グループ（業界別 / 汎用セット）。空配列でも壊れないこと。 */
  roleGroups: RoleGroup[];
  /** コントローラーが保持する候補選択値（未選択は空文字）。 */
  selectedRoleName: string;
  /** コントローラーが保持する自由入力値。 */
  customRoleName: string;
  /** 現在の選択 source（"custom" を含む）。初期モード判定に使う。 */
  roleSelectionSource: RoleSelectionSource | null;
  /** 候補を選択。InterviewPageContent 側で selectRole(value, ROLE_SELECT_UNSET) にマップ。 */
  onSelectRole: (value: string) => void;
  /** 候補選択を解除（自由入力モードへ）。selectRole(ROLE_SELECT_UNSET, ...) にマップ。 */
  onClearRole: () => void;
  /** 自由入力の更新。setCustomRoleName にマップ。 */
  onCustomRoleChange: (value: string) => void;
  /** 業界未解決などで汎用セットに退避しているか。 */
  isFallback?: boolean;
  /** 退避理由（E2E が data 属性で参照）。 */
  fallbackReason?: RoleOptionsFallbackReason | null;
  /** 開始処理中などで操作を無効化する。 */
  disabled?: boolean;
};

function shouldStartInCustomMode(
  roleSelectionSource: RoleSelectionSource | null,
  customRoleName: string,
  selectedRoleName: string,
): boolean {
  if (roleSelectionSource === "custom") return true;
  // source 未確定でも、自由入力済みかつ候補未選択なら自由入力を初期表示する。
  return customRoleName.trim().length > 0 && selectedRoleName.trim().length === 0;
}

/**
 * 面接設定の職種選択 UI。
 *
 * 「候補から選択 / 自由入力」をタブで明示的に切り替える。fallback 時は控えめな
 * 注記を表示し、ユーザーに汎用セット表示中であることを伝える。ROLE_SELECT_UNSET
 * sentinel には依存せず、選択・解除・自由入力をすべてコールバックで表現する
 * （sentinel への変換は呼び出し側＝コントローラー配線が担う）。
 */
export function RoleSelector({
  roleGroups,
  selectedRoleName,
  customRoleName,
  roleSelectionSource,
  onSelectRole,
  onClearRole,
  onCustomRoleChange,
  isFallback = false,
  fallbackReason = null,
  disabled = false,
}: RoleSelectorProps) {
  const [mode, setMode] = useState<RoleInputMode>(() =>
    shouldStartInCustomMode(roleSelectionSource, customRoleName, selectedRoleName) ? "custom" : "candidate",
  );

  const groupId = useId();
  const candidateSelectId = `${groupId}-candidate`;
  const customInputId = `${groupId}-custom`;
  const candidatePanelId = `${groupId}-candidate-panel`;
  const customPanelId = `${groupId}-custom-panel`;

  const switchToCandidate = () => {
    if (mode === "candidate") return;
    // 自由入力から戻るときは選択状態をリセットして source を整合させる。
    onClearRole();
    setMode("candidate");
  };

  const switchToCustom = () => {
    if (mode === "custom") return;
    setMode("custom");
  };

  const handleCustomChange = (rawValue: string) => {
    // 先頭スペースのみ抑制し、内部・末尾は保持する。毎キーストロークで全 trim すると
    // 「経営 企画」のような複数語の職種が打てなくなるため。最終正規化はデータ層の
    // normalizeRoleLabel（内部空白の畳み込み + trim）が担う。
    const next = rawValue.trimStart().slice(0, CUSTOM_ROLE_MAX_LENGTH);
    onCustomRoleChange(next);
  };

  const tabBaseClass =
    "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <fieldset
      className="space-y-2 border-0 p-0"
      disabled={disabled}
      data-fallback-reason={isFallback ? (fallbackReason ?? undefined) : undefined}
    >
      <legend className="text-sm font-medium">職種</legend>

      <div
        role="tablist"
        aria-label="職種の入力方法"
        className="inline-flex w-full rounded-lg border border-border/60 bg-muted/40 p-1"
      >
        <button
          type="button"
          role="tab"
          id={`${groupId}-candidate-tab`}
          aria-selected={mode === "candidate"}
          aria-controls={candidatePanelId}
          tabIndex={mode === "candidate" ? 0 : -1}
          disabled={disabled}
          onClick={switchToCandidate}
          className={cn(
            tabBaseClass,
            mode === "candidate"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          候補から選択
        </button>
        <button
          type="button"
          role="tab"
          id={`${groupId}-custom-tab`}
          aria-selected={mode === "custom"}
          aria-controls={customPanelId}
          tabIndex={mode === "custom" ? 0 : -1}
          disabled={disabled}
          onClick={switchToCustom}
          className={cn(
            tabBaseClass,
            mode === "custom"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          自由入力
        </button>
      </div>

      {mode === "candidate" ? (
        <div
          role="tabpanel"
          id={candidatePanelId}
          aria-labelledby={`${groupId}-candidate-tab`}
          className="space-y-1.5"
        >
          <label htmlFor={candidateSelectId} className="sr-only">
            職種候補
          </label>
          <Select
            value={selectedRoleName || undefined}
            onValueChange={(value) => onSelectRole(value)}
            disabled={disabled}
          >
            <SelectTrigger id={candidateSelectId} aria-label="職種候補" className="w-full">
              <SelectValue placeholder="候補から選択" />
            </SelectTrigger>
            <SelectContent>
              {roleGroups.map((group) => (
                <SelectGroup key={group.id}>
                  <SelectLabel>{group.label}</SelectLabel>
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
      ) : (
        <div
          role="tabpanel"
          id={customPanelId}
          aria-labelledby={`${groupId}-custom-tab`}
          className="space-y-1.5"
        >
          <label htmlFor={customInputId} className="sr-only">
            職種を自由入力
          </label>
          <Input
            id={customInputId}
            aria-label="職種を自由入力"
            value={customRoleName}
            maxLength={CUSTOM_ROLE_MAX_LENGTH}
            placeholder="候補にない職種を入力（40文字まで）"
            onChange={(event) => handleCustomChange(event.target.value)}
            disabled={disabled}
          />
        </div>
      )}

      {isFallback ? (
        <p className="text-xs leading-5 text-muted-foreground">
          業界が未設定のため汎用職種を表示しています。該当する職種がなければ自由入力してください。
        </p>
      ) : null}
    </fieldset>
  );
}
