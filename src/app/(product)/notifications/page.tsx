import { getNotificationsPageData } from "@/lib/server/notification-loaders";
import { NotificationsPageClient } from "@/components/notifications/NotificationsPageClient";
import { resolvePageIdentity } from "@/lib/server/page-identity";

export default async function NotificationsPage() {
  const identityResult = await resolvePageIdentity("notifications-page");
  const initialData =
    identityResult.status === "ready"
      ? await getNotificationsPageData(identityResult.identity, 50)
      : { notifications: [], unreadCount: 0 };

  return (
    <div className="min-h-screen bg-background">
      <NotificationsPageClient initialData={initialData} />
    </div>
  );
}
