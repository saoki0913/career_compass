import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getHeadersIdentity } from "@/app/api/_shared/request-identity";
import { getDeadlinesDashboardData } from "@/lib/server/deadline-loaders";
import { DeadlinesDashboardClient } from "@/components/deadlines/DeadlinesDashboardClient";

export default async function DeadlinesPage() {
  const requestHeaders = await headers();
  const [session, identity] = await Promise.all([
    auth.api.getSession({ headers: requestHeaders }),
    getHeadersIdentity(requestHeaders),
  ]);

  const canPreload = Boolean(session?.user?.id && identity);
  const initialData = canPreload
    ? await getDeadlinesDashboardData(identity!)
    : undefined;

  return <DeadlinesDashboardClient initialData={initialData} />;
}
