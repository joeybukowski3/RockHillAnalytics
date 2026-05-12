import { applyWorkflowMetadata } from "./workflow.js";
import {
  GooglePlaceDetailsResponse
} from "../apis/googlePlaces.js";
import { RestaurantProfile, Review } from "../types/restaurant.js";

export function mapGoogleReviews(
  reviews:
    | Array<{
        author_name?: string;
        rating?: number;
        text?: string;
        relative_time_description?: string;
        time?: number;
      }>
    | undefined
): Review[] | undefined {
  return reviews?.map((review) => ({
    authorName: review.author_name,
    rating: review.rating,
    text: review.text,
    relativeTimeDescription: review.relative_time_description,
    publishedAt: review.time ? new Date(review.time * 1000).toISOString() : undefined,
    source: "google"
  }));
}

export function applyGoogleDetailEnrichment(params: {
  restaurant: RestaurantProfile;
  details: GooglePlaceDetailsResponse;
  rawFilePath: string;
  now: string;
}): RestaurantProfile {
  const { restaurant, details, rawFilePath, now } = params;

  return applyWorkflowMetadata({
    ...restaurant,
    address: details.result?.formatted_address ?? restaurant.address,
    phone: details.result?.formatted_phone_number ?? restaurant.phone,
    website: details.result?.website ?? restaurant.website,
    googleMapsUrl: details.result?.url ?? restaurant.googleMapsUrl,
    pipelineStage: "enriched" as const,
    lastGoogleEnrichedAt: now,
    workflowNotes: [
      `Google detail enrichment completed on ${now}.`,
      ...(restaurant.workflowNotes ?? [])
    ],
    google: {
      ...restaurant.google,
      rating: details.result?.rating ?? restaurant.google?.rating,
      reviewCount: details.result?.user_ratings_total ?? restaurant.google?.reviewCount,
      priceLevel: details.result?.price_level ?? restaurant.google?.priceLevel,
      businessStatus: details.result?.business_status ?? restaurant.google?.businessStatus,
      types: details.result?.types ?? restaurant.google?.types,
      openingHours: details.result?.opening_hours?.weekday_text ?? restaurant.google?.openingHours,
      mapsUrl: details.result?.url ?? restaurant.google?.mapsUrl,
      rawReference: rawFilePath,
      reviews: mapGoogleReviews(details.result?.reviews) ?? restaurant.google?.reviews,
      lastEnrichedAt: now
    },
    lastVerifiedAt: now,
    updatedAt: now
  });
}

