import { Check } from "lucide-react";
import Image from "next/image";
import { landingMedia } from "./landing-media";
import { LandingSectionMotion } from "./LandingSectionMotion";

export function FeatureManagementSection() {
  return (
    <section className="bg-white px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col items-center gap-12 lg:flex-row-reverse lg:gap-20">
          <LandingSectionMotion className="lg:w-1/2">
            <p className="mb-3 text-sm text-slate-400" style={{ fontWeight: 600 }}>
              進捗・スケジュール管理
            </p>
            <h3
              className="mb-4 text-2xl tracking-tight text-[var(--lp-navy)] md:text-[2rem]"
              style={{ fontWeight: 800, lineHeight: 1.3 }}
            >
              進捗と締切を、一目で把握。
            </h3>
            <p className="mb-8 text-slate-500" style={{ lineHeight: 1.8 }}>
              企業一覧、締切、応募状況、Googleカレンダー連携まで。情報が散らばらないから、やるべきことに集中できます。
            </p>
            <ul className="space-y-3">
              {[
                "企業ごとの選考状況をカンバンで一覧管理",
                "締切をカレンダーで可視化、通知でリマインド",
                "Googleカレンダーとワンクリック同期",
              ].map((text) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--lp-navy)]">
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </span>
                  <span className="text-sm text-slate-600" style={{ fontWeight: 500, lineHeight: 1.6 }}>{text}</span>
                </li>
              ))}
            </ul>
          </LandingSectionMotion>

          <LandingSectionMotion className="lg:w-1/2">
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.06)]">
              <Image
                src={landingMedia.calendar.src}
                alt={landingMedia.calendar.alt}
                width={800}
                height={540}
                className="block w-full"
              />
            </div>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
