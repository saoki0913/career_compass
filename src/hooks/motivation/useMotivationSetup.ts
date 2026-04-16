"use client";

import { useCallback, useRef, useState } from "react";

import { parseApiErrorResponse } from "@/lib/api-errors";
import { reportUserFacingError } from "@/lib/client-error-ui";
import { fetchMotivationRoleOptions } from "@/lib/motivation/client-api";
import type {
  MotivationSetupSnapshot,
  RoleOptionsResponse,
  RoleSelectionSource,
} from "@/lib/motivation/ui";
import { resolveRoleSelection } from "@/hooks/conversation/role-selection";

export function useMotivationSetup({ companyId }: { companyId: string }) {
  const [roleOptionsData, setRoleOptionsData] = useState<RoleOptionsResponse | null>(null);
  const [isRoleOptionsLoading, setIsRoleOptionsLoading] = useState(false);
  const [roleOptionsError, setRoleOptionsError] = useState<string | null>(null);
  const [setupSnapshot, setSetupSnapshot] = useState<MotivationSetupSnapshot | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [selectedRoleName, setSelectedRoleName] = useState("");
  const [roleSelectionSource, setRoleSelectionSource] = useState<RoleSelectionSource | null>(null);
  const [customRoleInput, setCustomRoleInput] = useState("");

  const roleOptionsRequestIdRef = useRef(0);

  const applySetupSelection = useCallback(
    (
      setup: MotivationSetupSnapshot | null | undefined,
      roleOptions: RoleOptionsResponse | null,
      conversationContext: {
        selectedIndustry?: string | null;
        selectedRole?: string | null;
        selectedRoleSource?: string | null;
      } | null | undefined,
    ) => {
      const resolvedIndustry =
        setup?.selectedIndustry ||
        setup?.resolvedIndustry ||
        conversationContext?.selectedIndustry ||
        roleOptions?.industry ||
        "";
      const resolvedRole = setup?.selectedRole || conversationContext?.selectedRole || "";
      const resolvedSource = setup?.selectedRoleSource || conversationContext?.selectedRoleSource || null;
      const nextRoleSelection = resolveRoleSelection({
        resolvedRole,
        resolvedSource,
        availableOptions: roleOptions?.roleGroups.flatMap((group) => group.options) ?? [],
      });

      setSetupSnapshot(setup || null);
      setSelectedIndustry(resolvedIndustry);
      setSelectedRoleName(nextRoleSelection.selectedRoleName);
      setRoleSelectionSource(nextRoleSelection.roleSelectionSource as RoleSelectionSource | null);
      setCustomRoleInput(nextRoleSelection.customRoleInput);
    },
    [],
  );

  const fetchRoleOptions = useCallback(
    async (industryOverride?: string | null) => {
      const requestId = ++roleOptionsRequestIdRef.current;
      setIsRoleOptionsLoading(true);
      setRoleOptionsError(null);

      try {
        const response = await fetchMotivationRoleOptions(companyId, industryOverride);
        if (!response.ok) {
          throw await parseApiErrorResponse(
            response,
            {
              code: "MOTIVATION_ROLE_OPTIONS_FETCH_FAILED",
              userMessage: "職種候補の取得に失敗しました。",
              action: "時間を置いて、もう一度お試しください。",
              retryable: true,
            },
            "MotivationPage.fetchRoleOptions",
          );
        }

        const data = await response.json();
        if (requestId !== roleOptionsRequestIdRef.current) {
          return null;
        }
        setRoleOptionsData(data);
        return data as RoleOptionsResponse;
      } catch (err) {
        if (requestId !== roleOptionsRequestIdRef.current) {
          return null;
        }
        setRoleOptionsData(null);
        setRoleOptionsError(
          reportUserFacingError(
            err,
            {
              code: "MOTIVATION_ROLE_OPTIONS_FETCH_FAILED",
              userMessage: "職種候補の取得に失敗しました。",
              action: "時間を置いて、もう一度お試しください。",
              retryable: true,
            },
            "MotivationPage.fetchRoleOptions",
          ),
        );
        return null;
      } finally {
        if (requestId === roleOptionsRequestIdRef.current) {
          setIsRoleOptionsLoading(false);
        }
      }
    },
    [companyId],
  );

  const handleIndustryChange = useCallback(
    async (value: string) => {
      setSelectedIndustry(value);
      setSelectedRoleName("");
      setRoleSelectionSource(null);
      setCustomRoleInput("");

      const nextRoleOptions = await fetchRoleOptions(value);
      if (!nextRoleOptions) {
        return;
      }

      setSelectedIndustry(value || nextRoleOptions.industry || "");
    },
    [fetchRoleOptions],
  );

  const resetSetup = useCallback(() => {
    setSetupSnapshot(null);
    setSelectedIndustry("");
    setSelectedRoleName("");
    setRoleSelectionSource(null);
    setCustomRoleInput("");
  }, []);

  return {
    roleOptionsData,
    isRoleOptionsLoading,
    roleOptionsError,
    setupSnapshot,
    selectedIndustry,
    selectedRoleName,
    roleSelectionSource,
    customRoleInput,
    setSelectedIndustry,
    setSelectedRoleName,
    setRoleSelectionSource,
    setCustomRoleInput,
    applySetupSelection,
    fetchRoleOptions,
    handleIndustryChange,
    resetSetup,
  };
}
