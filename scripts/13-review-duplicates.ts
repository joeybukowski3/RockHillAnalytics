import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  analyzeDuplicateGroups,
  applyDuplicateReviewMetadata,
  DuplicateReviewGroup
} from "../src/lib/duplicateReview.js";
import { RestaurantProfile } from "../src/types/restaurant.js";

const ROOT = process.cwd();

async function loadRestaurants(): Promise<RestaurantProfile[]> {
  const raw = await readFile(path.join(ROOT, "data", "restaurants.seed.json"), "utf8");
  return JSON.parse(raw) as RestaurantProfile[];
}

function printGroups(title: string, groups: DuplicateReviewGroup[]): void {
  console.log(`\n${title}:`);

  if (!groups.length) {
    console.log("- none");
    return;
  }

  for (const group of groups) {
    const members = group.restaurants
      .map(
        (restaurant) =>
          `${restaurant.name} | ${restaurant.address ?? "n/a"} | ${restaurant.googlePlaceId ?? "no-place-id"}`
      )
      .join(" || ");
    console.log(
      `- ${group.key} | confidence=${group.confidence} | reason=${group.reason} | action=${group.recommendedAction}`
    );
    console.log(`  ${members}`);
  }
}

async function main(): Promise<void> {
  const restaurants = await loadRestaurants();
  const groups = analyzeDuplicateGroups(restaurants);
  const updatedRestaurants = applyDuplicateReviewMetadata(restaurants);

  await writeFile(
    path.join(ROOT, "data", "restaurants.seed.json"),
    JSON.stringify(updatedRestaurants, null, 2),
    "utf8"
  );

  const exactGroups = groups.filter((group) => group.category === "exact_duplicate");
  const possibleGroups = groups.filter((group) => group.category === "possible_duplicate");
  const multiLocationGroups = groups.filter((group) => group.category === "multi_location");

  console.log(`Total restaurants: ${restaurants.length}`);
  console.log(`Exact duplicate groups: ${exactGroups.length}`);
  console.log(`Possible duplicate groups: ${possibleGroups.length}`);
  console.log(`Multi-location groups: ${multiLocationGroups.length}`);

  printGroups("Exact duplicate groups", exactGroups);
  printGroups("Possible duplicate groups", possibleGroups);
  printGroups("Multi-location groups", multiLocationGroups);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`review:duplicates failed: ${message}`);
  process.exit(1);
});

