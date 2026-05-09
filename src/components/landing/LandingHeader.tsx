"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOGO_ASSETS } from "@/lib/assets/image-registry";

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
      data-section="landing-header"
      className={cn(
        "fixed top-0 z-50 w-full border-b bg-white transition-all duration-300",
        isScrolled ? "shadow-[0_6px_24px_rgba(11,30,58,0.06)]" : "shadow-[0_1px_0_rgba(0,0,0,0.05)]"
      )}
      style={{ borderColor: "var(--lp-border-default)" }}
    >
      <div
        className="mx-auto flex max-w-[1572px] items-center justify-between px-6 sm:px-10 lg:px-12 xl:px-14"
        style={{
          height: 78,
          fontFamily: "'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        }}
      >
        <Link href="/" className="flex items-center">
          <Image
            src={LOGO_ASSETS.textClean}
            alt="就活Pass"
            width={168}
            height={84}
            className="h-10 w-36 object-cover sm:w-40"
            priority
          />
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-2 py-2 text-[15px] transition-all hover:bg-[#f6f9ff]"
              style={{ color: "var(--lp-navy)", fontWeight: 700 }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {isLoading ? null : isAuthenticated ? (
            <Link
              href="/dashboard"
              className="hidden min-h-[44px] items-center gap-1.5 rounded-[8px] bg-[var(--lp-cta)] px-5 py-2.5 text-[15px] text-white transition-all hover:bg-[var(--lp-cta)]/90 active:scale-[0.98] sm:inline-flex"
              style={{ fontWeight: 600 }}
            >
              ダッシュボード →
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden px-3 py-2 text-[15px] transition-colors sm:inline-block"
                style={{ color: "var(--lp-navy)", fontWeight: 700 }}
              >
                ログイン
              </Link>
              <Link
                href="/login"
                className="rounded-[8px] bg-[var(--lp-cta)] px-5 py-2.5 text-[15px] text-white transition-all hover:bg-[var(--lp-cta)]/90 active:scale-[0.98]"
                style={{ fontWeight: 600 }}
              >
                無料で始める
              </Link>
            </>
          )}
          <button
            type="button"
            className="rounded-lg p-2 transition-colors hover:bg-[#f6f9ff] md:hidden"
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
            className="fixed inset-0 top-[78px] z-40 bg-black/20 backdrop-blur-[1px] md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 top-[78px] z-50 overflow-y-auto border-t border-slate-100 bg-white md:hidden">
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
