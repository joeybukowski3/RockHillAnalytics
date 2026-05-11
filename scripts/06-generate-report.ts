import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "../src/lib/env.js";
import { findRestaurant } from "../src/lib/findRestaurant.js";
import { summarizePublicSentiment } from "../src/lib/sentiment.js";
import { RestaurantProfile } from "../src/types/restaurant.js";

const ROOT = process.cwd();
loadEnv();

function getIdentifierArg(): string {
  const identifier = process.argv.slice(2).join(" ").trim();

  if (!identifier) {
    throw new Error('Provide a restaurant name, slug, or Google Place ID. Example: npm run report -- "Restaurant Name"');
  }

  return identifier;
}

async function loadRestaurants(): Promise<RestaurantProfile[]> {
  const raw = await readFile(path.join(ROOT, "data", "restaurants.seed.json"), "utf8");
  return JSON.parse(raw) as RestaurantProfile[];
}

function listDataAvailability(restaurant: RestaurantProfile): string[] {
  const items = [
    restaurant.google ? "Google seed/detail data" : undefined,
    restaurant.google?.reviews?.length ? "Google reviews" : undefined,
    restaurant.facebookUrl || restaurant.facebook?.pageUrl ? "Facebook page URL" : undefined,
    restaurant.facebook?.recentPosts?.length ? "Facebook recent posts" : undefined,
    restaurant.instagramUrl || restaurant.instagram?.profileUrl
      ? "Instagram profile URL"
      : undefined,
    restaurant.instagram?.recentPosts?.length ? "Instagram recent posts" : undefined,
    restaurant.scores ? "Calculated score summary" : undefined
  ];

  return items.filter((item): item is string => Boolean(item));
}

function listMissingSteps(restaurant: RestaurantProfile): string[] {
  const missing: string[] = [];

  if (!restaurant.google?.reviews?.length) {
    missing.push("Run Google detail enrichment to capture recent reviews and opening hours.");
  }

  if (!restaurant.facebookUrl && !restaurant.facebook?.pageUrl) {
    missing.push("Find and verify the public Facebook page URL.");
  } else if (!(restaurant.facebook?.recentPosts?.length ?? 0)) {
    missing.push("Run Facebook enrichment to capture recent public page posts.");
  }

  if (!restaurant.instagramUrl && !restaurant.instagram?.profileUrl) {
    missing.push("Find and verify the public Instagram profile URL.");
  } else if (!(restaurant.instagram?.recentPosts?.length ?? 0)) {
    missing.push("Run Instagram enrichment to capture recent public profile posts.");
  }

  if (!restaurant.scores) {
    missing.push("Run scoring to calculate initial reputation, social, and opportunity scores.");
  }

  return missing;
}

function buildRecommendations(restaurant: RestaurantProfile): string[] {
  const recommendations: string[] = [];
  const rating = restaurant.google?.rating ?? 0;
  const reviewCount = restaurant.google?.reviewCount ?? 0;

  if (rating >= 4.3 && reviewCount >= 100) {
    recommendations.push("Use strong Google reputation as the lead proof point in marketing.");
  }

  if (!restaurant.facebookUrl && !restaurant.instagramUrl) {
    recommendations.push("Prioritize public social profile discovery and consistent branding.");
  }

  if ((restaurant.google?.reviews?.length ?? 0) === 0) {
    recommendations.push("Enrich Google details to capture recent review themes.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Expand enrichment coverage before making strategy recommendations.");
  }

  return recommendations;
}

function getLatestPostDate(posts: NonNullable<RestaurantProfile["facebook"]>["recentPosts"] | NonNullable<RestaurantProfile["instagram"]>["recentPosts"]): string {
  const latest = (posts ?? [])
    .map((post) => post.publishedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return latest ?? "n/a";
}

function getEngagementSummary(posts: RestaurantProfile["facebook"] extends infer F ? any : never): string {
  if (!posts?.length) {
    return "n/a";
  }

  const totals = posts.reduce(
    (acc: { likes: number; comments: number; shares: number; views: number }, post: any) => ({
      likes: acc.likes + (post.engagement?.likes ?? 0),
      comments: acc.comments + (post.engagement?.comments ?? 0),
      shares: acc.shares + (post.engagement?.shares ?? 0),
      views: acc.views + (post.engagement?.views ?? 0)
    }),
    { likes: 0, comments: 0, shares: 0, views: 0 }
  );

  return `likes ${totals.likes}, comments ${totals.comments}, shares ${totals.shares}, views ${totals.views}`;
}

function toMarkdown(restaurant: RestaurantProfile): string {
  const availability = listDataAvailability(restaurant);
  const missing = listMissingSteps(restaurant);
  const recommendations = buildRecommendations(restaurant);
  const sentiment = summarizePublicSentiment(restaurant.google?.reviews ?? []);

  return `# Restaurant Intelligence Report

## Snapshot

- Name: ${restaurant.name}
- Location: ${restaurant.city}, ${restaurant.state}
- Address: ${restaurant.address ?? "n/a"}
- Category: ${restaurant.category ?? "n/a"}
- Status: ${restaurant.status}
- Pipeline stage: ${restaurant.pipelineStage ?? "seeded"}
- Google Place ID: ${restaurant.googlePlaceId ?? "n/a"}

## Google Profile

- Rating: ${restaurant.google?.rating ?? "n/a"}
- Review count: ${restaurant.google?.reviewCount ?? "n/a"}
- Website: ${restaurant.website ?? "n/a"}
- Phone: ${restaurant.phone ?? "n/a"}
- Google Maps URL: ${restaurant.googleMapsUrl ?? restaurant.google?.mapsUrl ?? "n/a"}
- Opening hours: ${
    restaurant.google?.openingHours?.length
      ? restaurant.google.openingHours.join("; ")
      : "n/a"
  }
- Sentiment summary: ${sentiment}

## Social Presence

- Facebook URL: ${restaurant.facebookUrl ?? restaurant.facebook?.pageUrl ?? "n/a"}
- Facebook status: ${restaurant.socialProfileStatus?.facebook ?? "unknown"}
- Facebook recent post count: ${restaurant.facebook?.recentPosts?.length ?? 0}
- Facebook latest post date: ${getLatestPostDate(restaurant.facebook?.recentPosts)}
- Facebook engagement summary: ${getEngagementSummary(restaurant.facebook?.recentPosts)}
- Instagram URL: ${restaurant.instagramUrl ?? restaurant.instagram?.profileUrl ?? "n/a"}
- Instagram status: ${restaurant.socialProfileStatus?.instagram ?? "unknown"}
- Instagram recent post count: ${restaurant.instagram?.recentPosts?.length ?? 0}
- Instagram latest post date: ${getLatestPostDate(restaurant.instagram?.recentPosts)}
- Instagram engagement summary: ${getEngagementSummary(restaurant.instagram?.recentPosts)}
- TikTok URL: ${restaurant.tiktokUrl ?? "n/a"}
- TikTok status: ${restaurant.socialProfileStatus?.tiktok ?? "unknown"}

## Scores

- Reputation: ${restaurant.scores?.reputation ?? "n/a"}
- Social Presence: ${restaurant.scores?.socialPresence ?? "n/a"}
- Opportunity: ${restaurant.scores?.opportunity ?? "n/a"}
- Overall: ${restaurant.scores?.overall ?? "n/a"}

## Current Data Available

${availability.length ? availability.map((item) => `- ${item}`).join("\n") : "- No enriched data yet."}

## Missing Data / Next Enrichment Steps

${missing.length ? missing.map((item) => `- ${item}`).join("\n") : "- No major gaps identified in Phase 1 data."}

## Review Notes

${restaurant.reviewNotes.length ? restaurant.reviewNotes.map((item) => `- ${item}`).join("\n") : "- No review notes recorded."}

## Social Verification Notes

${restaurant.socialVerificationNotes?.length ? restaurant.socialVerificationNotes.map((item) => `- ${item}`).join("\n") : "- No social verification notes recorded."}

## Initial Recommendations

${recommendations.map((item) => `- ${item}`).join("\n")}
`;
}

async function main(): Promise<void> {
  const identifier = getIdentifierArg();
  const restaurants = await loadRestaurants();
  const { restaurant } = findRestaurant(restaurants, identifier);
  const reportsDir = path.join(ROOT, "reports");
  const reportPath = path.join(reportsDir, `${restaurant.slug}.md`);

  await mkdir(reportsDir, { recursive: true });
  await writeFile(reportPath, toMarkdown(restaurant), "utf8");

  console.log(`Report generated: ${reportPath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`report failed: ${message}`);
  process.exit(1);
});
