import { getSocialProfileStatus, hasRecentSocialPosts } from "./social.js";
import {
  RestaurantProfile,
  SocialProfileVerificationStatus,
  SocialReviewStatus,
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
  socialReviewStatus: SocialReviewStatus;
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

function hasGoogleCoverage(restaurant: RestaurantProfile): boolean {
  return hasGoogleSeedData(restaurant) || hasGoogleDetailEnrichment(restaurant);
}

function hasVerifiedStatus(value: SocialProfileVerificationStatus): boolean {
  return value === "verified";
}

function hasReviewedSocialProfile(value: SocialProfileVerificationStatus): boolean {
  return value !== "unknown";
}

function isSocialReviewComplete(status: SocialReviewStatus): boolean {
  return status === "verified" || status === "not_found";
}

function isSocialReviewIncomplete(status: SocialReviewStatus): boolean {
  return status === "not_started" || status === "in_progress" || status === "partial";
}

function hasVerifiedSocialLink(restaurant: RestaurantProfile, platform: "facebook" | "instagram"): boolean {
  return hasVerifiedStatus(getSocialProfileStatus(restaurant, platform));
}

export function getSocialReviewStatus(restaurant: RestaurantProfile): SocialReviewStatus {
  const facebook = getSocialProfileStatus(restaurant, "facebook");
  const instagram = getSocialProfileStatus(restaurant, "instagram");
  const reviewedProfiles = [facebook, instagram].filter(hasReviewedSocialProfile);

  if (facebook === "not_found" && instagram === "not_found") {
    return "not_found";
  }

  if (
    (facebook === "verified" && instagram === "not_found") ||
    (instagram === "verified" && facebook === "not_found") ||
    (facebook === "verified" && instagram === "verified")
  ) {
    return "verified";
  }

  if (reviewedProfiles.length > 0) {
    return "partial";
  }

  const explicit = restaurant.socialReviewStatus;

  if (explicit === "verified" || explicit === "not_found" || explicit === "partial" || explicit === "in_progress") {
    return explicit;
  }

  return restaurant.lastSocialReviewedAt ? "in_progress" : "not_started";
}

function hasSocialReviewCoverage(restaurant: RestaurantProfile): boolean {
  return isSocialReviewComplete(getSocialReviewStatus(restaurant));
}

function hasPartialSocialReview(restaurant: RestaurantProfile): boolean {
  return isSocialReviewIncomplete(getSocialReviewStatus(restaurant));
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

  if (!hasGoogleCoverage(restaurant)) {
    missing.push("google enrichment");
  }

  const socialReviewStatus = getSocialReviewStatus(restaurant);

  if (isSocialReviewIncomplete(socialReviewStatus)) {
    missing.push("social URL review");
  }

  if (hasVerifiedSocialLink(restaurant, "instagram") && !(restaurant.instagram?.recentPosts?.length ?? 0)) {
    missing.push("instagram enrichment");
  }

  if (hasVerifiedSocialLink(restaurant, "facebook") && !(restaurant.facebook?.recentPosts?.length ?? 0)) {
    missing.push("facebook enrichment");
  }

  if (!hasScore(restaurant) && !isSocialReviewIncomplete(socialReviewStatus)) {
    missing.push("scoring");
  }

  if (!restaurant.readyForReport) {
    missing.push("report readiness");
  }

  return missing;
}

function buildSuggestedCommands(restaurant: RestaurantProfile, nextAction: WorkflowAction): string[] {
  const name = restaurant.name.replace(/"/g, '\\"');
  const googleCommand = `npm run enrich:google -- "${name}"`;
  const verifiedSocialCommand = `npm run add:social -- "${name}" --facebook "URL" --instagram "URL" --notes "Manually verified official social profiles"`;
  const noSocialCommand = `npm run add:social -- "${name}" --no-facebook --no-instagram --notes "No official Facebook or Instagram found during manual check"`;
  const instagramCommand = `npm run enrich:instagram -- "${name}"`;
  const facebookCommand = `npm run enrich:facebook -- "${name}"`;
  const scoreCommand = `npm run score -- "${name}"`;
  const reportCommand = `npm run report -- "${name}"`;

  if (nextAction === "Needs Google enrichment") {
    return [googleCommand];
  }

  if (nextAction === "Needs social URL review") {
    return [verifiedSocialCommand, noSocialCommand];
  }

  if (nextAction === "Ready for Instagram enrichment") {
    return [instagramCommand];
  }

  if (nextAction === "Ready for Facebook enrichment") {
    return [facebookCommand];
  }

  if (nextAction === "Needs scoring") {
    return [scoreCommand, reportCommand];
  }

  if (nextAction === "Ready for report") {
    return [reportCommand];
  }

  return [googleCommand, verifiedSocialCommand, noSocialCommand, instagramCommand, facebookCommand, scoreCommand, reportCommand];
}

function calculateCompleteness(restaurant: RestaurantProfile): number {
  if (!isIncludedRestaurant(restaurant)) {
    return 0;
  }

  let points = 0;

  points += 10;

  if (hasGoogleSeedData(restaurant)) {
    points += 10;
  }

  if (hasGoogleDetailEnrichment(restaurant)) {
    points += 20;
  }

  const socialReviewStatus = getSocialReviewStatus(restaurant);

  if (socialReviewStatus === "verified") {
    points += 15;
  } else if (socialReviewStatus === "not_found") {
    points += 12;
  } else if (socialReviewStatus === "partial") {
    points += 8;
  } else if (socialReviewStatus === "in_progress") {
    points += 5;
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

  if (hasSocialEnrichment(restaurant)) {
    return "social_enriched";
  }

  const socialReviewStatus = getSocialReviewStatus(restaurant);

  if (socialReviewStatus === "verified") {
    return "social_links_verified";
  }

  if (socialReviewStatus === "not_found" && hasScore(restaurant)) {
    return "scored";
  }

  if (socialReviewStatus === "not_found" || hasPartialSocialReview(restaurant)) {
    return "social_review_needed";
  }

  if (hasScore(restaurant)) {
    return "scored";
  }

  if (hasGoogleCoverage(restaurant)) {
    return "social_review_needed";
  }

  return "discovered";
}

export function getNextRecommendedAction(restaurant: RestaurantProfile): WorkflowAction {
  if (!isIncludedRestaurant(restaurant)) {
    return "Complete for MVP";
  }

  if (!hasGoogleCoverage(restaurant)) {
    return "Needs Google enrichment";
  }

  const socialReviewStatus = getSocialReviewStatus(restaurant);

  if (isSocialReviewIncomplete(socialReviewStatus)) {
    return "Needs social URL review";
  }

  if (hasVerifiedSocialLink(restaurant, "instagram") && !(restaurant.instagram?.recentPosts?.length ?? 0)) {
    return "Ready for Instagram enrichment";
  }

  if (hasVerifiedSocialLink(restaurant, "facebook") && !(restaurant.facebook?.recentPosts?.length ?? 0)) {
    return "Ready for Facebook enrichment";
  }

  if (socialReviewStatus === "not_found" && !hasScore(restaurant)) {
    return "Needs scoring";
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
  const socialReviewStatus = getSocialReviewStatus(restaurant);
  const readyForReport = Boolean(
    isIncludedRestaurant(restaurant) &&
      hasGoogleCoverage(restaurant) &&
      hasScore(restaurant) &&
      !isSocialReviewIncomplete(socialReviewStatus) &&
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
    `Social review status: ${socialReviewStatus}.`,
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
      socialReviewStatus,
      readyForReport
    }),
    missingData,
    readyForReport,
    socialReviewStatus,
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
    dataCompletenessScore: snapshot.dataCompletenessScore,
    socialReviewStatus: snapshot.socialReviewStatus
  };
}

export function findWorkflowInconsistencies(restaurant: RestaurantProfile): string[] {
  const issues: string[] = [];
  const socialReviewStatus = getSocialReviewStatus(restaurant);

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

  if (isIncludedRestaurant(restaurant) && hasScore(restaurant) && !hasGoogleCoverage(restaurant)) {
    issues.push("Scoring exists before Google detail enrichment was completed.");
  }

  if (isIncludedRestaurant(restaurant) && hasSocialEnrichment(restaurant) && !isSocialReviewComplete(socialReviewStatus)) {
    issues.push("Social enrichment exists before Facebook/Instagram review statuses were fully set.");
  }

  if (restaurant.socialReviewStatus === "verified" && !isSocialReviewComplete(socialReviewStatus)) {
    issues.push("socialReviewStatus is verified but Facebook/Instagram review statuses are incomplete.");
  }

  if (restaurant.socialReviewStatus === "not_found" && hasVerifiedSocialLink(restaurant, "facebook")) {
    issues.push("socialReviewStatus is not_found but Facebook is verified.");
  }

  if (restaurant.socialReviewStatus === "not_found" && hasVerifiedSocialLink(restaurant, "instagram")) {
    issues.push("socialReviewStatus is not_found but Instagram is verified.");
  }

  return issues;
}
