import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
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
          "/waitlist",
          "/login",
          "/onboarding",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
