import type { ReactNode } from "react";
import { LandingSectionMotion } from "../LandingSectionMotion";

type LandingContentSectionProps = {
  heading: string;
  description?: string;
  children: ReactNode;
  bg?: "white" | "muted";
  id?: string;
};

export function LandingContentSection({
  heading,
  description,
  children,
  bg = "white",
  id,
}: LandingContentSectionProps) {
  return (
    <section
      id={id}
      className="px-6 py-20 md:py-28"
      style={{
        backgroundColor:
          bg === "muted" ? "var(--lp-surface-page)" : "#ffffff",
      }}
    >
      <div className="mx-auto max-w-[1100px]">
        <LandingSectionMotion>
          <h2
            className="text-2xl tracking-tight text-[var(--lp-navy)] md:text-3xl"
            style={{ fontWeight: 800, lineHeight: 1.3 }}
          >
            {heading}
          </h2>
          {description && (
            <p
              className="mt-4 max-w-2xl text-base text-slate-500"
              style={{ lineHeight: 1.8 }}
            >
              {description}
            </p>
          )}
        </LandingSectionMotion>

        <LandingSectionMotion className="mt-10">
          {children}
        </LandingSectionMotion>
      </div>
    </section>
  );
}
