import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyWorkflowMetadata, findWorkflowInconsistencies, getWorkflowSnapshot } from "../src/lib/workflow.js";
import { RestaurantProfile } from "../src/types/restaurant.js";

const ROOT = process.cwd();

async function loadRestaurants(): Promise<RestaurantProfile[]> {
  const raw = await readFile(path.join(ROOT, "data", "restaurants.seed.json"), "utf8");
  return JSON.parse(raw) as RestaurantProfile[];
}

async function loadReportSlugs(): Promise<Set<string>> {
  const reportsDir = path.join(ROOT, "reports");

  try {
    const entries = await readdir(reportsDir, { withFileTypes: true });
    return new Set(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name.replace(/\.md$/i, ""))
    );
  } catch {
    return new Set();
  }
}

function printGroup(title: string, restaurants: RestaurantProfile[], formatter?: (restaurant: RestaurantProfile) => string): void {
  console.log(`\n${title}:`);
  for (const restaurant of restaurants.slice(0, 10)) {
    console.log(formatter ? formatter(restaurant) : `- ${restaurant.name}`);
  }
}

async function main(): Promise<void> {
  const restaurants = await loadRestaurants();
  const reportSlugs = await loadReportSlugs();
  const normalized = restaurants.map((restaurant) =>
    applyWorkflowMetadata({
      ...restaurant,
      pipelineStage:
        reportSlugs.has(restaurant.slug) || restaurant.pipelineStage === "reported"
          ? "reported"
          : restaurant.pipelineStage
    })
  );

  await writeFile(
    path.join(ROOT, "data", "restaurants.seed.json"),
    JSON.stringify(normalized, null, 2),
    "utf8"
  );

  const stageCounts = normalized.reduce<Record<string, number>>((acc, restaurant) => {
    const stage = restaurant.workflowStage ?? "discovered";
    acc[stage] = (acc[stage] ?? 0) + 1;
    return acc;
  }, {});

  console.log("Counts by workflow stage:");
  for (const stage of [
    "discovered",
    "google_enriched",
    "social_review_needed",
    "social_links_verified",
    "social_enriched",
    "scored",
    "ready_for_report",
    "report_generated"
  ]) {
    console.log(`- ${stage}: ${stageCounts[stage] ?? 0}`);
  }

  const actionable = normalized.filter(
    (restaurant) => (restaurant.reviewStatus ?? restaurant.status) === "included"
  );

  printGroup(
    "Top restaurants needing Google enrichment",
    actionable.filter((restaurant) => getWorkflowSnapshot(restaurant).nextAction === "Needs Google enrichment"),
    (restaurant) => `- ${restaurant.name} | npm run enrich:google -- "${restaurant.name}"`
  );

  printGroup(
    "Top restaurants needing social URL review",
    actionable.filter((restaurant) => getWorkflowSnapshot(restaurant).nextAction === "Needs social URL review"),
    (restaurant) => `- ${restaurant.name} | npm run add:social -- "${restaurant.name}" --facebook "URL" --instagram "URL" --notes "Manually verified official social profiles"`
  );

  printGroup(
    "Restaurants ready for Instagram enrichment",
    actionable.filter((restaurant) => getWorkflowSnapshot(restaurant).nextAction === "Ready for Instagram enrichment"),
    (restaurant) => `- ${restaurant.name} | npm run enrich:instagram -- "${restaurant.name}"`
  );

  printGroup(
    "Restaurants ready for Facebook enrichment",
    actionable.filter((restaurant) => getWorkflowSnapshot(restaurant).nextAction === "Ready for Facebook enrichment"),
    (restaurant) => `- ${restaurant.name} | npm run enrich:facebook -- "${restaurant.name}"`
  );

  printGroup(
    "Restaurants needing scoring",
    actionable.filter((restaurant) => getWorkflowSnapshot(restaurant).nextAction === "Needs scoring"),
    (restaurant) => `- ${restaurant.name} | npm run score -- "${restaurant.name}"`
  );

  printGroup(
    "Restaurants ready for report",
    actionable.filter((restaurant) => getWorkflowSnapshot(restaurant).nextAction === "Ready for report"),
    (restaurant) => `- ${restaurant.name} | npm run report -- "${restaurant.name}"`
  );

  const inconsistencies = normalized
    .map((restaurant) => ({
      restaurant,
      issues: findWorkflowInconsistencies(restaurant)
    }))
    .filter((entry) => entry.issues.length > 0);

  console.log("\nRestaurants with possible workflow inconsistencies:");
  if (!inconsistencies.length) {
    console.log("- none");
  } else {
    for (const entry of inconsistencies.slice(0, 10)) {
      console.log(`- ${entry.restaurant.name} | ${entry.issues.join("; ")}`);
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`review:workflow failed: ${message}`);
  process.exit(1);
});
