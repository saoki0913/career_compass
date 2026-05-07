import type { ContentType } from "@/lib/company-info/sources";

function jsonHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
  };
}

function request(path: string, init: RequestInit = {}) {
  return fetch(path, {
    credentials: "include",
    ...init,
  });
}

export function fetchCorporateInfoStatus(companyId: string) {
  return request(`/api/companies/${companyId}/fetch-corporate`, {
    headers: jsonHeaders(),
  });
}

export function searchCorporatePages(
  companyId: string,
  payload: {
    contentType?: ContentType;
    customQuery?: string;
    allowSnippetMatch: boolean;
  },
) {
  return request(`/api/companies/${companyId}/search-corporate-pages`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
}

export function checkSourceCompliance(companyId: string, urls: string[]) {
  return request(`/api/companies/${companyId}/source-compliance/check`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ urls }),
  });
}

export function estimateCorporateFetch(
  companyId: string,
  payload: {
    urls: string[];
    contentType: ContentType;
    contentChannel: "corporate_ir" | "corporate_general";
  },
) {
  return request(`/api/companies/${companyId}/fetch-corporate/estimate`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
}

export function fetchCorporateInfo(
  companyId: string,
  payload: {
    urls: string[];
    contentChannel: "corporate_ir" | "corporate_general";
    contentType: ContentType;
  },
) {
  return request(`/api/companies/${companyId}/fetch-corporate`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
}

export function estimateCorporatePdfUpload(companyId: string, formData: FormData) {
  return request(`/api/companies/${companyId}/fetch-corporate-upload/estimate`, {
    method: "POST",
    body: formData,
  });
}

export function uploadCorporatePdf(companyId: string, formData: FormData) {
  return request(`/api/companies/${companyId}/fetch-corporate-upload`, {
    method: "POST",
    body: formData,
  });
}

export function deleteCorporateUrls(companyId: string, urls: string[]) {
  return request(`/api/companies/${companyId}/delete-corporate-urls`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ urls }),
  });
}
