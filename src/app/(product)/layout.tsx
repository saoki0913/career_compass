import type { ReactNode } from "react";
import { headers } from "next/headers";
import { ProductLayoutClient } from "@/components/layout/ProductLayoutClient";

export default async function ProductLayout({ children }: { children: ReactNode }) {
  await headers();
  return <ProductLayoutClient>{children}</ProductLayoutClient>;
}
