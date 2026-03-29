export type LPVariant = "A" | "B" | "C";

export function getLPVariant(searchParamOverride?: string): LPVariant {
  // Dev-only query param override for quick comparison
  if (process.env.NODE_ENV === "development" && searchParamOverride) {
    const upper = searchParamOverride.trim().toUpperCase();
    if (upper === "A" || upper === "B" || upper === "C") return upper;
  }

  const raw = process.env.NEXT_PUBLIC_LP_VARIANT?.trim().toUpperCase();
  if (raw === "A" || raw === "B" || raw === "C") return raw;
  return "A";
}
