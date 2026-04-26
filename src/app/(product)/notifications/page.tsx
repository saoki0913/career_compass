import { headers } from "next/headers";
import { getHeadersIdentity } from "@/app/api/_shared/request-identity";
import { getNotificationsPageData } from "@/lib/server/notification-loaders";
import { NotificationsPageClient } from "@/components/notifications/NotificationsPageClient";

export default async function NotificationsPage() {
  const requestHeaders = await headers();
  const identity = await getHeadersIdentity(requestHeaders);
  const initialData = await getNotificationsPageData(identity, 50);

  return (
    <div className="min-h-screen bg-background">
      <NotificationsPageClient initialData={initialData} />
    </div>
  );
}
