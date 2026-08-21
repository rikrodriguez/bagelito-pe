import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

const routes = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/checkout", changeFrequency: "weekly", priority: 0.95 },
  { path: "/reserve", changeFrequency: "weekly", priority: 0.9 },
  { path: "/waitlist", changeFrequency: "weekly", priority: 0.85 },
  { path: "/libro-de-reclamaciones", changeFrequency: "yearly", priority: 0.5 },
  { path: "/legal", changeFrequency: "yearly", priority: 0.4 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return routes.map((route) => ({
    url: new URL(route.path, siteUrl).toString(),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
