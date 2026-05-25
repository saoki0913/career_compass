import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPageHeader } from "@/components/shared/ProductPageHeader";
import { ProductFloatingActionButton } from "@/components/shared/ProductFloatingActionButton";

type CompaniesPageHeaderProps = {
  count?: number;
  limit?: number | null;
};

function formatCompanyCount(count: number, limit?: number | null) {
  return limit ? `${count} / ${limit} 社` : `${count} 社`;
}

export function CompaniesPageHeader({ count, limit }: CompaniesPageHeaderProps) {
  return (
    <ProductPageHeader
      title="登録企業"
      description="志望企業の情報や選考状況を管理できます"
      backLink={{ href: "/dashboard", label: "ダッシュボードへ戻る" }}
      badge={
        typeof count === "number" ? (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {formatCompanyCount(count, limit)}
          </span>
        ) : undefined
      }
      actions={
        <Button asChild className="hidden sm:inline-flex">
          <Link href="/companies/new">
            <Plus className="h-5 w-5" aria-hidden="true" />
            <span className="ml-1.5">企業を追加</span>
          </Link>
        </Button>
      }
      mobilePrimaryAction={<ProductFloatingActionButton href="/companies/new" label="企業を追加" />}
    />
  );
}
