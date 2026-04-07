"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "機能紹介", href: "/#features" },
  { label: "他社比較", href: "/#comparison" },
  { label: "料金プラン", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
] as const;

export function LandingHeader() {
  const { isAuthenticated, isLoading } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 8);
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
        "fixed top-0 z-50 w-full bg-white/90 backdrop-blur-md transition-all duration-200",
        isScrolled ? "shadow-sm" : ""
      )}
      style={{
        borderBottom: `1px solid ${
          isScrolled ? "var(--lp-border-default)" : "transparent"
        }`,
      }}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6 md:h-16 md:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/icon.png"
            alt="就活Pass"
            width={32}
            height={32}
            className="h-8 w-8 rounded-md"
            priority
          />
          <span
            className="text-[1.0625rem] tracking-tight text-[var(--lp-navy)]"
            style={{ fontWeight: 600 }}
          >
            就活Pass
          </span>
        </Link>

        <div className="hidden items-center gap-10 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-[var(--lp-body-muted)] transition-colors hover:text-[var(--lp-navy)]"
              style={{ fontWeight: 500 }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          {isLoading ? null : isAuthenticated ? (
            <Link
              href="/dashboard"
              className="hidden items-center gap-1.5 rounded-md bg-[var(--lp-cta)] px-4 py-2 text-sm text-white transition hover:opacity-90 sm:inline-flex"
              style={{ fontWeight: 600 }}
            >
              ダッシュボード
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-md border px-4 py-2 text-sm text-[var(--lp-navy)] transition hover:bg-[var(--lp-surface-muted)] sm:inline-block"
                style={{
                  fontWeight: 500,
                  borderColor: "var(--lp-border-default)",
                }}
              >
                ログイン
              </Link>
              <Link
                href="/login"
                className="rounded-md bg-[var(--lp-cta)] px-4 py-2 text-sm text-white transition hover:opacity-90"
                style={{ fontWeight: 600 }}
              >
                無料で始める
              </Link>
            </>
          )}
          <button
            type="button"
            className="rounded-md p-2 text-[var(--lp-navy)] md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={
              isMobileMenuOpen ? "メニューを閉じる" : "メニューを開く"
            }
          >
            {isMobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>

      {isMobileMenuOpen ? (
        <>
          <button
            type="button"
            aria-label="メニューを閉じる"
            className="fixed inset-0 top-14 z-40 bg-black/20 backdrop-blur-[1px] md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 top-14 z-50 overflow-y-auto bg-white md:hidden"
            style={{ borderTop: "1px solid var(--lp-border-default)" }}
          >
            <div className="mx-auto max-w-7xl px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
              <div className="space-y-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={handleNavClick}
                    className="block rounded-md px-3 py-3 text-[var(--lp-navy)] transition-colors hover:bg-[var(--lp-surface-muted)]"
                    style={{ fontWeight: 500 }}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
              <div
                className="mt-4 space-y-2 border-t pt-4"
                style={{ borderColor: "var(--lp-border-default)" }}
              >
                {isLoading ? null : isAuthenticated ? (
                  <Link
                    href="/dashboard"
                    onClick={handleNavClick}
                    className="block w-full rounded-md bg-[var(--lp-cta)] py-3 text-center text-white"
                    style={{ fontWeight: 600 }}
                  >
                    ダッシュボード
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      onClick={handleNavClick}
                      className="block w-full rounded-md bg-[var(--lp-cta)] py-3 text-center text-white"
                      style={{ fontWeight: 600 }}
                    >
                      無料で始める
                    </Link>
                    <Link
                      href="/login"
                      onClick={handleNavClick}
                      className="block w-full rounded-md border py-3 text-center text-[var(--lp-navy)]"
                      style={{
                        fontWeight: 500,
                        borderColor: "var(--lp-border-default)",
                      }}
                    >
                      ログイン
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </nav>
  );
}
