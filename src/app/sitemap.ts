import type { MetadataRoute } from "next";
import { getAppUrl } from "@/lib/app-url";

const siteUrl = getAppUrl();

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${siteUrl}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/es-tensaku-ai`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/shukatsu-ai`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/ai-mensetsu`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/shiboudouki-ai`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/gakuchika-ai`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${siteUrl}/entry-sheet-ai`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${siteUrl}/es-ai-guide`, lastModified: now, changeFrequency: "weekly", priority: 0.75 },
    { url: `${siteUrl}/shukatsu-kanri`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/tools`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${siteUrl}/tools/es-counter`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${siteUrl}/templates`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${siteUrl}/templates/shiboudouki`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${siteUrl}/templates/gakuchika-star`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${siteUrl}/checklists`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${siteUrl}/checklists/deadline-management`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${siteUrl}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${siteUrl}/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
    { url: `${siteUrl}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
    { url: `${siteUrl}/legal`, lastModified: now, changeFrequency: "monthly", priority: 0.2 },
    { url: `${siteUrl}/data-source-policy`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
}
