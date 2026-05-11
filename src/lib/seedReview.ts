import { RestaurantProfile, RestaurantReviewStatus } from "../types/restaurant.js";

const INCLUDED_FOOD_TYPES = new Set([
  "restaurant",
  "cafe",
  "bakery",
  "bar",
  "meal_takeaway",
  "meal_delivery"
]);

const EXCLUDED_TYPES = new Set([
  "grocery_or_supermarket",
  "supermarket",
  "clothing_store",
  "furniture_store",
  "home_goods_store",
  "florist",
  "art_gallery"
]);

const MANUAL_OVERRIDES: Record<
  string,
  { status: RestaurantReviewStatus; notes: string[] }
> = {
  "the-power-house-luxury-living-entertainment-events-and-restaurants": {
    status: "excluded",
    notes: ["Venue/complex listing rather than a single restaurant entity."]
  },
  "the-mercantile-by-copper-dwelling-design": {
    status: "excluded",
    notes: ["Retail/home goods business, not a standalone restaurant record."]
  },
  "las-americas-supermarket": {
    status: "excluded",
    notes: ["Grocery/supermarket listing rather than a restaurant."]
  },
  "salt-water-seafood-market-inc": {
    status: "excluded",
    notes: ["Seafood market listing rather than a dine-in restaurant."]
  },
  "jennie-maes-southern-cuisine-llc-catering-services": {
    status: "excluded",
    notes: ["Catering-focused listing; not a standard restaurant storefront."]
  },
  "luigi-sons-now-rizzo-brothers": {
    status: "needs_review",
    notes: ["Name suggests a rename or merged listing; verify current branding."]
  },
  "jackass-caf-wine-bar": {
    status: "needs_review",
    notes: ["Mixed-use retail/cafe record; verify it should remain in the restaurant master list."]
  },
  "cibi-cibi": {
    status: "needs_review",
    notes: ["Sparse Google types; verify this is an active standalone restaurant concept."]
  },
  "ko-op-kitchen": {
    status: "needs_review",
    notes: ["Sparse Google types; verify this is an active public-facing restaurant."]
  },
  "rock-hill-brewing-company": {
    status: "needs_review",
    notes: ["Brewery/taproom record; verify food-service scope for restaurant tracking."]
  },
  "lake-wylie-brewing-co-rock-hill": {
    status: "needs_review",
    notes: ["Brewery record without explicit restaurant type; verify food-service scope."]
  },
  "techno-caf": {
    status: "needs_review",
    notes: ["Name and location suggest a workplace cafe; verify public-facing restaurant status."]
  },
  "royal-eats-wings-and-potatoes": {
    status: "needs_review",
    notes: ["Sparse Google types; verify current operating format and storefront details."]
  }
};

function extractCity(address?: string): string | undefined {
  if (!address) {
    return undefined;
  }

  const match = address.match(/,\s*([^,]+),\s*[A-Z]{2}\s+\d{5}/);

  if (match) {
    return match[1]?.trim();
  }

  const parts = address.split(",").map((part) => part.trim());
  return parts.length >= 2 ? parts[parts.length - 2] : undefined;
}

export function isOutsideRockHill(restaurant: RestaurantProfile): boolean {
  const city = extractCity(restaurant.address);
  return Boolean(city && city !== "Rock Hill");
}

function hasIncludedFoodType(restaurant: RestaurantProfile): boolean {
  const types = restaurant.google?.types ?? [];
  return types.some((type) => INCLUDED_FOOD_TYPES.has(type));
}

function hasExcludedType(restaurant: RestaurantProfile): boolean {
  const types = restaurant.google?.types ?? [];
  return types.some((type) => EXCLUDED_TYPES.has(type));
}

function canonicalDuplicateKey(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(rock hill|fort mill|indian land|tega cay|newport|riverwalk|cherry location|heckle location|ii)\b/g,
      ""
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findPossibleDuplicates(
  restaurants: RestaurantProfile[]
): Array<{ key: string; restaurants: RestaurantProfile[] }> {
  const groups = new Map<string, RestaurantProfile[]>();

  for (const restaurant of restaurants) {
    const key = canonicalDuplicateKey(restaurant.name);

    if (!key) {
      continue;
    }

    const existing = groups.get(key) ?? [];
    existing.push(restaurant);
    groups.set(key, existing);
  }

  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, restaurants: group }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function reviewRestaurant(
  restaurant: RestaurantProfile,
  duplicateKeys = new Set<string>()
): Pick<
  RestaurantProfile,
  "status" | "reviewNotes" | "lastVerifiedAt"
> {
  const now = new Date().toISOString();
  const notes: string[] = [];
  let status: RestaurantReviewStatus = "included";
  const businessStatus = restaurant.google?.businessStatus;

  if (businessStatus && businessStatus !== "OPERATIONAL") {
    status = "closed";
    notes.push(`Google business status is ${businessStatus}.`);
  }

  if (isOutsideRockHill(restaurant)) {
    status = "excluded";
    notes.push(`Outside Rock Hill target geography: ${extractCity(restaurant.address) ?? "unknown city"}.`);
  }

  if (restaurant.name.toLowerCase().includes("catering")) {
    status = "excluded";
    notes.push("Catering-only keyword detected in business name.");
  }

  if (hasExcludedType(restaurant)) {
    status = status === "closed" ? status : "excluded";
    notes.push("Google types indicate retail/grocery rather than a primary restaurant listing.");
  }

  if (!hasIncludedFoodType(restaurant) && status === "included") {
    status = "needs_review";
    notes.push("Missing clear restaurant/cafe/bar/meal service Google type.");
  }

  if (duplicateKeys.has(restaurant.slug) && status === "included") {
    notes.push("Possible duplicate or same-brand multi-location listing; verify intended inclusion.");
  }

  const override = MANUAL_OVERRIDES[restaurant.slug];

  if (override) {
    status = override.status;
    notes.push(...override.notes);
  }

  return {
    status,
    reviewNotes: Array.from(new Set(notes)),
    lastVerifiedAt: now
  };
}

export function applySeedReview(
  restaurants: RestaurantProfile[]
): RestaurantProfile[] {
  const duplicateKeys = new Set<string>();

  for (const group of findPossibleDuplicates(restaurants)) {
    for (const restaurant of group.restaurants) {
      duplicateKeys.add(restaurant.slug);
    }
  }

  return restaurants.map((restaurant) => {
    const review = reviewRestaurant(restaurant, duplicateKeys);

    return {
      ...restaurant,
      status: review.status,
      reviewNotes: review.reviewNotes,
      sourceQueries: Array.from(new Set(restaurant.sourceQueries ?? [])),
      lastVerifiedAt: review.lastVerifiedAt,
      pipelineStage: restaurant.pipelineStage ?? "seeded"
    };
  });
}
