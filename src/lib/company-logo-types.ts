export type CompanyLogoCandidate =
  | {
      kind: "official-asset";
      assetKey: CompanyLogoAssetKey;
      source: "mapping.logo_asset_key";
      confidence: "high";
    }
  | {
      kind: "domain";
      domain: string;
      source: "mapping.logo_domains" | "promoted.mapping.domains";
      confidence: "high" | "low";
    }
  | {
      kind: "allowlisted-name";
      nameKey: string;
      source: "mapping.logo_names";
      confidence: "high";
    };

export type CompanyLogoAssetKey =
  | "mitsui-corporate-horizontal"
  | "mitsuifudosan-corporate"
  | "tokio-marine-nichido";

export const COMPANY_LOGO_ASSET_KEYS = [
  "mitsui-corporate-horizontal",
  "mitsuifudosan-corporate",
  "tokio-marine-nichido",
] as const satisfies readonly CompanyLogoAssetKey[];

export type CompanyLogoProvider =
  | "auto"
  | "logo-dev"
  | "brandfetch"
  | "official"
  | "logo-dev-name"
  | "brandfetch-name";

export function isCompanyLogoAssetKey(value: string): value is CompanyLogoAssetKey {
  return (COMPANY_LOGO_ASSET_KEYS as readonly string[]).includes(value);
}
