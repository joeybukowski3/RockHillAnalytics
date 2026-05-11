import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { RestaurantProfile } from "../src/types/restaurant.js";

const ROOT = process.cwd();

type DashboardRestaurant = {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  googlePlaceId?: string;
  googleMapsUrl?: string;
  reviewStatus: string;
  pipelineStage?: string;
  socialEnrichmentStatus?: string;
  google?: {
    rating?: number;
    reviewCount?: number;
    businessStatus?: string;
    openingHours?: string[];
  };
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  socialProfileStatus?: RestaurantProfile["socialProfileStatus"];
  facebook?: {
    pageUrl?: string;
    postCount?: number;
    latestPostDate?: string;
    recentPostCount: number;
  };
  instagram?: {
    profileUrl?: string;
    followers?: number;
    postCount?: number;
    latestPostDate?: string;
    recentPostCount: number;
  };
  scores?: RestaurantProfile["scores"];
  reviewNotes: string[];
  socialVerificationNotes: string[];
  socialEnrichmentNotes: string[];
  reportPath?: string;
  reportExists: boolean;
  updatedAt: string;
};

function getLatestPostDate(posts?: RestaurantProfile["facebook"] extends infer _ ? any[] : never): string | undefined {
  if (!posts?.length) {
    return undefined;
  }

  return posts
    .map((post) => post.publishedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
}

async function loadRestaurants(): Promise<RestaurantProfile[]> {
  const raw = await readFile(path.join(ROOT, "data", "restaurants.seed.json"), "utf8");
  return JSON.parse(raw) as RestaurantProfile[];
}

async function getReportMap(): Promise<Map<string, string>> {
  const reportsDir = path.join(ROOT, "reports");
  const entries = await readdir(reportsDir, { withFileTypes: true });
  const map = new Map<string, string>();

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      map.set(entry.name.replace(/\.md$/i, ""), `/reports/${entry.name}`);
    }
  }

  return map;
}

function toDashboardRestaurant(
  restaurant: RestaurantProfile,
  reportMap: Map<string, string>
): DashboardRestaurant {
  const reportPath = reportMap.get(restaurant.slug);

  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    city: restaurant.city,
    state: restaurant.state,
    category: restaurant.category,
    address: restaurant.address,
    phone: restaurant.phone,
    website: restaurant.website,
    googlePlaceId: restaurant.googlePlaceId,
    googleMapsUrl: restaurant.googleMapsUrl,
    reviewStatus: restaurant.reviewStatus ?? restaurant.status,
    pipelineStage: restaurant.pipelineStage,
    socialEnrichmentStatus: restaurant.socialEnrichmentStatus,
    google: restaurant.google
      ? {
          rating: restaurant.google.rating,
          reviewCount: restaurant.google.reviewCount,
          businessStatus: restaurant.google.businessStatus,
          openingHours: restaurant.google.openingHours
        }
      : undefined,
    facebookUrl: restaurant.facebookUrl,
    instagramUrl: restaurant.instagramUrl,
    tiktokUrl: restaurant.tiktokUrl,
    socialProfileStatus: restaurant.socialProfileStatus,
    facebook: restaurant.facebook
      ? {
          pageUrl: restaurant.facebook.pageUrl,
          postCount: restaurant.facebook.postCount,
          latestPostDate: getLatestPostDate(restaurant.facebook.recentPosts),
          recentPostCount: restaurant.facebook.recentPosts?.length ?? 0
        }
      : undefined,
    instagram: restaurant.instagram
      ? {
          profileUrl: restaurant.instagram.profileUrl,
          followers: restaurant.instagram.followers,
          postCount: restaurant.instagram.postCount,
          latestPostDate: getLatestPostDate(restaurant.instagram.recentPosts),
          recentPostCount: restaurant.instagram.recentPosts?.length ?? 0
        }
      : undefined,
    scores: restaurant.scores,
    reviewNotes: restaurant.reviewNotes ?? [],
    socialVerificationNotes: restaurant.socialVerificationNotes ?? [],
    socialEnrichmentNotes: restaurant.socialEnrichmentNotes ?? [],
    reportPath,
    reportExists: Boolean(reportPath),
    updatedAt: restaurant.updatedAt
  };
}

async function copyReports(): Promise<void> {
  const sourceDir = path.join(ROOT, "reports");
  const targetDir = path.join(ROOT, "public", "reports");

  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true, force: true });
}

async function main(): Promise<void> {
  const restaurants = await loadRestaurants();
  const reportMap = await getReportMap();
  const dashboardRestaurants = restaurants.map((restaurant) =>
    toDashboardRestaurant(restaurant, reportMap)
  );

  await mkdir(path.join(ROOT, "public", "data"), { recursive: true });
  await copyReports();

  await writeFile(
    path.join(ROOT, "public", "data", "restaurants.json"),
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        totalRestaurants: dashboardRestaurants.length,
        restaurants: dashboardRestaurants
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    `Exported ${dashboardRestaurants.length} restaurants to public/data/restaurants.json`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`export:web-data failed: ${message}`);
  process.exit(1);
});
