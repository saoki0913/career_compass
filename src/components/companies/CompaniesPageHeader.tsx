import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CompaniesPageHeader() {
  return (
    <div className="mb-6 flex flex-col gap-5 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">登録企業</h1>
        </div>
        <p className="mt-2 hidden text-sm leading-6 text-slate-600 sm:block sm:text-base">
          選考状況、締切、企業研究への導線を同じ画面で確認できます
        </p>
      </div>
      <Button
        asChild
        className="h-12 w-full rounded-xl bg-slate-950 text-base font-semibold shadow-[0_18px_40px_-24px_rgba(15,23,42,0.75)] hover:bg-slate-800 sm:h-12 sm:w-auto sm:min-w-40 sm:self-start sm:px-6"
      >
        <Link href="/companies/new">
          <Plus className="h-5 w-5" aria-hidden="true" />
          <span className="ml-1.5">企業を追加</span>
        </Link>
      </Button>
    </div>
  );
}
