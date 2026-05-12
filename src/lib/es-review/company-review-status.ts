export type CompanyReviewStatus =
  | "no_company_selected"
  | "company_selected_not_fetched"
  | "company_status_checking"
  | "company_status_error"
  | "company_fetched_but_not_ready"
  | "ready_for_es_review";

export type CompanyReviewStatusOverride = {
  companyId: string;
  status: Extract<
    CompanyReviewStatus,
    | "company_status_checking"
    | "company_status_error"
    | "company_fetched_but_not_ready"
    | "ready_for_es_review"
  >;
  retryCount: number;
};

export function isRetryableStatusCode(status: number): boolean {
  return status >= 500 || status === 429;
}
