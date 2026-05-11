import {
  RestaurantProfile,
  SocialEnrichmentStatus,
  SocialPost,
  SocialProfileVerificationStatus
} from "../types/restaurant.js";

const DEFAULT_SOCIAL_MAX_POSTS = 10;
const STALE_SOCIAL_POST_DAYS = 60;

export function getSocialMaxPosts(): number {
  const raw = process.env.SOCIAL_MAX_POSTS?.trim();
  const parsed = raw ? Number(raw) : DEFAULT_SOCIAL_MAX_POSTS;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SOCIAL_MAX_POSTS;
  }

  return Math.floor(parsed);
}

export function sortPostsNewestFirst(posts: SocialPost[]): SocialPost[] {
  return [...posts].sort((a, b) => {
    const left = Date.parse(a.publishedAt ?? "");
    const right = Date.parse(b.publishedAt ?? "");
    const safeLeft = Number.isFinite(left) ? left : 0;
    const safeRight = Number.isFinite(right) ? right : 0;
    return safeRight - safeLeft;
  });
}

export function limitRecentPosts(posts: SocialPost[]): SocialPost[] {
  return sortPostsNewestFirst(posts).slice(0, getSocialMaxPosts());
}

export function getLatestPostDate(posts?: SocialPost[]): string | undefined {
  const latest = limitRecentPosts(posts ?? [])
    .map((post) => post.publishedAt)
    .filter((value): value is string => Boolean(value))
    .at(0);

  return latest;
}

export function isStaleLatestPost(posts?: SocialPost[]): boolean {
  const latest = getLatestPostDate(posts);

  if (!latest) {
    return false;
  }

  const timestamp = Date.parse(latest);

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  return ageDays > STALE_SOCIAL_POST_DAYS;
}

export function getSocialProfileStatus(
  restaurant: RestaurantProfile,
  platform: "facebook" | "instagram" | "tiktok"
): SocialProfileVerificationStatus {
  return restaurant.socialProfileStatus?.[platform] ?? "unknown";
}

export function hasVerifiedSocialProfile(restaurant: RestaurantProfile): boolean {
  return (
    getSocialProfileStatus(restaurant, "facebook") === "verified" ||
    getSocialProfileStatus(restaurant, "instagram") === "verified" ||
    getSocialProfileStatus(restaurant, "tiktok") === "verified"
  );
}

export function hasRecentSocialPosts(restaurant: RestaurantProfile): boolean {
  return (
    (restaurant.facebook?.recentPosts?.length ?? 0) > 0 ||
    (restaurant.instagram?.recentPosts?.length ?? 0) > 0
  );
}

export function deriveSocialEnrichmentStatus(
  restaurant: RestaurantProfile
): SocialEnrichmentStatus {
  if (restaurant.socialEnrichmentStatus === "failed") {
    return "failed";
  }

  if (hasRecentSocialPosts(restaurant)) {
    return "enriched";
  }

  if (hasVerifiedSocialProfile(restaurant)) {
    return "ready";
  }

  return "not_ready";
}

export function normalizeRestaurantSocialData(
  restaurant: RestaurantProfile
): RestaurantProfile {
  const facebookRecentPosts = limitRecentPosts(restaurant.facebook?.recentPosts ?? []);
  const instagramRecentPosts = limitRecentPosts(restaurant.instagram?.recentPosts ?? []);

  return {
    ...restaurant,
    socialEnrichmentStatus: deriveSocialEnrichmentStatus({
      ...restaurant,
      facebook: {
        ...restaurant.facebook,
        recentPosts: facebookRecentPosts
      },
      instagram: {
        ...restaurant.instagram,
        recentPosts: instagramRecentPosts
      }
    }),
    facebook: restaurant.facebook
      ? {
          ...restaurant.facebook,
          recentPosts: facebookRecentPosts,
          postCount: restaurant.facebook.postCount ?? facebookRecentPosts.length
        }
      : restaurant.facebook,
    instagram: restaurant.instagram
      ? {
          ...restaurant.instagram,
          recentPosts: instagramRecentPosts,
          postCount: restaurant.instagram.postCount ?? instagramRecentPosts.length
        }
      : restaurant.instagram
  };
}

export function buildEnrichmentSummary(params: {
  restaurantName: string;
  platform: "facebook" | "instagram";
  actorId: string;
  rawItemsReturned: number;
  normalizedPostsStored: number;
  latestPostDate?: string;
  rawFilePath: string;
  missingSignals: string[];
}): string[] {
  return [
    `Restaurant: ${params.restaurantName}`,
    `Platform: ${params.platform}`,
    `Actor ID used: ${params.actorId}`,
    `Raw items returned: ${params.rawItemsReturned}`,
    `Normalized posts stored: ${params.normalizedPostsStored}`,
    `Latest post date: ${params.latestPostDate ?? "n/a"}`,
    `Raw file path: ${params.rawFilePath}`,
    `Missing data signals: ${
      params.missingSignals.length ? params.missingSignals.join("; ") : "none"
    }`
  ];
}
