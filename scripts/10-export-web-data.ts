import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyWorkflowMetadata, getWorkflowSnapshot } from "../src/lib/workflow.js";
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
  socialReviewStatus?: string;
  workflowStage?: string;
  nextAction: string;
  dataCompletenessScore: number;
  missingData: string[];
  readyForReport: boolean;
  suggestedCommands: string[];
  lastGoogleEnrichedAt?: string;
  lastSocialReviewedAt?: string;
  lastSocialEnrichedAt?: string;
  lastScoredAt?: string;
  duplicateReviewStatus?: RestaurantProfile["duplicateReviewStatus"];
  duplicateReviewNotes: string[];
  duplicateGroupKey?: string;
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
  socialReviewNotes: string[];
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
  const normalizedRestaurant = applyWorkflowMetadata({
    ...restaurant,
    pipelineStage: reportPath || restaurant.pipelineStage === "reported" ? "reported" : restaurant.pipelineStage
  });
  const snapshot = getWorkflowSnapshot(normalizedRestaurant);

  return {
    id: normalizedRestaurant.id,
    name: normalizedRestaurant.name,
    slug: normalizedRestaurant.slug,
    city: normalizedRestaurant.city,
    state: normalizedRestaurant.state,
    category: normalizedRestaurant.category,
    address: normalizedRestaurant.address,
    phone: normalizedRestaurant.phone,
    website: normalizedRestaurant.website,
    googlePlaceId: normalizedRestaurant.googlePlaceId,
    googleMapsUrl: normalizedRestaurant.googleMapsUrl,
    reviewStatus: normalizedRestaurant.reviewStatus ?? normalizedRestaurant.status,
    pipelineStage: normalizedRestaurant.pipelineStage,
    socialEnrichmentStatus: normalizedRestaurant.socialEnrichmentStatus,
    socialReviewStatus: normalizedRestaurant.socialReviewStatus,
    workflowStage: snapshot.workflowStage,
    nextAction: snapshot.nextAction,
    dataCompletenessScore: snapshot.dataCompletenessScore,
    missingData: snapshot.missingData,
    readyForReport: snapshot.readyForReport,
    suggestedCommands: snapshot.suggestedCommands,
    lastGoogleEnrichedAt: normalizedRestaurant.lastGoogleEnrichedAt,
    lastSocialReviewedAt: normalizedRestaurant.lastSocialReviewedAt,
    lastSocialEnrichedAt: normalizedRestaurant.lastSocialEnrichedAt,
    lastScoredAt: normalizedRestaurant.lastScoredAt,
    duplicateReviewStatus: normalizedRestaurant.duplicateReviewStatus,
    duplicateReviewNotes: normalizedRestaurant.duplicateReviewNotes ?? [],
    duplicateGroupKey: normalizedRestaurant.duplicateGroupKey,
    google: normalizedRestaurant.google
      ? {
          rating: normalizedRestaurant.google.rating,
          reviewCount: normalizedRestaurant.google.reviewCount,
          businessStatus: normalizedRestaurant.google.businessStatus,
          openingHours: normalizedRestaurant.google.openingHours
        }
      : undefined,
    facebookUrl: normalizedRestaurant.facebookUrl,
    instagramUrl: normalizedRestaurant.instagramUrl,
    tiktokUrl: normalizedRestaurant.tiktokUrl,
    socialProfileStatus: normalizedRestaurant.socialProfileStatus,
    facebook: normalizedRestaurant.facebook
      ? {
          pageUrl: normalizedRestaurant.facebook.pageUrl,
          postCount: normalizedRestaurant.facebook.postCount,
          latestPostDate: getLatestPostDate(normalizedRestaurant.facebook.recentPosts),
          recentPostCount: normalizedRestaurant.facebook.recentPosts?.length ?? 0
        }
      : undefined,
    instagram: normalizedRestaurant.instagram
      ? {
          profileUrl: normalizedRestaurant.instagram.profileUrl,
          followers: normalizedRestaurant.instagram.followers,
          postCount: normalizedRestaurant.instagram.postCount,
          latestPostDate: getLatestPostDate(normalizedRestaurant.instagram.recentPosts),
          recentPostCount: normalizedRestaurant.instagram.recentPosts?.length ?? 0
        }
      : undefined,
    scores: normalizedRestaurant.scores,
    reviewNotes: normalizedRestaurant.reviewNotes ?? [],
    socialVerificationNotes: normalizedRestaurant.socialVerificationNotes ?? [],
    socialReviewNotes: normalizedRestaurant.socialReviewNotes ?? [],
    socialEnrichmentNotes: normalizedRestaurant.socialEnrichmentNotes ?? [],
    reportPath,
    reportExists: Boolean(reportPath),
    updatedAt: normalizedRestaurant.updatedAt
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
