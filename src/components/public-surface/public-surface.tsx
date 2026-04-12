import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type PublicNavLink = {
  href: string;
  label: string;
};

export type PublicAction = {
  href: string;
  label: string;
  variant?: "primary" | "secondary" | "subtle";
};

const frameClassName =
  "relative isolate min-h-screen overflow-hidden bg-[var(--lp-surface-page)] text-slate-900 pt-20";

const containerClassName = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

/** LP（Hero 等）と同じ主CTA。`globals.css` の `--lp-cta` / `--lp-navy` に依存 */
export const publicSurfacePrimaryCtaClassName =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--lp-cta)] px-5 text-sm font-semibold text-white shadow-lg shadow-[rgba(10,15,92,0.12)] transition-all hover:bg-[var(--lp-cta)]/90 hover:shadow-xl hover:shadow-[rgba(10,15,92,0.18)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-navy)] focus-visible:ring-offset-2";

/** LP ヒーロー「機能を見る」に近いアウトラインCTA */
export const publicSurfaceSecondaryCtaClassName =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-[var(--lp-navy)] shadow-sm transition-colors duration-200 hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-navy)]/20 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

/** ヒーロー右・カード内の機能アイコン枠 */
export const publicSurfaceFeatureIconClassName =
  "flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--lp-border-tint)] bg-[var(--lp-tint-navy-soft)] text-[var(--lp-navy)]";

/** STEP 等の小さめアイコン枠 */
export const publicSurfaceStepIconClassName =
  "flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--lp-border-tint)] bg-[var(--lp-tint-navy-soft)] text-[var(--lp-navy)]";

const buttonClassNames: Record<NonNullable<PublicAction["variant"]>, string> = {
  primary: publicSurfacePrimaryCtaClassName,
  secondary: publicSurfaceSecondaryCtaClassName,
  subtle:
    "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium text-slate-600 transition-colors duration-200 hover:text-[var(--lp-navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-navy)]/20 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
};

export function PublicSurfaceFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(frameClassName, className)}>
      {children}
    </div>
  );
}

export function PublicSurfaceHeader({
  brand = "就活Pass",
  navLinks,
  primaryAction,
  secondaryAction,
}: {
  brand?: string;
  navLinks: PublicNavLink[];
  primaryAction: PublicAction;
  secondaryAction?: PublicAction;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
      <div className={cn(containerClassName, "flex h-16 items-center justify-between gap-4")}>
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <Image
            src="/icon.png"
            alt=""
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-2xl object-cover"
            priority
          />
          <span className="text-[15px] font-extrabold tracking-tight text-[var(--lp-navy)]">
            {brand}
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {secondaryAction ? (
            <PublicSurfaceButton href={secondaryAction.href} variant={secondaryAction.variant ?? "subtle"}>
              {secondaryAction.label}
            </PublicSurfaceButton>
          ) : null}
          <PublicSurfaceButton href={primaryAction.href} variant={primaryAction.variant ?? "primary"}>
            {primaryAction.label}
          </PublicSurfaceButton>
        </div>
      </div>
    </header>
  );
}

export function PublicSurfaceButton({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: NonNullable<PublicAction["variant"]>;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(buttonClassNames[variant], className)}
      style={
        variant === "primary"
          ? { fontWeight: 700 }
          : variant === "secondary"
            ? { fontWeight: 600 }
            : undefined
      }
    >
      {children}
      {variant === "primary" ? (
        <ArrowRight className="size-4 shrink-0" aria-hidden />
      ) : null}
    </Link>
  );
}

export function PublicSurfaceHero({
  eyebrow,
  title,
  description,
  actions,
  points,
  visual,
  className,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions: PublicAction[];
  points: string[];
  visual: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(containerClassName, "pb-10 pt-10 sm:pt-12 lg:pb-16 lg:pt-14", className)}>
      <div className="grid items-start gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
        <div>
          {eyebrow ? (
            <p className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium tracking-wide text-slate-600 shadow-sm">
              {eyebrow}
            </p>
          ) : null}
          <h1
            className={cn(
              "max-w-3xl text-balance text-[clamp(2.7rem,5vw,5rem)] leading-[0.95] tracking-[-0.05em] text-[var(--lp-navy)]",
              eyebrow ? "mt-5" : "mt-0",
            )}
            style={{ fontWeight: 900 }}
          >
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-8 text-slate-600 sm:text-lg">
            {description}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {actions.map((action) => (
              <PublicSurfaceButton
                key={action.href}
                href={action.href}
                variant={action.variant ?? "primary"}
              >
                {action.label}
              </PublicSurfaceButton>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap gap-2">
            {points.map((point) => (
              <span
                key={point}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white/85 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm"
              >
                {point}
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-[32px] bg-slate-200/40 blur-2xl" />
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-[var(--lp-shadow-screenshot)] backdrop-blur">
            {visual}
          </div>
        </div>
      </div>
    </section>
  );
}

export function PublicSurfaceSection({
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(containerClassName, "py-10 sm:py-12 lg:py-16", className)}>
      <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:gap-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--lp-navy)]">
            {eyebrow}
          </p>
          <h2
            className="mt-3 text-balance text-2xl tracking-[-0.04em] text-[var(--lp-navy)] sm:text-3xl"
            style={{ fontWeight: 900 }}
          >
            {title}
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
            {description}
          </p>
        </div>

        <div>{children}</div>
      </div>
    </section>
  );
}

export function PublicSurfacePanel({
  title,
  description,
  children,
  className,
  tone = "default",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  tone?: "default" | "accent" | "soft";
}) {
  const toneClassName =
    tone === "accent"
      ? "border-[var(--lp-border-tint)] bg-[linear-gradient(180deg,rgba(10,15,92,0.06),rgba(255,255,255,0.96))]"
      : tone === "soft"
        ? "border-slate-200/80 bg-slate-50/80"
        : "border-slate-200/80 bg-white/90";

  return (
    <div
      className={cn(
        "rounded-[28px] border p-6 shadow-[0_16px_48px_rgba(15,23,42,0.06)] backdrop-blur",
        toneClassName,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3
            className="text-lg tracking-[-0.03em] text-[var(--lp-navy)]"
            style={{ fontWeight: 900 }}
          >
            {title}
          </h3>
          {description ? (
            <p className="mt-1 text-sm leading-7 text-slate-600">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
