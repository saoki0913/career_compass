export const LP_SECTION_ASSET_BASE = "/marketing/LP/sections" as const;

export function lpSectionAsset(path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${LP_SECTION_ASSET_BASE}/${normalizedPath}`;
}
