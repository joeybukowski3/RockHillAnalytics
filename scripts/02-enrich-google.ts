import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPlaceDetails } from "../src/apis/googlePlaces.js";
import { loadEnv } from "../src/lib/env.js";
import { findRestaurant } from "../src/lib/findRestaurant.js";
import { applyGoogleDetailEnrichment } from "../src/lib/googleEnrichment.js";
import { RestaurantProfile } from "../src/types/restaurant.js";

const ROOT = process.cwd();
loadEnv();

function getIdentifierArg(): string {
  const identifier = process.argv.slice(2).join(" ").trim();

  if (!identifier) {
    throw new Error('Provide a restaurant name, slug, or Google Place ID. Example: npm run enrich:google -- "Legal Remedy Brewing"');
  }

  return identifier;
}

async function loadRestaurants(): Promise<RestaurantProfile[]> {
  const seedPath = path.join(ROOT, "data", "restaurants.seed.json");
  const raw = await readFile(seedPath, "utf8");
  return JSON.parse(raw) as RestaurantProfile[];
}

async function main(): Promise<void> {
  const identifier = getIdentifierArg();
  const restaurants = await loadRestaurants();
  const { restaurant } = findRestaurant(restaurants, identifier);

  if (!restaurant.googlePlaceId) {
    throw new Error(`Restaurant "${restaurant.name}" is missing a Google Place ID.`);
  }

  const details = await getPlaceDetails(restaurant.googlePlaceId!);

  if (!details.result) {
    throw new Error(`No place details returned for ${restaurant.name}.`);
  }

  const rawDir = path.join(ROOT, "data", "raw", "google");
  const rawFilePath = path.join(rawDir, `${restaurant.slug}-details.json`);
  await mkdir(rawDir, { recursive: true });
  await writeFile(rawFilePath, JSON.stringify(details, null, 2), "utf8");

  const now = new Date().toISOString();
  const updatedRestaurants = restaurants.map((entry) => {
    if (entry.id !== restaurant.id) {
      return entry;
    }

    return applyGoogleDetailEnrichment({
      restaurant: entry,
      details,
      rawFilePath,
      now
    });
  });

  const seedPath = path.join(ROOT, "data", "restaurants.seed.json");
  await writeFile(seedPath, JSON.stringify(updatedRestaurants, null, 2), "utf8");

  console.log(`Updated restaurant: ${restaurant.name}`);
  console.log(`Raw detail saved to: ${rawFilePath}`);
  console.log(`Phone: ${details.result.formatted_phone_number ?? "n/a"}`);
  console.log(`Website: ${details.result.website ?? "n/a"}`);
  console.log(`Rating: ${details.result.rating ?? "n/a"}`);
  console.log(`Review count: ${details.result.user_ratings_total ?? "n/a"}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`enrich:google failed: ${message}`);
  process.exit(1);
});
