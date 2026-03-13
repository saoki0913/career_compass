import "server-only";

function getStorageConfig() {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return { baseUrl, serviceRoleKey };
}

function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildObjectUrl(bucket: string, path: string): string {
  const { baseUrl } = getStorageConfig();
  return `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`;
}

function buildHeaders(contentType?: string): HeadersInit {
  const { serviceRoleKey } = getStorageConfig();
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

function normalizeUploadBody(body: Blob | ArrayBuffer | Uint8Array): BodyInit {
  if (body instanceof Blob || body instanceof ArrayBuffer) {
    return body;
  }

  const copied = new Uint8Array(body.byteLength);
  copied.set(body);
  return new Blob([copied.buffer]);
}

export async function uploadSupabaseObject(params: {
  bucket: string;
  path: string;
  body: Blob | ArrayBuffer | Uint8Array;
  contentType?: string;
  upsert?: boolean;
}) {
  const response = await fetch(buildObjectUrl(params.bucket, params.path), {
    method: "POST",
    headers: {
      ...buildHeaders(params.contentType),
      "x-upsert": params.upsert ? "true" : "false",
    },
    body: normalizeUploadBody(params.body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase Storage upload failed: ${response.status} ${detail}`.trim());
  }
}

export async function downloadSupabaseObject(params: {
  bucket: string;
  path: string;
}): Promise<ArrayBuffer> {
  const response = await fetch(buildObjectUrl(params.bucket, params.path), {
    method: "GET",
    headers: buildHeaders(),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase Storage download failed: ${response.status} ${detail}`.trim());
  }

  return await response.arrayBuffer();
}

export async function deleteSupabaseObject(params: {
  bucket: string;
  path: string;
}) {
  const response = await fetch(buildObjectUrl(params.bucket, params.path), {
    method: "DELETE",
    headers: buildHeaders(),
  });

  if (!response.ok && response.status !== 404) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase Storage delete failed: ${response.status} ${detail}`.trim());
  }
}
