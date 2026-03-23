"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "機能", href: "#features" },
  { label: "料金", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "無料ツール", href: "/tools" },
] as const;

export function LandingHeader() {
  const { isAuthenticated, isLoading } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleNavClick = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <header
      className={cn(
        "fixed left-0 right-0 top-0 z-50 transition-all duration-300",
        "border-b bg-white/72 backdrop-blur-2xl",
        isScrolled
          ? "border-slate-200/80 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.18)]"
          : "border-transparent"
      )}
    >
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <Image
              src="/icon.png"
              alt="就活Pass"
              width={34}
              height={34}
              className="rounded-xl"
            />
            <span className="block text-lg font-semibold tracking-[-0.04em] text-slate-950">
              就活Pass
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full px-3 py-2 text-sm font-medium text-slate-500 transition-colors duration-200 hover:text-slate-950"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            {isLoading ? (
              <Button size="sm" disabled className="h-9">
                読み込み中...
              </Button>
            ) : isAuthenticated ? (
              <Button size="sm" asChild className="h-9">
                <Link href="/dashboard">
                  ダッシュボード
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild className="h-9 text-muted-foreground">
                  <Link href="/login">ログイン</Link>
                </Button>
                <Button size="sm" asChild className="landing-cta-primary h-10 rounded-full px-5">
                  <Link href="/login">
                    無料で始める
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </>
            )}
          </div>

          <button
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white transition-colors duration-200 hover:bg-slate-50 md:hidden"
            aria-label={isMobileMenuOpen ? "メニューを閉じる" : "メニューを開く"}
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen ? (
        <div className="border-b border-slate-200/80 bg-white/95 backdrop-blur-xl md:hidden">
          <div className="mx-auto max-w-6xl space-y-2 px-4 py-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={handleNavClick}
                className="block rounded-2xl px-4 py-3 text-sm font-medium text-slate-600 transition-colors duration-200 hover:bg-slate-50 hover:text-slate-950"
              >
                {link.label}
              </Link>
            ))}
            <div className="space-y-2 border-t border-slate-200/80 pt-3">
              {isLoading ? null : isAuthenticated ? (
                <Button asChild className="h-11 w-full">
                  <Link href="/dashboard" onClick={handleNavClick}>
                    ダッシュボード
                  </Link>
                </Button>
              ) : (
                <>
                  <Button asChild className="landing-cta-primary h-11 w-full rounded-full">
                    <Link href="/login" onClick={handleNavClick}>
                      無料で始める
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    asChild
                    className="landing-cta-secondary h-11 w-full rounded-full"
                  >
                    <Link href="/login" onClick={handleNavClick}>
                      ログイン
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
