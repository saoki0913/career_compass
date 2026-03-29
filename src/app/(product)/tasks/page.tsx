import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getHeadersIdentity } from "@/app/api/_shared/request-identity";
import { getTodayTaskData } from "@/lib/server/app-loaders";
import { getTasksPageData } from "@/lib/server/task-loaders";
import { TasksPageClient } from "@/components/tasks/TasksPageClient";

export default async function TasksPage() {
  const requestHeaders = await headers();
  const [session, identity] = await Promise.all([
    auth.api.getSession({ headers: requestHeaders }),
    getHeadersIdentity(requestHeaders),
  ]);

  const canPreload = Boolean(session?.user?.id && identity);
  const [initialTasks, initialTodayTask] = canPreload
    ? await Promise.all([getTasksPageData(identity!, { status: "all" }), getTodayTaskData(identity!)])
    : [null, null];

  return (
    <TasksPageClient
      initialTasks={initialTasks?.tasks}
      initialTodayTask={initialTodayTask ?? undefined}
    />
  );
}
