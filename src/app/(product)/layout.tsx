import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { ProductLayoutClient } from "@/components/layout/ProductLayoutClient";

export default async function ProductLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const sidebarCollapsed = cookieStore.get("sidebar-collapsed")?.value === "true";

  return (
    <ProductLayoutClient initialCollapsed={sidebarCollapsed}>
      {children}
    </ProductLayoutClient>
  );
}
