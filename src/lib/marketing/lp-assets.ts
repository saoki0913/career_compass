export const LP_ASSET_BASE = "/marketing/LP/assets" as const;

export function lpAsset(path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${LP_ASSET_BASE}/${normalizedPath}`;
}
