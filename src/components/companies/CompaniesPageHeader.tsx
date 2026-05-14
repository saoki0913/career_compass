import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CompaniesPageHeader() {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">登録企業</h1>
        </div>
        <p className="mt-1 text-muted-foreground">
          選考状況、締切、企業研究への導線を同じ画面で確認できます
        </p>
      </div>
      <Button asChild className="sm:self-start">
        <Link href="/companies/new">
          <Plus className="h-5 w-5" aria-hidden="true" />
          <span className="ml-1.5">企業を追加</span>
        </Link>
      </Button>
    </div>
  );
}

