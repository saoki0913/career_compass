import type { Page } from "@playwright/test";
import { apiRequest, apiRequestAsAuthenticatedUser } from "./auth";

type ResourceOwner = "guest" | "authenticated";

interface TrackedResource {
  type: string;
  id: string;
  endpoint: string;
  owner: ResourceOwner;
}

const DELETE_ENDPOINTS: Record<string, string> = {
  company: "/api/companies",
  document: "/api/documents",
  deadline: "/api/deadlines",
  application: "/api/applications",
  submission: "/api/submissions",
  task: "/api/tasks",
  gakuchika: "/api/gakuchika",
  notification: "/api/notifications",
};

export class TestResourceTracker {
  private resources: TrackedResource[] = [];

  track(type: string, id: string, owner: ResourceOwner = "guest"): void {
    const endpoint = DELETE_ENDPOINTS[type];
    if (!endpoint) {
      console.warn(`[cleanup] unknown resource type: ${type}, skipping tracking`);
      return;
    }
    this.resources.push({ type, id, endpoint, owner });
  }

  async cleanupAll(page: Page): Promise<void> {
    const reversed = [...this.resources].reverse();
    const remaining: TrackedResource[] = [];
    const failures: string[] = [];

    for (const resource of reversed) {
      try {
        const url = `${resource.endpoint}/${resource.id}`;
        if (resource.owner === "authenticated") {
          await apiRequestAsAuthenticatedUser(page, "DELETE", url);
        } else {
          await apiRequest(page, "DELETE", url);
        }
      } catch (error) {
        remaining.push(resource);
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${resource.type}:${resource.id} ${message}`);
      }
    }

    this.resources = remaining.reverse();
    if (failures.length > 0) {
      throw new Error(`E2E cleanup failed for ${failures.length} resource(s): ${failures.join("; ")}`);
    }
  }

  get count(): number {
    return this.resources.length;
  }
}
