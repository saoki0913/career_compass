"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "機能紹介", href: "/#features" },
  { label: "使い方", href: "/#how-it-works" },
  { label: "料金プラン", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
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

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;

    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [isMobileMenuOpen]);

  const handleNavClick = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <nav
      className={cn(
        "fixed top-0 z-50 w-full transition-all duration-300",
        isScrolled
          ? "bg-white/90 shadow-[0_1px_3px_rgba(0,0,0,0.05)] backdrop-blur-xl"
          : "bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6 lg:px-12">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/icon.png"
            alt="就活Pass"
            width={28}
            height={28}
            className="h-7 w-7"
            priority
          />
          <span
            className="text-lg tracking-tight text-[var(--lp-navy)]"
            style={{ fontWeight: 800 }}
          >
            就活Pass
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-4 py-2 text-sm text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900"
              style={{ fontWeight: 500 }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {isLoading ? null : isAuthenticated ? (
            <Link
              href="/dashboard"
              className="hidden items-center gap-1.5 rounded-lg bg-[var(--lp-cta)] px-5 py-2 text-sm text-white transition-all hover:bg-[var(--lp-cta)]/90 active:scale-[0.98] sm:inline-flex"
              style={{ fontWeight: 600 }}
            >
              ダッシュボード →
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden px-4 py-2 text-sm text-slate-500 transition-colors hover:text-slate-900 sm:inline-block"
                style={{ fontWeight: 500 }}
              >
                ログイン
              </Link>
              <Link
                href="/login"
                className="rounded-lg bg-[var(--lp-cta)] px-5 py-2 text-sm text-white transition-all hover:bg-[var(--lp-cta)]/90 active:scale-[0.98]"
                style={{ fontWeight: 600 }}
              >
                無料で始める
              </Link>
            </>
          )}
          <button
            type="button"
            className="rounded-lg p-2 transition-colors hover:bg-slate-100 md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={
              isMobileMenuOpen ? "メニューを閉じる" : "メニューを開く"
            }
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {isMobileMenuOpen ? (
        <>
          <button
            type="button"
            aria-label="メニューを閉じる"
            className="fixed inset-0 top-16 z-40 bg-black/20 backdrop-blur-[1px] md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 top-16 z-50 overflow-y-auto border-t border-slate-100 bg-white md:hidden">
            <div className="px-6 py-4">
              <div className="space-y-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={handleNavClick}
                    className="block rounded-lg px-4 py-3 text-slate-700 transition-colors hover:bg-slate-50"
                    style={{ fontWeight: 500 }}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3">
                {isLoading ? null : isAuthenticated ? (
                  <Link
                    href="/dashboard"
                    onClick={handleNavClick}
                    className="block w-full rounded-lg bg-[var(--lp-cta)] py-3 text-center text-sm text-white"
                    style={{ fontWeight: 600 }}
                  >
                    ダッシュボード
                  </Link>
                ) : (
                  <Link
                    href="/login"
                    onClick={handleNavClick}
                    className="block w-full rounded-lg bg-[var(--lp-cta)] py-3 text-center text-sm text-white"
                    style={{ fontWeight: 600 }}
                  >
                    無料で始める
                  </Link>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </nav>
  );
}
