import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { summarizePublicSentiment } from "../src/lib/sentiment.js";
import { RestaurantProfile } from "../src/types/restaurant.js";

const ROOT = process.cwd();

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

function findRestaurant(restaurants: RestaurantProfile[], identifier: string): RestaurantProfile {
  const lowered = identifier.toLowerCase();
  const match = restaurants.find(
    (restaurant) =>
      restaurant.googlePlaceId === identifier ||
      restaurant.slug.toLowerCase() === lowered ||
      restaurant.name.toLowerCase() === lowered
  );

  if (!match) {
    throw new Error(`No restaurant matched "${identifier}" in data/restaurants.seed.json.`);
  }

  return match;
}

function listDataAvailability(restaurant: RestaurantProfile): string[] {
  const items = [
    restaurant.google ? "Google seed/detail data" : undefined,
    restaurant.google?.reviews?.length ? "Google reviews" : undefined,
    restaurant.facebookUrl || restaurant.facebook?.pageUrl ? "Facebook page URL" : undefined,
    restaurant.instagramUrl || restaurant.instagram?.profileUrl
      ? "Instagram profile URL"
      : undefined,
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
  }

  if (!restaurant.instagramUrl && !restaurant.instagram?.profileUrl) {
    missing.push("Find and verify the public Instagram profile URL.");
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

## Scores

- Reputation: ${restaurant.scores?.reputation ?? "n/a"}
- Social Presence: ${restaurant.scores?.socialPresence ?? "n/a"}
- Opportunity: ${restaurant.scores?.opportunity ?? "n/a"}
- Overall: ${restaurant.scores?.overall ?? "n/a"}

## Current Data Available

${availability.length ? availability.map((item) => `- ${item}`).join("\n") : "- No enriched data yet."}

## Missing Data / Next Enrichment Steps

${missing.length ? missing.map((item) => `- ${item}`).join("\n") : "- No major gaps identified in Phase 1 data."}

## Initial Recommendations

${recommendations.map((item) => `- ${item}`).join("\n")}
`;
}

async function main(): Promise<void> {
  const identifier = getIdentifierArg();
  const restaurants = await loadRestaurants();
  const restaurant = findRestaurant(restaurants, identifier);
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
