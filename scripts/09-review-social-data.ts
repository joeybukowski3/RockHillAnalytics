import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "../src/lib/env.js";
import {
  deriveSocialEnrichmentStatus,
  getLatestPostDate,
  getSocialProfileStatus,
  hasRecentSocialPosts,
  hasVerifiedSocialProfile,
  isStaleLatestPost,
  normalizeRestaurantSocialData
} from "../src/lib/social.js";
import { RestaurantProfile } from "../src/types/restaurant.js";

const ROOT = process.cwd();
loadEnv();

async function loadRestaurants(): Promise<RestaurantProfile[]> {
  const raw = await readFile(path.join(ROOT, "data", "restaurants.seed.json"), "utf8");
  return JSON.parse(raw) as RestaurantProfile[];
}

async function main(): Promise<void> {
  const restaurants = await loadRestaurants();
  const normalizedRestaurants = restaurants.map((restaurant) => ({
    ...normalizeRestaurantSocialData(restaurant),
    socialEnrichmentStatus: deriveSocialEnrichmentStatus(restaurant)
  }));

  await writeFile(
    path.join(ROOT, "data", "restaurants.seed.json"),
    JSON.stringify(normalizedRestaurants, null, 2),
    "utf8"
  );

  const verifiedInstagram = normalizedRestaurants.filter(
    (restaurant) => getSocialProfileStatus(restaurant, "instagram") === "verified"
  );
  const verifiedFacebook = normalizedRestaurants.filter(
    (restaurant) => getSocialProfileStatus(restaurant, "facebook") === "verified"
  );
  const notFoundProfiles = normalizedRestaurants.filter(
    (restaurant) =>
      ["facebook", "instagram"].some(
        (platform) =>
          getSocialProfileStatus(
            restaurant,
            platform as "facebook" | "instagram" | "tiktok"
          ) === "not_found"
      )
  );
  const unknownProfiles = normalizedRestaurants.filter(
    (restaurant) =>
      ["facebook", "instagram"].some(
        (platform) =>
          getSocialProfileStatus(
            restaurant,
            platform as "facebook" | "instagram" | "tiktok"
          ) === "unknown"
      )
  );
  const withRecentPosts = normalizedRestaurants.filter(hasRecentSocialPosts);
  const staleLatestPost = normalizedRestaurants.filter(
    (restaurant) =>
      isStaleLatestPost(restaurant.facebook?.recentPosts) ||
      isStaleLatestPost(restaurant.instagram?.recentPosts)
  );
  const urlsButNoEnrichment = normalizedRestaurants.filter(
    (restaurant) =>
      hasVerifiedSocialProfile(restaurant) &&
      !hasRecentSocialPosts(restaurant)
  );
  const readyForApify = normalizedRestaurants
    .filter((restaurant) => restaurant.socialEnrichmentStatus === "ready")
    .slice(0, 10);

  console.log(`Total restaurants: ${normalizedRestaurants.length}`);
  console.log(`Restaurants with verified Instagram: ${verifiedInstagram.length}`);
  console.log(`Restaurants with verified Facebook: ${verifiedFacebook.length}`);
  console.log(`Restaurants with not_found social profiles: ${notFoundProfiles.length}`);
  console.log(`Restaurants with unknown social profiles: ${unknownProfiles.length}`);
  console.log(`Restaurants with recentPosts stored: ${withRecentPosts.length}`);
  console.log(`Restaurants with stale latest post date: ${staleLatestPost.length}`);
  console.log(`Restaurants with social URLs but no enrichment data: ${urlsButNoEnrichment.length}`);

  console.log("\nTop 10 restaurants ready for Apify enrichment:");
  for (const restaurant of readyForApify) {
    console.log(
      `- ${restaurant.name} | facebook=${getSocialProfileStatus(restaurant, "facebook")} | instagram=${getSocialProfileStatus(restaurant, "instagram")}`
    );
  }

  console.log("\nRestaurants with stale latest post date:");
  for (const restaurant of staleLatestPost.slice(0, 10)) {
    const latest = getLatestPostDate(restaurant.facebook?.recentPosts)
      ?? getLatestPostDate(restaurant.instagram?.recentPosts)
      ?? "n/a";
    console.log(`- ${restaurant.name} | latest=${latest}`);
  }

  console.log("\nRestaurants with social URLs but no enrichment data:");
  for (const restaurant of urlsButNoEnrichment.slice(0, 10)) {
    console.log(`- ${restaurant.name} | status=${restaurant.socialEnrichmentStatus}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`review:social failed: ${message}`);
  process.exit(1);
});
