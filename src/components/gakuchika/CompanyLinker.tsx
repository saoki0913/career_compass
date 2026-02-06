"use client";

import { useState } from "react";
import { Building2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";

interface Company {
  id: string;
  name: string;
}

interface CompanyLinkerProps {
  companies: Company[];
  linkedCompanyIds: string[];
  onToggle: (companyId: string) => void;
}

function CompanyList({
  companies,
  linkedCompanyIds,
  onToggle,
  searchValue,
  onSearchChange,
}: {
  companies: Company[];
  linkedCompanyIds: string[];
  onToggle: (companyId: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
}) {
  const filteredCompanies = companies.filter((company) =>
    company.name.toLowerCase().includes(searchValue.toLowerCase())
  );

  return (
    <>
      <CommandInput
        placeholder="企業名で検索..."
        value={searchValue}
        onValueChange={onSearchChange}
      />
      <CommandList>
        <CommandEmpty>企業が見つかりません</CommandEmpty>
        <CommandGroup>
          {filteredCompanies.map((company) => {
            const isLinked = linkedCompanyIds.includes(company.id);
            return (
              <CommandItem
                key={company.id}
                value={company.name}
                onSelect={() => onToggle(company.id)}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm">{company.name}</span>
                  {isLinked && (
                    <Check className="w-4 h-4 text-success" />
                  )}
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </>
  );
}

export function CompanyLinker({
  companies,
  linkedCompanyIds,
  onToggle,
}: CompanyLinkerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const linkedCompanies = companies.filter((c) =>
    linkedCompanyIds.includes(c.id)
  );

  // Desktop: Popover with Command
  if (isDesktop) {
    return (
      <div className="space-y-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Building2 className="w-4 h-4" />
              企業に紐づけ
              {linkedCompanies.length > 0 && (
                <Badge variant="soft-primary" className="ml-1">
                  {linkedCompanies.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Command>
              <CompanyList
                companies={companies}
                linkedCompanyIds={linkedCompanyIds}
                onToggle={onToggle}
                searchValue={searchValue}
                onSearchChange={setSearchValue}
              />
            </Command>
          </PopoverContent>
        </Popover>

        {/* Linked company chips */}
        {linkedCompanies.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {linkedCompanies.map((company) => (
              <Badge
                key={company.id}
                variant="soft-primary"
                className="gap-1 pr-1"
              >
                <Building2 className="w-3 h-3" />
                <span className="text-xs">{company.name}</span>
                <button
                  type="button"
                  onClick={() => onToggle(company.id)}
                  className="ml-0.5 hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                >
                  <X className="w-3 h-3" />
                  <span className="sr-only">削除</span>
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Mobile: Sheet (bottom sheet)
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setIsOpen(true)}
      >
        <Building2 className="w-4 h-4" />
        企業に紐づけ
        {linkedCompanies.length > 0 && (
          <Badge variant="soft-primary" className="ml-1">
            {linkedCompanies.length}
          </Badge>
        )}
      </Button>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="bottom" className="h-[80vh]">
          <SheetHeader>
            <SheetTitle>企業を選択</SheetTitle>
          </SheetHeader>
          <div className="mt-4 h-[calc(100%-4rem)]">
            <Command className="h-full">
              <CompanyList
                companies={companies}
                linkedCompanyIds={linkedCompanyIds}
                onToggle={onToggle}
                searchValue={searchValue}
                onSearchChange={setSearchValue}
              />
            </Command>
          </div>
        </SheetContent>
      </Sheet>

      {/* Linked company chips */}
      {linkedCompanies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {linkedCompanies.map((company) => (
            <Badge
              key={company.id}
              variant="soft-primary"
              className="gap-1 pr-1"
            >
              <Building2 className="w-3 h-3" />
              <span className="text-xs">{company.name}</span>
              <button
                type="button"
                onClick={() => onToggle(company.id)}
                className="ml-0.5 hover:bg-primary/20 rounded-full p-0.5 transition-colors"
              >
                <X className="w-3 h-3" />
                <span className="sr-only">削除</span>
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
