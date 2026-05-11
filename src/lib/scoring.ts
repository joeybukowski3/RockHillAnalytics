import { getLatestPostDate } from "./social.js";
import { RestaurantProfile, ScoreSummary } from "../types/restaurant.js";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getLatestPostTimestamp(restaurant: RestaurantProfile): number | undefined {
  const latest = [
    getLatestPostDate(restaurant.facebook?.recentPosts),
    getLatestPostDate(restaurant.instagram?.recentPosts)
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));

  if (latest.length === 0) {
    return undefined;
  }

  return Math.max(...latest);
}

function getAverageEngagement(restaurant: RestaurantProfile): number {
  const posts = [
    ...(restaurant.facebook?.recentPosts ?? []),
    ...(restaurant.instagram?.recentPosts ?? [])
  ];

  if (posts.length === 0) {
    return 0;
  }

  const total = posts.reduce((sum, post) => {
    const likes = post.engagement?.likes ?? 0;
    const comments = post.engagement?.comments ?? 0;
    const shares = post.engagement?.shares ?? 0;
    const views = post.engagement?.views ?? 0;
    return sum + likes + comments * 2 + shares * 3 + Math.min(views / 100, 20);
  }, 0);

  return total / posts.length;
}

export function calculateReputationScore(restaurant: RestaurantProfile): number {
  const rating = restaurant.google?.rating ?? 0;
  const reviewCount = restaurant.google?.reviewCount ?? 0;
  const ratingComponent = (rating / 5) * 70;
  const volumeComponent = Math.min(30, Math.log10(reviewCount + 1) * 15);

  return clampScore(ratingComponent + volumeComponent);
}

export function calculateSocialPresenceScore(restaurant: RestaurantProfile): number {
  let score = 0;
  const facebookStatus = restaurant.socialProfileStatus?.facebook ?? "unknown";
  const instagramStatus = restaurant.socialProfileStatus?.instagram ?? "unknown";
  const tiktokStatus = restaurant.socialProfileStatus?.tiktok ?? "unknown";
  const facebookPosts = restaurant.facebook?.recentPosts ?? [];
  const instagramPosts = restaurant.instagram?.recentPosts ?? [];

  if (facebookStatus === "verified" && (restaurant.facebookUrl || restaurant.facebook?.pageUrl)) {
    score += 20;
  } else if (facebookStatus === "not_found") {
    score += 2;
  }

  if (instagramStatus === "verified" && (restaurant.instagramUrl || restaurant.instagram?.profileUrl)) {
    score += 20;
  } else if (instagramStatus === "not_found") {
    score += 2;
  }

  if (tiktokStatus === "verified" && restaurant.tiktokUrl) {
    score += 10;
  } else if (tiktokStatus === "not_found") {
    score += 1;
  }

  score += Math.min(20, facebookPosts.length * 2 + instagramPosts.length * 2);

  const latestPostTimestamp = getLatestPostTimestamp(restaurant);

  if (latestPostTimestamp) {
    const daysSinceLatestPost = (Date.now() - latestPostTimestamp) / (1000 * 60 * 60 * 24);

    if (daysSinceLatestPost <= 14) {
      score += 20;
    } else if (daysSinceLatestPost <= 45) {
      score += 12;
    } else if (daysSinceLatestPost <= 90) {
      score += 6;
    }
  }

  score += Math.min(10, getAverageEngagement(restaurant) / 10);

  return clampScore(score);
}

export function calculateOpportunityScore(restaurant: RestaurantProfile): number {
  const reputation = calculateReputationScore(restaurant);
  const socialPresence = calculateSocialPresenceScore(restaurant);

  return clampScore(reputation * 0.7 + (100 - socialPresence) * 0.3);
}

export function calculateOverallScore(restaurant: RestaurantProfile): ScoreSummary {
  const reputation = calculateReputationScore(restaurant);
  const socialPresence = calculateSocialPresenceScore(restaurant);
  const opportunity = calculateOpportunityScore(restaurant);
  const overall = clampScore(reputation * 0.45 + socialPresence * 0.2 + opportunity * 0.35);

  return {
    reputation,
    socialPresence,
    opportunity,
    overall,
    notes: [
      "Reputation is based on Google rating and review volume.",
      "Social presence uses verified social profiles, recent post volume, post recency, and lightweight engagement signals.",
      "Opportunity is higher when reputation is strong but social presence is still weak or missing.",
      "No social profile found is treated as a marketing opportunity rather than a data failure.",
      "Strong reputation plus strong social presence lowers immediate opportunity while improving public presence."
    ],
    calculatedAt: new Date().toISOString()
  };
}
