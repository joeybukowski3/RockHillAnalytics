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
import { RestaurantProfile, SocialPost } from "../src/types/restaurant.js";

const ROOT = process.cwd();
loadEnv();

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

type FacebookActorItem = {
  url?: string;
  time?: string;
  text?: string;
  likes?: number;
  topReactionsCount?: number;
  shares?: number;
  comments?: number;
  media?: Array<{ __typename?: string }>;
};

function getFacebookActorId(): string {
  const actorId = process.env.APIFY_FACEBOOK_ACTOR_ID?.trim();

  if (!actorId) {
    throw new Error(
      "Missing APIFY_FACEBOOK_ACTOR_ID. Set it in .env.local to the Facebook Posts Scraper actor ID, for example apify/facebook-posts-scraper."
    );
  }

  return actorId;
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function normalizeFacebookPosts(items: FacebookActorItem[]): SocialPost[] {
  return limitRecentPosts(
    items.map((item) => ({
      platform: "facebook",
      source: "facebook",
      postUrl: item.url,
      url: item.url,
      caption: item.text,
      publishedAt: item.time,
      contentType: item.media?.[0]?.__typename ?? "post",
      engagement: {
        likes: item.likes ?? item.topReactionsCount,
        comments: item.comments,
        shares: item.shares
      }
    }))
  );
}

async function main(): Promise<void> {
  const identifier = getIdentifierArg();
  const restaurants = await loadRestaurants();
  const { restaurant } = findRestaurant(restaurants, identifier);

  if (!restaurant.facebookUrl) {
    throw new Error(`Restaurant "${restaurant.name}" is missing a verified facebookUrl.`);
  }

  const actorId = getFacebookActorId();
  const actorInput = {
    startUrls: [{ url: restaurant.facebookUrl }],
    resultsLimit: getSocialMaxPosts(),
    captionText: false
  };

  const run = await runApifyActor(actorId, actorInput);
  const items = await fetchApifyDatasetItems<FacebookActorItem>(run.defaultDatasetId);

  const rawDir = path.join(ROOT, "data", "raw", "facebook");
  await mkdir(rawDir, { recursive: true });
  const rawFilePath = path.join(rawDir, `${restaurant.slug}-${timestampForFile()}.json`);
  await writeFile(
    rawFilePath,
    JSON.stringify({ actorId, actorInput, run, items }, null, 2),
    "utf8"
  );

  const recentPosts = normalizeFacebookPosts(items);
  const now = new Date().toISOString();
  const latestPostDate = getLatestPostDate(recentPosts);
  const missingSignals = [
    latestPostDate ? undefined : "no published post timestamps",
    recentPosts.some((post) => !post.postUrl) ? "some posts missing postUrl" : undefined,
    recentPosts.every((post) => !post.caption) ? "all posts missing caption/text" : undefined
  ].filter((value): value is string => Boolean(value));

  const updatedRestaurants = restaurants.map((entry) =>
    entry.id === restaurant.id
      ? {
          ...entry,
          socialEnrichmentStatus: "enriched" as const,
          socialEnrichmentNotes: [
            `Facebook enrichment completed via ${actorId} on ${now}.`,
            ...(entry.socialEnrichmentNotes ?? [])
          ],
          facebook: {
            ...entry.facebook,
            pageUrl: entry.facebookUrl ?? entry.facebook?.pageUrl,
            postCount: recentPosts.length,
            recentPosts,
            lastEnrichedAt: now
          },
          lastVerifiedAt: now,
          updatedAt: now
        }
      : entry
  );

  await writeFile(
    path.join(ROOT, "data", "restaurants.seed.json"),
    JSON.stringify(updatedRestaurants, null, 2),
    "utf8"
  );

  console.log(`Facebook enrichment complete: ${restaurant.name}`);
  for (const line of buildEnrichmentSummary({
    restaurantName: restaurant.name,
    platform: "facebook",
    actorId,
    rawItemsReturned: items.length,
    normalizedPostsStored: recentPosts.length,
    latestPostDate,
    rawFilePath,
    missingSignals
  })) {
    console.log(line);
  }
  console.log("Only public Facebook page posts were used. Private/member-only groups were not scraped.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`enrich:facebook failed: ${message}`);
  process.exit(1);
});
