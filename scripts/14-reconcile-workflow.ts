import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getWorkflowSnapshot } from "../src/lib/workflow.js";
import { RestaurantProfile } from "../src/types/restaurant.js";

const ROOT = process.cwd();

type CliOptions = {
  dryRun: boolean;
  confirm: boolean;
};

type TransitionCounts = Record<string, number>;

function parseArgs(argv: string[]): CliOptions {
  let dryRun = false;
  let confirm = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--confirm") {
      confirm = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!confirm) {
    dryRun = true;
  }

  return { dryRun, confirm };
}

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

function getCurrentStage(restaurant: RestaurantProfile): string {
  return restaurant.workflowStage ?? "discovered";
}

function increment(map: TransitionCounts, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function formatTransition(from: string, to: string): string {
  return `${from} -> ${to}`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const restaurants = await loadRestaurants();
  const reportSlugs = await loadReportSlugs();
  const now = new Date().toISOString();

  let unchanged = 0;
  let updated = 0;
  let skipped = 0;
  const transitionCounts: TransitionCounts = {};
  const changedRestaurants: Array<{
    name: string;
    from: string;
    to: string;
  }> = [];

  const reconciled = restaurants.map((restaurant) => {
    const reviewStatus = restaurant.reviewStatus ?? restaurant.status;

    if (reviewStatus === "excluded" || reviewStatus === "closed") {
      skipped += 1;
      return restaurant;
    }

    const currentStage = getCurrentStage(restaurant);
    const reportExists = reportSlugs.has(restaurant.slug) || restaurant.pipelineStage === "reported";
    const snapshot = getWorkflowSnapshot({
      ...restaurant,
      pipelineStage: reportExists ? "reported" : restaurant.pipelineStage
    });

    const desiredPipelineStage = reportExists ? "reported" : restaurant.pipelineStage;
    const shouldUpdate =
      currentStage !== snapshot.workflowStage ||
      (restaurant.readyForReport ?? false) !== snapshot.readyForReport ||
      (restaurant.dataCompletenessScore ?? 0) !== snapshot.dataCompletenessScore ||
      (desiredPipelineStage ?? restaurant.pipelineStage) !== restaurant.pipelineStage;

    if (!shouldUpdate) {
      unchanged += 1;
      return restaurant;
    }

    updated += 1;
    increment(transitionCounts, formatTransition(currentStage, snapshot.workflowStage));
    changedRestaurants.push({
      name: restaurant.name,
      from: currentStage,
      to: snapshot.workflowStage
    });

    return {
      ...restaurant,
      workflowStage: snapshot.workflowStage,
      readyForReport: snapshot.readyForReport,
      dataCompletenessScore: snapshot.dataCompletenessScore,
      pipelineStage: desiredPipelineStage ?? restaurant.pipelineStage,
      updatedAt: now
    };
  });

  const byPriority = [
    ["discovered -> google_enriched", transitionCounts["discovered -> google_enriched"] ?? 0],
    [
      "google_enriched -> social_review_needed",
      transitionCounts["google_enriched -> social_review_needed"] ?? 0
    ],
    [
      "social_links_verified -> social_enriched",
      transitionCounts["social_links_verified -> social_enriched"] ?? 0
    ]
  ] as const;

  const otherTransitions = Object.entries(transitionCounts)
    .filter(
      ([transition]) =>
        !byPriority.some(([priority]) => priority === transition)
    )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

  console.log(`Total checked: ${restaurants.length}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped excluded/closed: ${skipped}`);
  for (const [label, count] of byPriority) {
    console.log(`${label}: ${count}`);
  }

  if (otherTransitions.length) {
    console.log("Other transitions:");
    for (const [label, count] of otherTransitions) {
      console.log(`- ${label}: ${count}`);
    }
  } else {
    console.log("Other transitions: none");
  }

  console.log("\nChanged restaurants:");
  if (!changedRestaurants.length) {
    console.log("- none");
  } else {
    for (const item of changedRestaurants.slice(0, 20)) {
      console.log(`- ${item.name} | ${item.from} -> ${item.to}`);
    }
    if (changedRestaurants.length > 20) {
      console.log(`- ...and ${changedRestaurants.length - 20} more`);
    }
  }

  if (options.confirm) {
    await writeFile(
      path.join(ROOT, "data", "restaurants.seed.json"),
      JSON.stringify(reconciled, null, 2),
      "utf8"
    );
    console.log("\nWorkflow reconciliation saved to data/restaurants.seed.json");
  } else {
    console.log("\nDry run only. Pass --confirm to write the reconciled workflow metadata.");
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`reconcile:workflow failed: ${message}`);
  process.exit(1);
});

