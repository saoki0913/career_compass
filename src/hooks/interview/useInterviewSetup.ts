"use client";

import { useCallback, useEffect } from "react";

import { parseApiErrorResponse } from "@/lib/api-errors";
import { resolveRoleSelection } from "@/hooks/conversation/role-selection";
import { fetchInterviewData, fetchInterviewRoleOptions } from "@/lib/interview/client-api";
import { classifyInterviewRoleTrack } from "@/lib/interview/session";

export function useInterviewSetup({
  companyId,
  enabled,
  domain,
}: {
  companyId: string | null;
  enabled: boolean;
  domain: any;
}) {
  const reportError = domain.reportError;

  useEffect(() => {
    const classified = classifyInterviewRoleTrack(domain.resolvedSelectedRole);
    domain.setSetupState((prev: any) => (prev.roleTrack === classified ? prev : { ...prev, roleTrack: classified }));
  }, [domain.resolvedSelectedRole, domain.setSetupState]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!companyId) {
      domain.setError("このURLでは企業を特定できません。");
      domain.setErrorAction("企業一覧から対象の企業を開き直してください。");
      return;
    }

    let isMounted = true;

    const hydrate = async () => {
      domain.setError(null);
      domain.setErrorAction(null);
      domain.setPersistenceUnavailable(false);
      domain.setPersistenceDeveloperHint(null);
      try {
        const [interviewResponse, roleResponse] = await Promise.all([
          fetchInterviewData(companyId),
          fetchInterviewRoleOptions(companyId),
        ]);
        if (!interviewResponse.ok) {
          throw await parseApiErrorResponse(
            interviewResponse,
            {
              code: "INTERVIEW_HYDRATE_FAILED",
              userMessage: "面接対策の準備に失敗しました。",
              action: "少し時間をおいて、もう一度お試しください。",
            },
            "interview:hydrate",
          );
        }
        if (!roleResponse.ok) {
          throw await parseApiErrorResponse(
            roleResponse,
            {
              code: "INTERVIEW_ROLE_OPTIONS_FAILED",
              userMessage: "職種候補の取得に失敗しました。",
              action: "少し時間をおいて、もう一度お試しください。",
            },
            "interview:role-options",
          );
        }

        const [interviewData, roleData] = await Promise.all([interviewResponse.json(), roleResponse.json()]);
        if (!isMounted) return;

        domain.setCompanyName(interviewData.companyName || "");
        domain.setMaterials(interviewData.materials || []);
        domain.setMessages(interviewData.messages || []);
        domain.setFeedback(interviewData.feedback || null);
        domain.setFeedbackHistories(interviewData.feedbackHistories || []);
        domain.setCreditCost(interviewData.creditCost || 6);
        domain.setQuestionCount(interviewData.questionCount || 0);
        domain.setQuestionStage(interviewData.questionStage || null);
        domain.setStageStatus(interviewData.stageStatus || null);
        domain.setTurnState(interviewData.turnState || null);
        domain.setTurnMeta(interviewData.turnMeta || null);
        domain.setInterviewPlan(interviewData.interviewPlan || null);
        domain.setQuestionFlowCompleted(Boolean(interviewData.questionFlowCompleted));
        domain.setLegacySessionDetected(Boolean(interviewData.legacySessionDetected));
        domain.setSetupState(interviewData.setupState || domain.setupState);
        domain.setRoleOptionsData(roleData);

        const roleSelection = resolveRoleSelection({
          resolvedRole: interviewData.setupState?.selectedRole || "",
          resolvedSource: interviewData.setupState?.selectedRoleSource || null,
          availableOptions: roleData?.roleGroups.flatMap((group: any) => group.options) ?? [],
        });
        domain.setSelectedRoleName(roleSelection.selectedRoleName);
        domain.setCustomRoleNameState(roleSelection.customRoleInput);
        domain.setRoleSelectionSource(roleSelection.roleSelectionSource);
      } catch (errorValue) {
        reportError(
          errorValue,
          {
            code: "INTERVIEW_HYDRATE_FAILED",
            userMessage: "面接対策の準備に失敗しました。",
            action: "少し時間をおいて、もう一度お試しください。",
          },
          "interview:hydrate",
        );
      }
    };

    void hydrate();
    return () => {
      isMounted = false;
    };
  }, [
    companyId,
    domain.setCompanyName,
    domain.setMaterials,
    domain.setMessages,
    domain.setFeedback,
    domain.setFeedbackHistories,
    domain.setCreditCost,
    domain.setQuestionCount,
    domain.setQuestionStage,
    domain.setStageStatus,
    domain.setTurnState,
    domain.setTurnMeta,
    domain.setInterviewPlan,
    domain.setQuestionFlowCompleted,
    domain.setLegacySessionDetected,
    domain.setSetupState,
    domain.setRoleOptionsData,
    domain.setSelectedRoleName,
    domain.setCustomRoleNameState,
    domain.setRoleSelectionSource,
    domain.setError,
    domain.setErrorAction,
    domain.setPersistenceUnavailable,
    domain.setPersistenceDeveloperHint,
    domain.setupState,
    enabled,
    reportError,
  ]);

  const selectRole = useCallback(
    (value: string, unsetValue: string) => {
      if (value === unsetValue) {
        domain.setSelectedRoleName("");
        domain.setRoleSelectionSource(null);
        return;
      }
      const option = domain.flattenedRoleOptions.find((item: any) => item.value === value);
      domain.setSelectedRoleName(value);
      domain.setCustomRoleNameState("");
      domain.setRoleSelectionSource(option?.source ?? null);
    },
    [
      domain.flattenedRoleOptions,
      domain.setSelectedRoleName,
      domain.setCustomRoleNameState,
      domain.setRoleSelectionSource,
    ],
  );

  const setCustomRoleName = useCallback(
    (value: string) => {
      domain.setCustomRoleNameState(value);
      if (value.trim()) {
        domain.setSelectedRoleName("");
        domain.setRoleSelectionSource("custom");
      }
    },
    [
      domain.setCustomRoleNameState,
      domain.setSelectedRoleName,
      domain.setRoleSelectionSource,
    ],
  );

  return {
    selectRole,
    setCustomRoleName,
  };
}
