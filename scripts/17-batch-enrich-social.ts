import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchApifyDatasetItems, runApifyActor } from "../src/apis/apify.js";
import { loadEnv } from "../src/lib/env.js";
import {
  getLatestPostDate,
  getSocialMaxPosts,
  limitRecentPosts
} from "../src/lib/social.js";
import { applyWorkflowMetadata, getWorkflowSnapshot } from "../src/lib/workflow.js";
import { RestaurantProfile, SocialPost } from "../src/types/restaurant.js";

const ROOT = process.cwd();
loadEnv();

type BatchArgs = {
  platform: "instagram" | "facebook";
  limit: number;
  restaurant?: string;
  confirm: boolean;
  force: boolean;
};

function parseArgs(argv: string[]): BatchArgs {
  const args = [...argv];
  const parsed: BatchArgs = {
    platform: "instagram",
    limit: 5,
    confirm: false,
    force: false
  };

  while (args.length > 0) {
    const flag = args.shift();
    if (!flag) continue;

    if (flag === "--platform") {
      const val = args.shift();
      if (val !== "instagram" && val !== "facebook") {
        throw new Error(`Invalid platform: ${val}`);
      }
      parsed.platform = val;
    } else if (flag === "--limit") {
      parsed.limit = Number(args.shift());
    } else if (flag === "--restaurant") {
      parsed.restaurant = args.shift();
    } else if (flag === "--confirm") {
      parsed.confirm = true;
    } else if (flag === "--force") {
      parsed.force = true;
    } else if (flag === "--dry-run") {
      parsed.confirm = false;
    }
  }

  return parsed;
}

async function loadRestaurants(): Promise<RestaurantProfile[]> {
  const raw = await readFile(path.join(ROOT, "data", "restaurants.seed.json"), "utf8");
  return JSON.parse(raw) as RestaurantProfile[];
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

// Re-using normalization logic from the individual scripts
function normalizeInstagramPosts(items: any[]): SocialPost[] {
    // Some actors return an array of profiles, some an array of posts.
    // Assuming the common pattern in our lib/social and actors.
    const posts = items[0]?.latestPosts || items;
    return limitRecentPosts(
      posts.map((post: any) => ({
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

function normalizeFacebookPosts(items: any[]): SocialPost[] {
    return limitRecentPosts(
      items.map((item: any) => ({
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

async function enrichRestaurant(
  restaurant: RestaurantProfile,
  platform: "instagram" | "facebook",
  actorId: string
): Promise<RestaurantProfile> {
  const url = platform === "instagram" ? restaurant.instagramUrl : restaurant.facebookUrl;
  if (!url) throw new Error(`Missing ${platform} URL for ${restaurant.name}`);

  const actorInput = platform === "instagram" 
    ? {
        directUrls: [url],
        resultsType: "details",
        resultsLimit: getSocialMaxPosts(),
        searchType: "user",
        searchLimit: 1
      }
    : {
        startUrls: [{ url }],
        resultsLimit: getSocialMaxPosts(),
        captionText: false
      };

  console.log(`  - Running Apify actor ${actorId} for ${restaurant.name}...`);
  const run = await runApifyActor(actorId, actorInput);
  const items = await fetchApifyDatasetItems<any>(run.defaultDatasetId);

  const rawDir = path.join(ROOT, "data", "raw", platform);
  await mkdir(rawDir, { recursive: true });
  const rawFilePath = path.join(rawDir, `${restaurant.slug}-batch-${timestampForFile()}.json`);
  await writeFile(rawFilePath, JSON.stringify({ actorId, actorInput, run, items }, null, 2), "utf8");

  const recentPosts = platform === "instagram" ? normalizeInstagramPosts(items) : normalizeFacebookPosts(items);
  const now = new Date().toISOString();

  const update: Partial<RestaurantProfile> = {
    socialEnrichmentStatus: "enriched" as const,
    lastSocialEnrichedAt: now,
    lastVerifiedAt: now,
    updatedAt: now,
    socialEnrichmentNotes: [
      `${platform.charAt(0).toUpperCase() + platform.slice(1)} batch enrichment via ${actorId} on ${now}.`,
      ...(restaurant.socialEnrichmentNotes ?? [])
    ]
  };

  if (platform === "instagram") {
    const profile = items[0];
    update.instagram = {
      ...restaurant.instagram,
      profileUrl: restaurant.instagramUrl ?? restaurant.instagram?.profileUrl,
      followers: profile?.followersCount ?? restaurant.instagram?.followers,
      postCount: profile?.postsCount ?? restaurant.instagram?.postCount,
      recentPosts,
      lastEnrichedAt: now
    };
  } else {
    update.facebook = {
      ...restaurant.facebook,
      pageUrl: restaurant.facebookUrl ?? restaurant.facebook?.pageUrl,
      postCount: recentPosts.length,
      recentPosts,
      lastEnrichedAt: now
    };
  }

  return applyWorkflowMetadata({ ...restaurant, ...update });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let restaurants = await loadRestaurants();

  const actorId = args.platform === "instagram" 
    ? process.env.APIFY_INSTAGRAM_ACTOR_ID 
    : process.env.APIFY_FACEBOOK_ACTOR_ID;

  if (!actorId) throw new Error(`Missing APIFY_${args.platform.toUpperCase()}_ACTOR_ID in .env.local`);

  let queue = restaurants.filter(r => {
    if ((r.reviewStatus ?? r.status) !== "included") return false;
    
    if (args.restaurant && r.name !== args.restaurant && r.slug !== args.restaurant) return false;

    const snapshot = getWorkflowSnapshot(r);
    const isReady = args.platform === "instagram" 
      ? snapshot.nextAction === "Ready for Instagram enrichment"
      : snapshot.nextAction === "Ready for Facebook enrichment";

    if (!isReady && !args.force) return false;
    
    // Check if already enriched
    const alreadyEnriched = args.platform === "instagram" 
      ? (r.instagram?.recentPosts?.length ?? 0) > 0
      : (r.facebook?.recentPosts?.length ?? 0) > 0;

    if (alreadyEnriched && !args.force) return false;

    return true;
  });

  if (args.limit) {
    queue = queue.slice(0, args.limit);
  }

  console.log(`\n--- Social Batch Enrichment (${args.platform}) ---`);
  console.log(`Targeting ${queue.length} restaurants.`);
  if (!args.confirm) console.log(`DRY RUN: No API calls will be made. Use --confirm to run live.`);

  if (queue.length === 0) {
    console.log("No restaurants found in queue.");
    return;
  }

  for (const r of queue) {
    console.log(`\nRestaurant: ${r.name}`);
    if (args.confirm) {
      try {
        const updated = await enrichRestaurant(r, args.platform, actorId);
        // Update the main list and save immediately
        restaurants = restaurants.map(item => item.id === updated.id ? updated : item);
        await writeFile(path.join(ROOT, "data", "restaurants.seed.json"), JSON.stringify(restaurants, null, 2), "utf8");
        console.log(`  - Success! Saved progress.`);
      } catch (err) {
        console.error(`  - Failed to enrich ${r.name}:`, err instanceof Error ? err.message : String(err));
      }
    } else {
      console.log(`  - [Dry Run] Would call Apify actor for ${args.platform === "instagram" ? r.instagramUrl : r.facebookUrl}`);
    }
  }

  console.log(`\nBatch complete.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`batch:social failed: ${message}`);
  process.exit(1);
});
