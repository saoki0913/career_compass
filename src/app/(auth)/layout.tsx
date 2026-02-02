import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />

        {/* Decorative blobs */}
        <div
          className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full bg-violet-500/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-500/5 blur-3xl"
          aria-hidden="true"
        />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: "32px 32px",
          }}
          aria-hidden="true"
        />
      </div>

      {/* Content */}
      <div className="w-full max-w-md px-4 py-8">{children}</div>
    </div>
  );
}
