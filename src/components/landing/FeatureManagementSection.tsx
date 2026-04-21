import { LandingSectionMotion } from "./LandingSectionMotion";
import { LandingCheckList } from "./shared/LandingCheckList";
import { ScaleFit } from "./mocks/ScaleFit";
import { CalendarMock } from "./mocks/CalendarMock";

export function FeatureManagementSection() {
  return (
    <section className="bg-white px-6 py-24 md:py-32">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col items-center gap-12 lg:flex-row-reverse lg:gap-20">
          <LandingSectionMotion className="w-full lg:w-1/2">
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
            <LandingCheckList
              items={[
                "企業ごとの選考状況をカンバンで一覧管理",
                "締切をカレンダーで可視化、通知でリマインド",
                "Googleカレンダーとワンクリック同期",
              ]}
            />
          </LandingSectionMotion>

          <LandingSectionMotion className="w-full lg:w-1/2">
            <ScaleFit
              naturalWidth={1040}
              className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_8px_40px_rgba(0,0,0,0.06)]"
            >
              <CalendarMock />
            </ScaleFit>
          </LandingSectionMotion>
        </div>
      </div>
    </section>
  );
}
