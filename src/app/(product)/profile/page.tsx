import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getHeadersIdentity } from "@/app/api/_shared/request-identity";
import { getProfilePageData } from "@/lib/server/account-loaders";

const ArrowLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  </svg>
);

const ChartIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
    />
  </svg>
);

const CreditIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const GraduationCapIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 14l9-5-9-5-9 5 9 5z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
    />
  </svg>
);

const BuildingIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const PLAN_LABELS: Record<string, string> = {
  free: "フリープラン",
  standard: "スタンダードプラン",
  pro: "プロプラン",
};

export default async function ProfilePage() {
  const requestHeaders = await headers();
  const identity = await getHeadersIdentity(requestHeaders);

  if (!identity || !identity.userId) {
    redirect("/login?redirect=/profile");
  }

  const profileData = await getProfilePageData(identity.userId);

  const profile = profileData?.profile ?? {
    name: "",
    email: "",
    image: null,
    plan: "free",
    university: null,
    faculty: null,
    graduationYear: null,
    targetIndustries: [],
    targetJobTypes: [],
    createdAt: null,
    creditsBalance: 0,
  };
  const companyCount = profileData?.companyCount ?? 0;
  const draftCount = profileData?.esStats.draftCount ?? 0;
  const publishedCount = profileData?.esStats.publishedCount ?? 0;
  const esTotal = profileData?.esStats.total ?? 0;

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "不明";
    const date = new Date(dateString);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon />
          ダッシュボードへ戻る
        </Link>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <UserIcon />
              <CardTitle>プロフィール</CardTitle>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings" className="flex items-center gap-1.5">
                <SettingsIcon />
                設定を編集
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {profile.image ? (
                <img
                  src={profile.image}
                  alt=""
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-full object-cover ring-4 ring-muted"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary ring-4 ring-muted">
                  {(profile.name || "U").charAt(0)}
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold">{profile.name || "名前未設定"}</h2>
                <p className="text-muted-foreground">{profile.email || "不明"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  利用開始: {formatDate(profile.createdAt)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ChartIcon />
                <CardTitle className="text-base">利用状況</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">登録企業</span>
                <span className="font-semibold">{companyCount} 社</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">ES作成数</span>
                <span className="font-semibold">{esTotal} 件</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="pl-4 text-muted-foreground">- 完了</span>
                <span>{publishedCount} 件</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="pl-4 text-muted-foreground">- 下書き</span>
                <span>{draftCount} 件</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditIcon />
                <CardTitle className="text-base">プラン</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">現在のプラン</span>
                <span className="font-semibold text-primary">
                  {PLAN_LABELS[profile.plan || "free"] || "フリープラン"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">クレジット残高</span>
                <span className="font-semibold">{profile.creditsBalance?.toLocaleString() ?? "---"}</span>
              </div>
              <div className="pt-2">
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href="/pricing">プランを変更</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <GraduationCapIcon />
              <CardTitle className="text-base">学歴情報</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">大学</span>
              <span className={profile.university ? "font-medium" : "text-muted-foreground"}>
                {profile.university || "未設定"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">学部・学科</span>
              <span className={profile.faculty ? "font-medium" : "text-muted-foreground"}>
                {profile.faculty || "未設定"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">卒業予定</span>
              <span className={profile.graduationYear ? "font-medium" : "text-muted-foreground"}>
                {profile.graduationYear ? `${profile.graduationYear}年3月` : "未設定"}
              </span>
            </div>
            {(!profile.university || !profile.faculty || !profile.graduationYear) && (
              <div className="pt-2">
                <Link href="/settings" className="text-sm text-primary hover:underline">
                  設定画面で学歴情報を入力する →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BuildingIcon />
              <CardTitle className="text-base">志望情報</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">志望業界</p>
              {profile.targetIndustries.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.targetIndustries.map((industry) => (
                    <span key={industry} className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
                      {industry}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">未設定</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm text-muted-foreground">志望職種</p>
              {profile.targetJobTypes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.targetJobTypes.map((jobType) => (
                    <span key={jobType} className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-700">
                      {jobType}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">未設定</p>
              )}
            </div>
            {(profile.targetIndustries.length === 0 || profile.targetJobTypes.length === 0) && (
              <div className="pt-2">
                <Link href="/settings" className="text-sm text-primary hover:underline">
                  設定画面で志望情報を入力する →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
