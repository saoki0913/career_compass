"use client";

import type { DashboardTask, TodayTaskData } from "@/lib/dto/dashboard";
import { useTasks, useTodayTask } from "@/hooks/useTasks";
import { TodayTasksCard } from "@/components/dashboard/TodayTasksCard";
import { DashboardTasksSkeleton } from "@/components/skeletons/DashboardSkeleton";

type DashboardTasksZoneProps = {
  initialTodayTask?: TodayTaskData;
  initialOpenTasks?: DashboardTask[];
};

export function DashboardTasksZone({
  initialTodayTask,
  initialOpenTasks,
}: DashboardTasksZoneProps) {
  const todayTask = useTodayTask(initialTodayTask ? { initialData: initialTodayTask } : {});
  const {
    tasks: openTasks,
    isLoading: openTasksLoading,
    refresh: refreshOpenTasks,
    toggleComplete,
  } = useTasks(initialOpenTasks !== undefined ? { status: "open", initialData: initialOpenTasks } : { status: "open" });

  const handleCompleteTodayTask = async () => {
    const completed = await todayTask.markComplete();
    if (completed) {
      await refreshOpenTasks();
    }
    return completed;
  };

  const isTodayTasksLoading =
    (todayTask.isLoading && !initialTodayTask) || (openTasksLoading && initialOpenTasks === undefined);

  if (isTodayTasksLoading) {
    return <DashboardTasksSkeleton />;
  }

  return (
    <TodayTasksCard
      todayTask={todayTask}
      openTasks={openTasks}
      maxOpenTasks={5}
      onCompleteTodayTask={handleCompleteTodayTask}
      onToggleTask={toggleComplete}
    />
  );
}

