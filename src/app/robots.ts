import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/app-url";

const siteUrl = getAppUrl();

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/es-tensaku-ai",
          "/shukatsu-ai",
          "/entry-sheet-ai",
          "/es-ai-guide",
          "/shukatsu-kanri",
          "/pricing",
          "/tools",
          "/tools/",
          "/templates",
          "/templates/",
          "/checklists",
          "/checklists/",
          "/terms",
          "/privacy",
          "/contact",
          "/legal",
        ],
        disallow: [
          "/api/",
          "/dashboard",
          "/companies",
          "/es",
          "/tasks",
          "/calendar",
          "/settings",
          "/profile",
          "/notifications",
          "/search",
          "/login",
          "/onboarding",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
