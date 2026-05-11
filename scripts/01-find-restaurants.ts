import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { searchRestaurantsInRockHill } from "../src/apis/googlePlaces.js";
import { normalizeGooglePlacesResults } from "../src/lib/normalizeRestaurant.js";

const ROOT = process.cwd();

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function main(): Promise<void> {
  const result = await searchRestaurantsInRockHill();
  const rawDir = path.join(ROOT, "data", "raw", "google");
  const seedPath = path.join(ROOT, "data", "restaurants.seed.json");

  await mkdir(rawDir, { recursive: true });
  await mkdir(path.join(ROOT, "data", "processed"), { recursive: true });
  await mkdir(path.join(ROOT, "reports"), { recursive: true });

  const rawFilePath = path.join(rawDir, `${timestampForFile()}-rock-hill-search.json`);
  await writeFile(rawFilePath, JSON.stringify(result, null, 2), "utf8");

  const rawResults = result.queries.flatMap((entry) => entry.response.results);
  const normalized = normalizeGooglePlacesResults(rawResults);

  await writeFile(seedPath, JSON.stringify(normalized, null, 2), "utf8");

  console.log(`Total raw results: ${rawResults.length}`);
  console.log(`Unique restaurants: ${normalized.length}`);
  console.log(`Output path: ${seedPath}`);
  console.log("Sample first 10 restaurant names:");
  for (const restaurant of normalized.slice(0, 10)) {
    console.log(`- ${restaurant.name}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`find:restaurants failed: ${message}`);
  process.exit(1);
});
