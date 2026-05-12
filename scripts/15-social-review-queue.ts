import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSocialReviewStatus, getWorkflowSnapshot } from "../src/lib/workflow.js";
import { RestaurantProfile } from "../src/types/restaurant.js";

const ROOT = process.cwd();

type QueueArgs = {
  limit: number;
  all: boolean;
  onlyIncluded: boolean;
  hasWebsite: boolean;
  missingInstagram: boolean;
  missingFacebook: boolean;
};

function parseArgs(argv: string[]): QueueArgs {
  const args = [...argv];
  const parsed: QueueArgs = {
    limit: 10,
    all: false,
    onlyIncluded: false,
    hasWebsite: false,
    missingInstagram: false,
    missingFacebook: false
  };

  while (args.length > 0) {
    const flag = args.shift();

    if (!flag) {
      continue;
    }

    if (flag === "--all") {
      parsed.all = true;
      continue;
    }

    if (flag === "--only-included") {
      parsed.onlyIncluded = true;
      continue;
    }

    if (flag === "--has-website") {
      parsed.hasWebsite = true;
      continue;
    }

    if (flag === "--missing-instagram") {
      parsed.missingInstagram = true;
      continue;
    }

    if (flag === "--missing-facebook") {
      parsed.missingFacebook = true;
      continue;
    }

    if (flag === "--limit") {
      const value = args.shift();
      const limit = Number(value);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error(`Invalid value for --limit: "${value ?? ""}"`);
      }
      parsed.limit = Math.floor(limit);
      continue;
    }

    throw new Error(`Unsupported argument "${flag}".`);
  }

  return parsed;
}

async function loadRestaurants(): Promise<RestaurantProfile[]> {
  const raw = await readFile(path.join(ROOT, "data", "restaurants.seed.json"), "utf8");
  return JSON.parse(raw) as RestaurantProfile[];
}

function hasGoogleCoverage(restaurant: RestaurantProfile): boolean {
  return Boolean(
    restaurant.lastGoogleEnrichedAt ||
      restaurant.google?.rating !== undefined ||
      restaurant.google?.reviewCount !== undefined ||
      restaurant.phone ||
      restaurant.website ||
      restaurant.googlePlaceId
  );
}

function isEligibleForManualReview(restaurant: RestaurantProfile, args: QueueArgs): boolean {
  const reviewStatus = getSocialReviewStatus(restaurant);
  const nextAction = getWorkflowSnapshot(restaurant).nextAction;
  const included = (restaurant.reviewStatus ?? restaurant.status) === "included";
  const mustBeIncluded = args.onlyIncluded || !args.all;

  if (mustBeIncluded && !included) {
    return false;
  }

  if (!hasGoogleCoverage(restaurant)) {
    return false;
  }

  if (args.hasWebsite && !restaurant.website) {
    return false;
  }

  if (args.missingInstagram) {
    const instagramMissing =
      (restaurant.socialProfileStatus?.instagram ?? "unknown") !== "verified" ||
      !restaurant.instagramUrl;
    if (!instagramMissing) {
      return false;
    }
  }

  if (args.missingFacebook) {
    const facebookMissing =
      (restaurant.socialProfileStatus?.facebook ?? "unknown") !== "verified" ||
      !restaurant.facebookUrl;
    if (!facebookMissing) {
      return false;
    }
  }

  if (!args.all) {
    return (
      reviewStatus === "not_started" ||
      reviewStatus === "in_progress" ||
      reviewStatus === "partial" ||
      nextAction === "Needs social URL review"
    );
  }

  return true;
}

function formatValue(value?: string): string {
  return value ?? "n/a";
}

function buildAddSocialCommand(restaurant: RestaurantProfile): string {
  const safeName = restaurant.name.replace(/"/g, '\\"');
  const facebookStatus = restaurant.socialProfileStatus?.facebook ?? "unknown";
  const instagramStatus = restaurant.socialProfileStatus?.instagram ?? "unknown";

  const parts = [`npm run add:social -- "${safeName}"`];

  if (facebookStatus === "verified" && restaurant.facebookUrl) {
    parts.push(`--facebook "${restaurant.facebookUrl}"`);
  } else if (facebookStatus === "not_found") {
    parts.push("--no-facebook");
  } else {
    parts.push('--facebook "URL"');
  }

  if (instagramStatus === "verified" && restaurant.instagramUrl) {
    parts.push(`--instagram "${restaurant.instagramUrl}"`);
  } else if (instagramStatus === "not_found") {
    parts.push("--no-instagram");
  } else {
    parts.push('--instagram "URL"');
  }

  if (restaurant.tiktokUrl) {
    parts.push(`--tiktok "${restaurant.tiktokUrl}"`);
  }

  const note =
    facebookStatus === "not_found" && instagramStatus === "not_found"
      ? "No official Facebook or Instagram found during manual check"
      : "Manually verified official social profiles";

  parts.push(`--notes "${note}"`);
  return parts.join(" ");
}

function printRestaurant(restaurant: RestaurantProfile): void {
  const socialReviewStatus = getSocialReviewStatus(restaurant);
  const snapshot = getWorkflowSnapshot(restaurant);
  const googleRating = restaurant.google?.rating ?? "n/a";
  const reviewCount = restaurant.google?.reviewCount ?? "n/a";

  console.log(`- ${restaurant.name}`);
  console.log(`  Website: ${formatValue(restaurant.website)}`);
  console.log(`  Phone: ${formatValue(restaurant.phone)}`);
  console.log(`  Address: ${formatValue(restaurant.address)}`);
  console.log(`  Google rating/reviews: ${googleRating} / ${reviewCount}`);
  console.log(
    `  Facebook: ${formatValue(restaurant.facebookUrl)} (${restaurant.socialProfileStatus?.facebook ?? "unknown"})`
  );
  console.log(
    `  Instagram: ${formatValue(restaurant.instagramUrl)} (${restaurant.socialProfileStatus?.instagram ?? "unknown"})`
  );
  console.log(
    `  TikTok: ${formatValue(restaurant.tiktokUrl)} (${restaurant.socialProfileStatus?.tiktok ?? "unknown"})`
  );
  console.log(`  Social review status: ${socialReviewStatus}`);
  console.log(`  Next action: ${snapshot.nextAction}`);
  console.log(`  Suggested search: ${restaurant.name} Rock Hill SC Instagram`);
  console.log(`  Suggested search: ${restaurant.name} Rock Hill SC Facebook`);
  console.log(`  Suggested search: ${restaurant.name} official website social media`);
  console.log(`  Suggested command: ${buildAddSocialCommand(restaurant)}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const restaurants = await loadRestaurants();
  const queue = restaurants
    .filter((restaurant) => isEligibleForManualReview(restaurant, args))
    .sort(
      (left, right) =>
        (right.google?.reviewCount ?? 0) - (left.google?.reviewCount ?? 0) ||
        left.name.localeCompare(right.name)
    );
  const limitedQueue = args.limit ? queue.slice(0, args.limit) : queue;

  console.log(`Social review queue: ${limitedQueue.length} shown from ${queue.length} matching restaurants`);
  console.log(`Filters: ${args.all ? "all restaurants" : "included/google-enriched/manual-review"}${args.hasWebsite ? ", has website" : ""}${args.missingInstagram ? ", missing instagram" : ""}${args.missingFacebook ? ", missing facebook" : ""}`);

  if (!limitedQueue.length) {
    console.log("No restaurants matched the current filters.");
    return;
  }

  for (const restaurant of limitedQueue) {
    printRestaurant(restaurant);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`queue:social failed: ${message}`);
  process.exit(1);
});
