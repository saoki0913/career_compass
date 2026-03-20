"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "要点", href: "#highlights" },
  { label: "機能", href: "#features" },
  { label: "料金", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
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
        "border-b border-border/40 bg-background/85 backdrop-blur-xl ring-1 ring-primary/[0.04]",
        isScrolled && "shadow-sm"
      )}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex shrink-0 items-center gap-3">
            <Image
              src="/icon.png"
              alt="就活Pass"
              width={34}
              height={34}
              className="rounded-xl ring-1 ring-border/60"
            />
            <span className="block text-lg font-bold tracking-tight">就活Pass</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {link.label}
              </a>
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
                <Button size="sm" asChild className="h-9 landing-cta-btn">
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
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/50 bg-background transition-colors hover:bg-secondary md:hidden"
            aria-label={isMobileMenuOpen ? "メニューを閉じる" : "メニューを開く"}
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen ? (
        <div className="border-b border-border/40 bg-background/95 backdrop-blur-xl md:hidden">
          <div className="container mx-auto space-y-2 px-4 py-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={handleNavClick}
                className="block rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <div className="space-y-2 border-t border-border/60 pt-3">
              {isLoading ? null : isAuthenticated ? (
                <Button asChild className="h-11 w-full">
                  <Link href="/dashboard" onClick={handleNavClick}>
                    ダッシュボード
                  </Link>
                </Button>
              ) : (
                <>
                  <Button asChild className="h-11 w-full landing-cta-btn">
                    <Link href="/login" onClick={handleNavClick}>
                      無料で始める
                    </Link>
                  </Button>
                  <Button variant="outline" asChild className="h-11 w-full">
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
