import Image from "next/image";
import { landingMedia } from "./landing-media";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function FeatureManagementSection() {
  return (
    <section className="bg-[var(--lp-surface-page)] px-6 py-24 md:py-28">
      <div className="mx-auto max-w-7xl">
        <LandingSectionMotion className="flex flex-col items-center gap-14 lg:flex-row-reverse lg:items-start lg:gap-20">
          <div className="w-full max-w-xl lg:w-1/2 lg:max-w-none">
            <span
              className="mb-3 block text-xs uppercase tracking-[0.2em] text-[var(--lp-cta)]"
              style={{ fontWeight: 600 }}
            >
              Feature 02
            </span>
            <h2
              className="mb-5 text-2xl tracking-tight text-[var(--lp-navy)] md:text-3xl lg:text-[2rem] lg:leading-snug"
              style={{ fontWeight: 600 }}
            >
              進捗と締切を、
              <br />
              一目で把握
            </h2>
            <p
              className="mb-8 text-base leading-relaxed text-[var(--lp-body-muted)] md:text-lg"
              style={{ fontWeight: 400 }}
            >
              企業一覧、締切、応募状況、Googleカレンダー連携までをひとつに。情報が散らばらず、やるべきことに集中できます。
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div
                className="rounded-lg border bg-white p-5"
                style={{ borderColor: "var(--lp-border-default)" }}
              >
                <div
                  className="mb-1 text-2xl tabular-nums text-[var(--lp-navy)]"
                  style={{ fontWeight: 600 }}
                >
                  98%
                </div>
                <div
                  className="text-xs text-[var(--lp-body-muted)] md:text-sm"
                  style={{ fontWeight: 500 }}
                >
                  締切管理の満足度
                </div>
              </div>
              <div
                className="rounded-lg border bg-white p-5"
                style={{ borderColor: "var(--lp-border-default)" }}
              >
                <div
                  className="mb-1 text-2xl tabular-nums text-[var(--lp-navy)]"
                  style={{ fontWeight: 600 }}
                >
                  60%
                </div>
                <div
                  className="text-xs text-[var(--lp-body-muted)] md:text-sm"
                  style={{ fontWeight: 500 }}
                >
                  管理作業の削減
                </div>
              </div>
            </div>
          </div>
          <div className="w-full lg:w-1/2">
            <Image
              src={landingMedia.calendar.src}
              alt={landingMedia.calendar.alt}
              width={800}
              height={540}
              className="w-full rounded-xl border bg-white"
              style={{
                borderColor: "var(--lp-border-default)",
                boxShadow: "var(--lp-shadow-screenshot)",
              }}
            />
          </div>
        </LandingSectionMotion>
      </div>
    </section>
  );
}
