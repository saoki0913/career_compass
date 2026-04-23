import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getHeadersIdentity } from "@/app/api/_shared/request-identity";
import { getDeadlinesDashboardData } from "@/lib/server/deadline-loaders";
import { safeLoad } from "@/lib/server/safe-loader";
import { DeadlinesDashboardClient } from "@/components/deadlines/DeadlinesDashboardClient";

export default async function DeadlinesPage() {
  const requestHeaders = await headers();
  const [session, identity] = await Promise.all([
    auth.api.getSession({ headers: requestHeaders }),
    getHeadersIdentity(requestHeaders),
  ]);

  const canPreload = Boolean(session?.user?.id && identity);
  const result = canPreload
    ? await safeLoad("deadlines", () => getDeadlinesDashboardData(identity!))
    : null;

  return <DeadlinesDashboardClient initialData={result?.data ?? undefined} />;
}
