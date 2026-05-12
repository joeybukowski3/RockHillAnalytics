import { getLatestPostDate, getSocialProfileStatus, hasRecentSocialPosts } from "./social.js";
import {
  RestaurantProfile,
  SocialProfileVerificationStatus,
  WorkflowStage
} from "../types/restaurant.js";

export type WorkflowAction =
  | "Needs Google enrichment"
  | "Needs social URL review"
  | "Ready for Instagram enrichment"
  | "Ready for Facebook enrichment"
  | "Needs scoring"
  | "Ready for report"
  | "Complete for MVP";

export type WorkflowSnapshot = {
  workflowStage: WorkflowStage;
  nextAction: WorkflowAction;
  dataCompletenessScore: number;
  missingData: string[];
  readyForReport: boolean;
  workflowNotes: string[];
  suggestedCommands: string[];
};

function isIncludedRestaurant(restaurant: RestaurantProfile): boolean {
  return (restaurant.reviewStatus ?? restaurant.status) === "included";
}

function hasGoogleSeedData(restaurant: RestaurantProfile): boolean {
  return Boolean(
    restaurant.googlePlaceId ||
      restaurant.google?.rating !== undefined ||
      restaurant.google?.reviewCount !== undefined ||
      restaurant.googleMapsUrl ||
      restaurant.google?.mapsUrl
  );
}

function hasGoogleDetailEnrichment(restaurant: RestaurantProfile): boolean {
  return Boolean(
    restaurant.lastGoogleEnrichedAt ||
      restaurant.google?.lastEnrichedAt ||
      restaurant.phone ||
      restaurant.website ||
      restaurant.google?.openingHours?.length ||
      restaurant.google?.reviews?.length ||
      restaurant.google?.rawReference
  );
}

function hasVerifiedStatus(value: SocialProfileVerificationStatus): boolean {
  return value === "verified";
}

function hasSocialReviewCoverage(restaurant: RestaurantProfile): boolean {
  const facebook = getSocialProfileStatus(restaurant, "facebook");
  const instagram = getSocialProfileStatus(restaurant, "instagram");
  return facebook !== "unknown" && instagram !== "unknown";
}

function hasPartialSocialReview(restaurant: RestaurantProfile): boolean {
  const facebook = getSocialProfileStatus(restaurant, "facebook");
  const instagram = getSocialProfileStatus(restaurant, "instagram");
  return facebook !== "unknown" || instagram !== "unknown" || Boolean(restaurant.lastSocialReviewedAt);
}

function hasVerifiedSocialLink(restaurant: RestaurantProfile, platform: "facebook" | "instagram"): boolean {
  return hasVerifiedStatus(getSocialProfileStatus(restaurant, platform));
}

function hasSocialEnrichment(restaurant: RestaurantProfile): boolean {
  return Boolean(restaurant.lastSocialEnrichedAt || hasRecentSocialPosts(restaurant));
}

function hasScore(restaurant: RestaurantProfile): boolean {
  return Boolean(restaurant.scores?.overall !== undefined || restaurant.lastScoredAt);
}

function hasReport(restaurant: RestaurantProfile): boolean {
  return restaurant.pipelineStage === "reported";
}

function buildMissingData(restaurant: RestaurantProfile): string[] {
  const missing: string[] = [];

  if (!isIncludedRestaurant(restaurant)) {
    return missing;
  }

  if (!hasGoogleDetailEnrichment(restaurant)) {
    missing.push("google enrichment");
  }

  if (!hasSocialReviewCoverage(restaurant)) {
    missing.push("social URL review");
  }

  if (hasVerifiedSocialLink(restaurant, "instagram") && !(restaurant.instagram?.recentPosts?.length ?? 0)) {
    missing.push("instagram enrichment");
  }

  if (hasVerifiedSocialLink(restaurant, "facebook") && !(restaurant.facebook?.recentPosts?.length ?? 0)) {
    missing.push("facebook enrichment");
  }

  if (!hasScore(restaurant)) {
    missing.push("scoring");
  }

  if (!restaurant.readyForReport) {
    missing.push("report readiness");
  }

  return missing;
}

function buildSuggestedCommands(restaurant: RestaurantProfile, nextAction: WorkflowAction): string[] {
  const name = restaurant.name.replace(/"/g, '\\"');
  const commands = [
    `npm run enrich:google -- "${name}"`,
    `npm run add:social -- "${name}" --facebook "URL" --instagram "URL" --notes "Manually verified official social profiles"`,
    `npm run enrich:instagram -- "${name}"`,
    `npm run enrich:facebook -- "${name}"`,
    `npm run score -- "${name}"`,
    `npm run report -- "${name}"`
  ];

  if (nextAction === "Needs Google enrichment") {
    return [commands[0]];
  }

  if (nextAction === "Needs social URL review") {
    return [commands[1]];
  }

  if (nextAction === "Ready for Instagram enrichment") {
    return [commands[2]];
  }

  if (nextAction === "Ready for Facebook enrichment") {
    return [commands[3]];
  }

  if (nextAction === "Needs scoring") {
    return [commands[4], commands[5]];
  }

  if (nextAction === "Ready for report") {
    return [commands[5]];
  }

  return commands;
}

function calculateCompleteness(restaurant: RestaurantProfile): number {
  if (!isIncludedRestaurant(restaurant)) {
    return 0;
  }

  let points = 0;

  if (isIncludedRestaurant(restaurant)) {
    points += 10;
  }

  if (hasGoogleSeedData(restaurant)) {
    points += 10;
  }

  if (hasGoogleDetailEnrichment(restaurant)) {
    points += 20;
  }

  if (hasSocialReviewCoverage(restaurant)) {
    points += 15;
  }

  if (hasVerifiedSocialLink(restaurant, "instagram") || getSocialProfileStatus(restaurant, "instagram") === "not_found") {
    points += 10;
  }

  if (hasVerifiedSocialLink(restaurant, "facebook") || getSocialProfileStatus(restaurant, "facebook") === "not_found") {
    points += 10;
  }

  if ((restaurant.instagram?.recentPosts?.length ?? 0) > 0) {
    points += 10;
  }

  if ((restaurant.facebook?.recentPosts?.length ?? 0) > 0) {
    points += 10;
  }

  if (hasScore(restaurant)) {
    points += 10;
  }

  if (restaurant.readyForReport) {
    points += 5;
  }

  return Math.max(0, Math.min(100, points));
}

export function getWorkflowStage(restaurant: RestaurantProfile): WorkflowStage {
  if (hasReport(restaurant)) {
    return "report_generated";
  }

  if (!isIncludedRestaurant(restaurant)) {
    return "discovered";
  }

  if (restaurant.readyForReport) {
    return "ready_for_report";
  }

  if (hasScore(restaurant)) {
    return "scored";
  }

  if (hasSocialEnrichment(restaurant)) {
    return "social_enriched";
  }

  if (hasSocialReviewCoverage(restaurant)) {
    return "social_links_verified";
  }

  if (hasPartialSocialReview(restaurant)) {
    return "social_review_needed";
  }

  if (hasGoogleDetailEnrichment(restaurant) || restaurant.pipelineStage === "enriched") {
    return "google_enriched";
  }

  return "discovered";
}

export function getNextRecommendedAction(restaurant: RestaurantProfile): WorkflowAction {
  if (!isIncludedRestaurant(restaurant)) {
    return "Complete for MVP";
  }

  if (!hasGoogleDetailEnrichment(restaurant)) {
    return "Needs Google enrichment";
  }

  if (!hasSocialReviewCoverage(restaurant)) {
    return "Needs social URL review";
  }

  if (hasVerifiedSocialLink(restaurant, "instagram") && !(restaurant.instagram?.recentPosts?.length ?? 0)) {
    return "Ready for Instagram enrichment";
  }

  if (hasVerifiedSocialLink(restaurant, "facebook") && !(restaurant.facebook?.recentPosts?.length ?? 0)) {
    return "Ready for Facebook enrichment";
  }

  if (!hasScore(restaurant)) {
    return "Needs scoring";
  }

  if (!restaurant.readyForReport) {
    return "Ready for report";
  }

  return "Complete for MVP";
}

export function getWorkflowSnapshot(restaurant: RestaurantProfile): WorkflowSnapshot {
  const readyForReport = Boolean(
    isIncludedRestaurant(restaurant) &&
      hasGoogleDetailEnrichment(restaurant) &&
      hasScore(restaurant) &&
      hasSocialReviewCoverage(restaurant) &&
      (!hasVerifiedSocialLink(restaurant, "instagram") || (restaurant.instagram?.recentPosts?.length ?? 0) > 0) &&
      (!hasVerifiedSocialLink(restaurant, "facebook") || (restaurant.facebook?.recentPosts?.length ?? 0) > 0)
  );
  const nextAction = getNextRecommendedAction({
    ...restaurant,
    readyForReport
  });
  const workflowStage = getWorkflowStage({
    ...restaurant,
    readyForReport
  });
  const missingData = buildMissingData({
    ...restaurant,
    readyForReport
  });
  const workflowNotes = [
    `Current stage: ${workflowStage}.`,
    `Next action: ${nextAction}.`,
    readyForReport
      ? "Record has enough structured data to generate a final report later."
      : "Record still has workflow gaps before final reporting."
  ];

  return {
    workflowStage,
    nextAction,
    dataCompletenessScore: calculateCompleteness({
      ...restaurant,
      readyForReport
    }),
    missingData,
    readyForReport,
    workflowNotes,
    suggestedCommands: buildSuggestedCommands(restaurant, nextAction)
  };
}

export function applyWorkflowMetadata(restaurant: RestaurantProfile): RestaurantProfile {
  const snapshot = getWorkflowSnapshot(restaurant);

  return {
    ...restaurant,
    workflowStage: snapshot.workflowStage,
    workflowNotes: snapshot.workflowNotes,
    readyForReport: snapshot.readyForReport,
    dataCompletenessScore: snapshot.dataCompletenessScore
  };
}

export function findWorkflowInconsistencies(restaurant: RestaurantProfile): string[] {
  const issues: string[] = [];

  if (restaurant.readyForReport && !hasScore(restaurant)) {
    issues.push("readyForReport is true but no score is stored.");
  }

  if (restaurant.socialEnrichmentStatus === "enriched" && !hasRecentSocialPosts(restaurant)) {
    issues.push("socialEnrichmentStatus is enriched but no recent posts are stored.");
  }

  if (hasVerifiedSocialLink(restaurant, "instagram") && !restaurant.instagramUrl) {
    issues.push("Instagram marked verified but instagramUrl is missing.");
  }

  if (hasVerifiedSocialLink(restaurant, "facebook") && !restaurant.facebookUrl) {
    issues.push("Facebook marked verified but facebookUrl is missing.");
  }

  if (isIncludedRestaurant(restaurant) && hasScore(restaurant) && !hasGoogleDetailEnrichment(restaurant)) {
    issues.push("Scoring exists before Google detail enrichment was completed.");
  }

  if (isIncludedRestaurant(restaurant) && hasSocialEnrichment(restaurant) && !hasSocialReviewCoverage(restaurant)) {
    issues.push("Social enrichment exists before Facebook/Instagram review statuses were fully set.");
  }

  return issues;
}
