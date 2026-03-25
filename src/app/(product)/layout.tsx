import type { ReactNode } from "react";
import { headers } from "next/headers";

export default async function ProductLayout({ children }: { children: ReactNode }) {
  await headers();
  return children;
}
