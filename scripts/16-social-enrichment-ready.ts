import { readFile } from "node:fs/promises";
import path from "node:path";
import { getWorkflowSnapshot } from "../src/lib/workflow.js";
import { RestaurantProfile } from "../src/types/restaurant.js";

const ROOT = process.cwd();

async function loadRestaurants(): Promise<RestaurantProfile[]> {
  const raw = await readFile(path.join(ROOT, "data", "restaurants.seed.json"), "utf8");
  return JSON.parse(raw) as RestaurantProfile[];
}

function isReadyForInstagram(restaurant: RestaurantProfile): boolean {
  const snapshot = getWorkflowSnapshot(restaurant);
  return snapshot.nextAction === "Ready for Instagram enrichment";
}

function isReadyForFacebook(restaurant: RestaurantProfile): boolean {
  const snapshot = getWorkflowSnapshot(restaurant);
  return snapshot.nextAction === "Ready for Facebook enrichment";
}

function isEnrichedInstagram(restaurant: RestaurantProfile): boolean {
  return (restaurant.instagram?.recentPosts?.length ?? 0) > 0;
}

function isEnrichedFacebook(restaurant: RestaurantProfile): boolean {
  return (restaurant.facebook?.recentPosts?.length ?? 0) > 0;
}

async function main(): Promise<void> {
  const restaurants = await loadRestaurants().then(list => 
    list.filter(r => (r.reviewStatus ?? r.status) === "included")
  );

  const readyIG = restaurants.filter(isReadyForInstagram);
  const readyFB = restaurants.filter(isReadyForFacebook);
  
  const enrichedIG = restaurants.filter(isEnrichedInstagram);
  const enrichedFB = restaurants.filter(isEnrichedFacebook);
  
  const noSocial = restaurants.filter(r => 
    r.socialProfileStatus?.instagram === "not_found" && 
    r.socialProfileStatus?.facebook === "not_found"
  );

  console.log(`\n--- Social Enrichment Readiness Report ---`);
  console.log(`Total included restaurants: ${restaurants.length}`);
  
  console.log(`\nReady for Instagram enrichment: ${readyIG.length}`);
  readyIG.slice(0, 10).forEach(r => console.log(`  - ${r.name} (${r.instagramUrl})`));
  if (readyIG.length > 10) console.log(`  ... and ${readyIG.length - 10} more`);

  console.log(`\nReady for Facebook enrichment: ${readyFB.length}`);
  readyFB.slice(0, 10).forEach(r => console.log(`  - ${r.name} (${r.facebookUrl})`));
  if (readyFB.length > 10) console.log(`  ... and ${readyFB.length - 10} more`);

  console.log(`\nEnriched Instagram: ${enrichedIG.length}`);
  console.log(`Enriched Facebook: ${enrichedFB.length}`);
  console.log(`Social reviewed but no profiles found: ${noSocial.length}`);

  console.log(`\n--- Suggested Enrichment Commands ---`);
  if (readyIG.length > 0) {
    console.log(`To enrich Instagram for "${readyIG[0].name}":`);
    console.log(`  npm run enrich:instagram -- "${readyIG[0].name}"`);
  }
  if (readyFB.length > 0) {
    console.log(`To enrich Facebook for "${readyFB[0].name}":`);
    console.log(`  npm run enrich:facebook -- "${readyFB[0].name}"`);
  }

  console.log(`\nBatch enrichment command (newly available):`);
  console.log(`  npm run batch:social -- --platform instagram --limit 5 --dry-run`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ready:social failed: ${message}`);
  process.exit(1);
});
