import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPlaceDetails } from "../src/apis/googlePlaces.js";
import { loadEnv } from "../src/lib/env.js";
import { applyGoogleDetailEnrichment } from "../src/lib/googleEnrichment.js";
import { RestaurantProfile } from "../src/types/restaurant.js";

const ROOT = process.cwd();
const DEFAULT_LIMIT = 10;
const REQUEST_DELAY_MS = 900;

loadEnv();

type BatchOptions = {
  limit: number;
  dryRun: boolean;
  confirm: boolean;
  status: "included";
  startAfter?: string;
};

function parseArgs(argv: string[]): BatchOptions {
  const args = [...argv];
  let limit = DEFAULT_LIMIT;
  let dryRun = false;
  let confirm = false;
  let status: "included" = "included";
  let startAfter: string | undefined;

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === "--limit") {
      const rawValue = args.shift();
      const parsed = Number(rawValue);
      if (!rawValue || !Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('Invalid --limit value. Example: npm run batch:google -- --limit 10 --dry-run');
      }
      limit = Math.floor(parsed);
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--confirm") {
      confirm = true;
      continue;
    }

    if (arg === "--status") {
      const rawStatus = args.shift()?.trim();
      if (rawStatus !== "included") {
        throw new Error('Only --status included is supported in Phase 4.');
      }
      status = "included";
      continue;
    }

    if (arg === "--start-after") {
      const value = args.shift()?.trim();
      if (!value) {
        throw new Error('Missing value for --start-after. Example: --start-after "Big Wok II"');
      }
      startAfter = value;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!confirm) {
    dryRun = true;
  }

  return { limit, dryRun, confirm, status, startAfter };
}

async function loadRestaurants(): Promise<RestaurantProfile[]> {
  const seedPath = path.join(ROOT, "data", "restaurants.seed.json");
  const raw = await readFile(seedPath, "utf8");
  return JSON.parse(raw) as RestaurantProfile[];
}

async function saveRestaurants(restaurants: RestaurantProfile[]): Promise<void> {
  const seedPath = path.join(ROOT, "data", "restaurants.seed.json");
  await writeFile(seedPath, JSON.stringify(restaurants, null, 2), "utf8");
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function selectCandidates(
  restaurants: RestaurantProfile[],
  options: BatchOptions
): RestaurantProfile[] {
  const filtered = restaurants.filter((restaurant) => {
    const reviewStatus = restaurant.reviewStatus ?? restaurant.status;
    return reviewStatus === options.status && !restaurant.lastGoogleEnrichedAt;
  });

  const sorted = filtered.sort((left, right) => left.name.localeCompare(right.name));

  if (!options.startAfter) {
    return sorted.slice(0, options.limit);
  }

  const startIndex = sorted.findIndex(
    (restaurant) => normalize(restaurant.name) === normalize(options.startAfter!)
  );

  if (startIndex === -1) {
    throw new Error(`Could not find --start-after restaurant "${options.startAfter}".`);
  }

  return sorted.slice(startIndex + 1, startIndex + 1 + options.limit);
}

function buildFailureNote(restaurantName: string, message: string, now: string): string {
  return `Google batch enrichment failed for ${restaurantName} on ${now}: ${message}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const restaurants = await loadRestaurants();
  const candidates = selectCandidates(restaurants, options);

  console.log(`Batch mode: ${options.dryRun ? "dry-run" : "live"}`);
  console.log(`Status filter: ${options.status}`);
  console.log(`Limit: ${options.limit}`);
  console.log(`Candidates selected: ${candidates.length}`);

  if (!candidates.length) {
    console.log("No restaurants matched the current batch criteria.");
    return;
  }

  console.log("\nBatch candidates:");
  for (const restaurant of candidates) {
    console.log(`- ${restaurant.name} | ${restaurant.slug} | ${restaurant.address ?? "n/a"}`);
  }

  if (options.dryRun) {
    console.log("\nDry run only. Use --confirm to perform live Google enrichment.");
    return;
  }

  const rawDir = path.join(ROOT, "data", "raw", "google");
  await mkdir(rawDir, { recursive: true });

  let currentRestaurants = restaurants;
  let successCount = 0;
  let failureCount = 0;

  for (const candidate of candidates) {
    const now = new Date().toISOString();
    console.log(`\nEnriching: ${candidate.name}`);

    if (!candidate.googlePlaceId) {
      failureCount += 1;
      currentRestaurants = currentRestaurants.map((restaurant) =>
        restaurant.id === candidate.id
          ? {
              ...restaurant,
              workflowNotes: [
                buildFailureNote(candidate.name, "missing Google Place ID", now),
                ...(restaurant.workflowNotes ?? [])
              ],
              updatedAt: now
            }
          : restaurant
      );
      await saveRestaurants(currentRestaurants);
      console.log("Skipped: missing Google Place ID");
      continue;
    }

    try {
      const details = await getPlaceDetails(candidate.googlePlaceId);

      if (!details.result) {
        throw new Error("No place details returned.");
      }

      const rawFilePath = path.join(rawDir, `${candidate.slug}-details.json`);
      await writeFile(rawFilePath, JSON.stringify(details, null, 2), "utf8");

      currentRestaurants = currentRestaurants.map((restaurant) =>
        restaurant.id === candidate.id
          ? applyGoogleDetailEnrichment({
              restaurant,
              details,
              rawFilePath,
              now
            })
          : restaurant
      );

      await saveRestaurants(currentRestaurants);
      successCount += 1;
      console.log(
        `Saved: ${candidate.name} | rating=${details.result.rating ?? "n/a"} | reviews=${details.result.user_ratings_total ?? "n/a"}`
      );

      await sleep(REQUEST_DELAY_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failureCount += 1;
      currentRestaurants = currentRestaurants.map((restaurant) =>
        restaurant.id === candidate.id
          ? {
              ...restaurant,
              workflowNotes: [
                buildFailureNote(candidate.name, message, now),
                ...(restaurant.workflowNotes ?? [])
              ],
              updatedAt: now
            }
          : restaurant
      );
      await saveRestaurants(currentRestaurants);
      console.log(`Failed: ${candidate.name} | ${message}`);
    }
  }

  console.log("\nBatch summary:");
  console.log(`- Attempted: ${candidates.length}`);
  console.log(`- Successful: ${successCount}`);
  console.log(`- Failed: ${failureCount}`);
  console.log("- Progress was saved after each restaurant.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`batch:google failed: ${message}`);
  process.exit(1);
});

