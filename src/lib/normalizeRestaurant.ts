import { RestaurantProfile } from "../types/restaurant.js";
import { GooglePlaceSearchResult } from "../apis/googlePlaces.js";
import { slugify } from "./slug.js";

function buildGoogleMapsUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}

export function normalizeGooglePlacesResults(
  rawResults: GooglePlaceSearchResult[],
  sourceQueriesByPlaceId: Map<string, string[]> = new Map()
): RestaurantProfile[] {
  const now = new Date().toISOString();
  const deduped = new Map<string, RestaurantProfile>();

  for (const result of rawResults) {
    const googlePlaceId = result.place_id;
    const existing = deduped.get(googlePlaceId);

    const normalized: RestaurantProfile = {
      id: googlePlaceId,
      name: result.name,
      slug: slugify(result.name),
      city: "Rock Hill",
      state: "SC",
      category: result.types?.[0],
      address: result.formatted_address,
      googlePlaceId,
      googleMapsUrl: buildGoogleMapsUrl(googlePlaceId),
      status: "included",
      reviewStatus: "included",
      pipelineStage: "seeded",
      reviewNotes: [],
      sourceQueries: sourceQueriesByPlaceId.get(googlePlaceId) ?? [],
      lastVerifiedAt: now,
      google: {
        rating: result.rating,
        reviewCount: result.user_ratings_total,
        priceLevel: result.price_level,
        businessStatus: result.business_status,
        types: result.types,
        mapsUrl: buildGoogleMapsUrl(googlePlaceId)
      },
      insights: {
        strengths: [],
        gaps: [],
        notes: []
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    if (!existing) {
      deduped.set(googlePlaceId, normalized);
      continue;
    }

    deduped.set(googlePlaceId, {
      ...existing,
      ...normalized,
      category: existing.category ?? normalized.category,
      address: existing.address ?? normalized.address,
      reviewStatus: existing.reviewStatus ?? normalized.reviewStatus,
      sourceQueries: Array.from(
        new Set([...(existing.sourceQueries ?? []), ...(normalized.sourceQueries ?? [])])
      ),
      googleMapsUrl: existing.googleMapsUrl ?? normalized.googleMapsUrl,
      google: {
        ...existing.google,
        ...normalized.google,
        rating: Math.max(existing.google?.rating ?? 0, normalized.google?.rating ?? 0) || undefined,
        reviewCount:
          Math.max(existing.google?.reviewCount ?? 0, normalized.google?.reviewCount ?? 0) ||
          undefined,
        types: Array.from(
          new Set([...(existing.google?.types ?? []), ...(normalized.google?.types ?? [])])
        )
      }
    });
  }

  return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name));
}
