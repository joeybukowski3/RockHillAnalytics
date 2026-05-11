import { RestaurantProfile, ScoreSummary } from "../types/restaurant.js";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
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

  if (restaurant.facebookUrl || restaurant.facebook?.pageUrl) {
    score += 35;
  }

  if (restaurant.instagramUrl || restaurant.instagram?.profileUrl) {
    score += 35;
  }

  if (restaurant.tiktokUrl) {
    score += 15;
  }

  if ((restaurant.facebook?.posts?.length ?? 0) > 0) {
    score += 10;
  }

  if ((restaurant.instagram?.posts?.length ?? 0) > 0) {
    score += 5;
  }

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
      "Social presence is a placeholder until Facebook and Instagram enrichment exists.",
      "Opportunity is highest when reputation is strong and social presence is weak."
    ],
    calculatedAt: new Date().toISOString()
  };
}
