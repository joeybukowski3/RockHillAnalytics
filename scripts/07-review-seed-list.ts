import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { RestaurantProfile } from "../src/types/restaurant.js";
import {
  applySeedReview,
  findPossibleDuplicates,
  isOutsideRockHill
} from "../src/lib/seedReview.js";

const ROOT = process.cwd();

async function loadRestaurants(): Promise<RestaurantProfile[]> {
  const raw = await readFile(path.join(ROOT, "data", "restaurants.seed.json"), "utf8");
  return JSON.parse(raw) as RestaurantProfile[];
}

async function loadLatestSourceQueryMap(): Promise<Map<string, string[]>> {
  const rawDir = path.join(ROOT, "data", "raw", "google");
  const fs = await import("node:fs/promises");
  let latestFile: string | undefined;

  try {
    const entries = await fs.readdir(rawDir, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith("rock-hill-search.json"))
      .map((entry) => entry.name)
      .sort()
      .reverse();

    latestFile = candidates[0];
  } catch {
    return new Map();
  }

  if (!latestFile) {
    return new Map();
  }

  const raw = await readFile(path.join(rawDir, latestFile), "utf8");
  const payload = JSON.parse(raw) as {
    queries?: Array<{
      query: string;
      response?: { results?: Array<{ place_id: string }> };
    }>;
  };

  const sourceQueriesByPlaceId = new Map<string, string[]>();

  for (const entry of payload.queries ?? []) {
    for (const place of entry.response?.results ?? []) {
      const existing = sourceQueriesByPlaceId.get(place.place_id) ?? [];
      existing.push(entry.query);
      sourceQueriesByPlaceId.set(place.place_id, Array.from(new Set(existing)));
    }
  }

  return sourceQueriesByPlaceId;
}

function summarizeByStatus(restaurants: RestaurantProfile[]): Record<string, number> {
  return restaurants.reduce<Record<string, number>>((acc, restaurant) => {
    acc[restaurant.status] = (acc[restaurant.status] ?? 0) + 1;
    return acc;
  }, {});
}

async function main(): Promise<void> {
  const restaurants = await loadRestaurants();
  const sourceQueriesByPlaceId = await loadLatestSourceQueryMap();
  const hydrated = restaurants.map((restaurant) => ({
    ...restaurant,
    sourceQueries: Array.from(
      new Set([
        ...(restaurant.sourceQueries ?? []),
        ...(restaurant.googlePlaceId
          ? sourceQueriesByPlaceId.get(restaurant.googlePlaceId) ?? []
          : [])
      ])
    ),
    reviewNotes: restaurant.reviewNotes ?? [],
    pipelineStage: restaurant.pipelineStage ?? "seeded"
  }));

  const reviewed = applySeedReview(hydrated);
  await writeFile(
    path.join(ROOT, "data", "restaurants.seed.json"),
    JSON.stringify(reviewed, null, 2),
    "utf8"
  );

  const summary = summarizeByStatus(reviewed);
  const needsReview = reviewed
    .filter((restaurant) => restaurant.status === "needs_review")
    .sort((a, b) => a.name.localeCompare(b.name));
  const duplicates = findPossibleDuplicates(reviewed);
  const outsideRockHill = reviewed.filter(isOutsideRockHill).sort((a, b) => a.name.localeCompare(b.name));

  console.log(`Total restaurants: ${reviewed.length}`);
  console.log(`Included count: ${summary.included ?? 0}`);
  console.log(`Needs_review count: ${summary.needs_review ?? 0}`);
  console.log(`Excluded count: ${summary.excluded ?? 0}`);
  console.log(`Closed count: ${summary.closed ?? 0}`);

  console.log("\nTop 25 needing manual review:");
  for (const restaurant of needsReview.slice(0, 25)) {
    console.log(`- ${restaurant.name} | ${restaurant.address ?? "n/a"} | ${restaurant.reviewNotes.join("; ")}`);
  }

  console.log("\nPossible duplicates:");
  for (const group of duplicates) {
    const entries = group.restaurants
      .map((restaurant) => `${restaurant.name} (${restaurant.address ?? "n/a"})`)
      .join(" | ");
    console.log(`- ${group.key}: ${entries}`);
  }

  console.log("\nBusinesses outside Rock Hill:");
  for (const restaurant of outsideRockHill) {
    console.log(`- ${restaurant.name} | ${restaurant.address ?? "n/a"} | ${restaurant.status}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`review:seed failed: ${message}`);
  process.exit(1);
});
