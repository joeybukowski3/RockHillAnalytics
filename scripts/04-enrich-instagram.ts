import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchApifyDatasetItems, runApifyActor } from "../src/apis/apify.js";
import { loadEnv } from "../src/lib/env.js";
import { findRestaurant } from "../src/lib/findRestaurant.js";
import {
  buildEnrichmentSummary,
  getLatestPostDate,
  getSocialMaxPosts,
  limitRecentPosts
} from "../src/lib/social.js";
import { applyWorkflowMetadata } from "../src/lib/workflow.js";
import { RestaurantProfile, SocialPost } from "../src/types/restaurant.js";

const ROOT = process.cwd();
loadEnv();

function getIdentifierArg(): string {
  const identifier = process.argv.slice(2).join(" ").trim();

  if (!identifier) {
    throw new Error('Provide a restaurant name, slug, or Google Place ID. Example: npm run enrich:instagram -- "Restaurant Name"');
  }

  return identifier;
}

async function loadRestaurants(): Promise<RestaurantProfile[]> {
  const raw = await readFile(path.join(ROOT, "data", "restaurants.seed.json"), "utf8");
  return JSON.parse(raw) as RestaurantProfile[];
}

type InstagramActorProfile = {
  username?: string;
  fullName?: string;
  followersCount?: number;
  postsCount?: number;
  latestPosts?: Array<{
    url?: string;
    timestamp?: string;
    caption?: string;
    likesCount?: number;
    commentsCount?: number;
    videoViewCount?: number;
    type?: string;
    hashtags?: string[];
  }>;
};

function getInstagramActorId(): string {
  const actorId = process.env.APIFY_INSTAGRAM_ACTOR_ID?.trim();

  if (!actorId) {
    throw new Error(
      "Missing APIFY_INSTAGRAM_ACTOR_ID. Set it in .env.local to the Instagram actor ID, for example apify/instagram-scraper."
    );
  }

  return actorId;
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function normalizeInstagramPosts(profile: InstagramActorProfile | undefined): SocialPost[] {
  return limitRecentPosts(
    (profile?.latestPosts ?? []).map((post) => ({
      platform: "instagram",
      source: "instagram",
      postUrl: post.url,
      url: post.url,
      publishedAt: post.timestamp,
      caption: post.caption,
      contentType: post.type,
      hashtags: post.hashtags ?? [],
      engagement: {
        likes: post.likesCount,
        comments: post.commentsCount,
        views: post.videoViewCount
      }
    }))
  );
}

async function main(): Promise<void> {
  const identifier = getIdentifierArg();
  const restaurants = await loadRestaurants();
  const { restaurant } = findRestaurant(restaurants, identifier);

  if (!restaurant.instagramUrl) {
    throw new Error(`Restaurant "${restaurant.name}" is missing a verified instagramUrl.`);
  }

  const actorId = getInstagramActorId();
  const actorInput = {
    directUrls: [restaurant.instagramUrl],
    resultsType: "details",
    resultsLimit: getSocialMaxPosts(),
    searchType: "user",
    searchLimit: 1
  };

  const run = await runApifyActor(actorId, actorInput);
  const items = await fetchApifyDatasetItems<InstagramActorProfile>(run.defaultDatasetId);
  const profile = items[0];

  const rawDir = path.join(ROOT, "data", "raw", "instagram");
  await mkdir(rawDir, { recursive: true });
  const rawFilePath = path.join(rawDir, `${restaurant.slug}-${timestampForFile()}.json`);
  await writeFile(
    rawFilePath,
    JSON.stringify({ actorId, actorInput, run, items }, null, 2),
    "utf8"
  );

  const recentPosts = normalizeInstagramPosts(profile);
  const now = new Date().toISOString();
  const latestPostDate = getLatestPostDate(recentPosts);
  const missingSignals = [
    profile?.followersCount === undefined ? "followersCount missing" : undefined,
    latestPostDate ? undefined : "no published post timestamps",
    recentPosts.some((post) => !post.postUrl) ? "some posts missing postUrl" : undefined
  ].filter((value): value is string => Boolean(value));

  const updatedRestaurants = restaurants.map((entry) =>
    entry.id === restaurant.id
      ? applyWorkflowMetadata({
          ...entry,
          socialEnrichmentStatus: "enriched" as const,
          socialEnrichmentNotes: [
            `Instagram enrichment completed via ${actorId} on ${now}.`,
            ...(entry.socialEnrichmentNotes ?? [])
          ],
          lastSocialEnrichedAt: now,
          instagram: {
            ...entry.instagram,
            profileUrl: entry.instagramUrl ?? entry.instagram?.profileUrl,
            followers: profile?.followersCount ?? entry.instagram?.followers,
            postCount: profile?.postsCount ?? entry.instagram?.postCount,
            recentPosts,
            lastEnrichedAt: now
          },
          lastVerifiedAt: now,
          updatedAt: now
        })
      : entry
  );

  await writeFile(
    path.join(ROOT, "data", "restaurants.seed.json"),
    JSON.stringify(updatedRestaurants, null, 2),
    "utf8"
  );

  console.log(`Instagram enrichment complete: ${restaurant.name}`);
  for (const line of buildEnrichmentSummary({
    restaurantName: restaurant.name,
    platform: "instagram",
    actorId,
    rawItemsReturned: items.length,
    normalizedPostsStored: recentPosts.length,
    latestPostDate,
    rawFilePath,
    missingSignals
  })) {
    console.log(line);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`enrich:instagram failed: ${message}`);
  process.exit(1);
});
