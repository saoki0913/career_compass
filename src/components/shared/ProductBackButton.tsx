import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import {
  PRODUCT_BACK_BUTTON_TOUCH_CLASS,
  PRODUCT_BACK_BUTTON_VISUAL_CLASS,
} from "@/components/shared/product-page-header-layout";
import { cn } from "@/lib/utils";

type ProductBackButtonProps = {
  href: string;
  label: string;
  className?: string;
};

export function ProductBackButton({ href, label, className }: ProductBackButtonProps) {
  return (
    <Link href={href} aria-label={label} className={cn("group", PRODUCT_BACK_BUTTON_TOUCH_CLASS, className)}>
      <span className={PRODUCT_BACK_BUTTON_VISUAL_CLASS}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  );
}
