import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getApifyToken } from "../src/apis/apify.js";
import { RestaurantProfile } from "../src/types/restaurant.js";

const ROOT = process.cwd();

function getIdentifierArg(): string {
  const identifier = process.argv.slice(2).join(" ").trim();

  if (!identifier) {
    throw new Error('Provide a restaurant name, slug, or Google Place ID. Example: npm run enrich:facebook -- "Restaurant Name"');
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
  getApifyToken();

  console.log(`Facebook enrichment placeholder for: ${restaurant.name}`);
  console.log("Not implemented yet.");
  console.log("This will later use public Facebook page URLs only.");
  console.log("Private or member-only Facebook groups must not be scraped.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`enrich:facebook failed: ${message}`);
  process.exit(1);
});
