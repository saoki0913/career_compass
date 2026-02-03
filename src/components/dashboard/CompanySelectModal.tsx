"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCompanies } from "@/hooks/useCompanies";
import { cn } from "@/lib/utils";

// Icons
const SearchIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
    />
  </svg>
);

const BuildingIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

const ChevronRightIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

interface CompanySelectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompanySelectModal({ open, onOpenChange }: CompanySelectModalProps) {
  const router = useRouter();
  const { companies, isLoading } = useCompanies();
  const [searchQuery, setSearchQuery] = useState("");

  // Filter companies by search query
  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) return companies;
    const query = searchQuery.toLowerCase();
    return companies.filter(
      (company) =>
        company.name.toLowerCase().includes(query) ||
        company.industry?.toLowerCase().includes(query)
    );
  }, [companies, searchQuery]);

  const handleSelectCompany = (companyId: string) => {
    onOpenChange(false);
    router.push(`/companies/${companyId}/motivation`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>志望動機を作成する企業を選択</DialogTitle>
        </DialogHeader>

        {/* Search input */}
        <div className="relative mt-2">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <SearchIcon />
          </div>
          <Input
            placeholder="企業を検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Company list */}
        <div className="mt-4 max-h-[300px] overflow-y-auto space-y-1">
          {isLoading ? (
            <div className="py-8 text-center">
              <div className="w-6 h-6 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground mt-2">読み込み中...</p>
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="py-8 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
                <BuildingIcon />
              </div>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "該当する企業が見つかりません" : "まだ企業が登録されていません"}
              </p>
            </div>
          ) : (
            filteredCompanies.map((company) => (
              <button
                key={company.id}
                type="button"
                onClick={() => handleSelectCompany(company.id)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-lg",
                  "hover:bg-muted transition-colors cursor-pointer text-left"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <BuildingIcon />
                  </div>
                  <div>
                    <p className="font-medium">{company.name}</p>
                    {company.industry && (
                      <p className="text-xs text-muted-foreground">{company.industry}</p>
                    )}
                  </div>
                </div>
                <ChevronRightIcon />
              </button>
            ))
          )}
        </div>

        {/* Add company link */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground text-center mb-3">
            まだ企業を登録していませんか？
          </p>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/companies/new" onClick={() => onOpenChange(false)}>
              <PlusIcon />
              <span className="ml-2">企業を追加する</span>
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CompanySelectModal;
