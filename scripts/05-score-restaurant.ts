import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "../src/lib/env.js";
import { calculateOverallScore } from "../src/lib/scoring.js";
import { RestaurantProfile } from "../src/types/restaurant.js";

const ROOT = process.cwd();
loadEnv();

function getIdentifierArg(): string {
  const identifier = process.argv.slice(2).join(" ").trim();

  if (!identifier) {
    throw new Error('Provide a restaurant name, slug, or Google Place ID. Example: npm run score -- "Restaurant Name"');
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

async function main(): Promise<void> {
  const identifier = getIdentifierArg();
  const restaurants = await loadRestaurants();
  const restaurant = findRestaurant(restaurants, identifier);
  const scores = calculateOverallScore(restaurant);
  const now = new Date().toISOString();

  const updatedRestaurants = restaurants.map((entry) =>
    entry.id === restaurant.id
      ? {
          ...entry,
          scores,
          pipelineStage: "scored" as const,
          lastVerifiedAt: now,
          updatedAt: now
        }
      : entry
  );

  await writeFile(
    path.join(ROOT, "data", "restaurants.seed.json"),
    JSON.stringify(updatedRestaurants, null, 2),
    "utf8"
  );

  console.log(`Score summary for ${restaurant.name}`);
  console.log(JSON.stringify(scores, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`score failed: ${message}`);
  process.exit(1);
});
