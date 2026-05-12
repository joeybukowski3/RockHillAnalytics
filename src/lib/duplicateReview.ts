import { DuplicateReviewStatus, RestaurantProfile } from "../types/restaurant.js";

export type DuplicateConfidence = "high" | "medium" | "low";

export type DuplicateReviewCategory =
  | "exact_duplicate"
  | "possible_duplicate"
  | "multi_location";

export type DuplicateReviewGroup = {
  key: string;
  category: DuplicateReviewCategory;
  confidence: DuplicateConfidence;
  reason: string;
  recommendedAction: string;
  restaurants: RestaurantProfile[];
};

type CandidateGroup = {
  key: string;
  category: DuplicateReviewCategory;
  confidence: DuplicateConfidence;
  reason: string;
  recommendedAction: string;
  restaurants: RestaurantProfile[];
};

const CATEGORY_PRIORITY: Record<DuplicateReviewCategory, number> = {
  exact_duplicate: 3,
  possible_duplicate: 2,
  multi_location: 1
};

const CONFIDENCE_PRIORITY: Record<DuplicateConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1
};

function normalize(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeName(value?: string): string {
  return normalize(value)
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(the|restaurant|grill|bar|cafe|caf|pizza|pizzeria|mexican|brewery|brewing|company|co|llc|inc|ste|suite)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAddress(value?: string): string {
  return normalize(value)
    .replace(/\b(ste|suite|unit|#)\b/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(value?: string): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeWebsite(value?: string): string {
  return normalize(value)
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function normalizeMapsUrl(value?: string): string {
  return normalize(value)
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function tokenizeName(value?: string): string[] {
  return normalizeName(value)
    .split(" ")
    .filter(Boolean);
}

function buildNameKey(name?: string): string {
  return tokenizeName(name).join("-");
}

function sameTokens(left: string[], right: string[]): boolean {
  return left.length > 0 && right.length > 0 && left.join(" ") === right.join(" ");
}

function similarName(left?: string, right?: string): boolean {
  const leftTokens = tokenizeName(left);
  const rightTokens = tokenizeName(right);

  if (sameTokens(leftTokens, rightTokens)) {
    return true;
  }

  const shared = leftTokens.filter((token) => rightTokens.includes(token));
  const maxLength = Math.max(leftTokens.length, rightTokens.length);
  return maxLength > 0 && shared.length / maxLength >= 0.67;
}

function sameAddress(left?: string, right?: string): boolean {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function similarAddress(left?: string, right?: string): boolean {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const leftCore = normalizedLeft.split(" ").slice(0, 4).join(" ");
  const rightCore = normalizedRight.split(" ").slice(0, 4).join(" ");
  return Boolean(leftCore && rightCore && leftCore === rightCore);
}

function samePhone(left?: string, right?: string): boolean {
  const normalizedLeft = normalizePhone(left);
  const normalizedRight = normalizePhone(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function sameWebsite(left?: string, right?: string): boolean {
  const normalizedLeft = normalizeWebsite(left);
  const normalizedRight = normalizeWebsite(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function sameMapsUrl(left?: string, right?: string): boolean {
  const normalizedLeft = normalizeMapsUrl(left);
  const normalizedRight = normalizeMapsUrl(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function samePlaceId(left?: string, right?: string): boolean {
  return Boolean(left && right && left === right);
}

function differentAddress(left?: string, right?: string): boolean {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft !== normalizedRight);
}

function differentPhone(left?: string, right?: string): boolean {
  const normalizedLeft = normalizePhone(left);
  const normalizedRight = normalizePhone(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft !== normalizedRight);
}

function recommendedAction(category: DuplicateReviewCategory): string {
  if (category === "exact_duplicate") {
    return "review for merge/exclusion";
  }

  if (category === "possible_duplicate") {
    return "manual review needed";
  }

  return "keep separate location-specific records";
}

function comparePair(
  left: RestaurantProfile,
  right: RestaurantProfile
): Omit<DuplicateReviewGroup, "restaurants"> | null {
  const nameKey = buildNameKey(left.name || right.name);
  const groupKeyBase = nameKey || "unnamed";
  const exactPlaceId = samePlaceId(left.googlePlaceId, right.googlePlaceId);
  const exactAddress = sameAddress(left.address, right.address);
  const exactPhone = samePhone(left.phone, right.phone);
  const exactWebsite = sameWebsite(left.website, right.website);
  const exactMaps = sameMapsUrl(left.googleMapsUrl ?? left.google?.mapsUrl, right.googleMapsUrl ?? right.google?.mapsUrl);
  const sameName = sameTokens(tokenizeName(left.name), tokenizeName(right.name));
  const closeName = similarName(left.name, right.name);
  const closeAddress = similarAddress(left.address, right.address);
  const separateAddress = differentAddress(left.address, right.address);
  const separatePhone = differentPhone(left.phone, right.phone);
  const separatePlaceId = Boolean(
    left.googlePlaceId &&
      right.googlePlaceId &&
      left.googlePlaceId !== right.googlePlaceId
  );

  if (exactPlaceId) {
    return {
      key: `place:${left.googlePlaceId}`,
      category: "exact_duplicate",
      confidence: "high",
      reason: "Same Google Place ID.",
      recommendedAction: recommendedAction("exact_duplicate")
    };
  }

  if (sameName && exactAddress) {
    return {
      key: `name-address:${groupKeyBase}:${normalizeAddress(left.address)}`,
      category: "exact_duplicate",
      confidence: "high",
      reason: "Same normalized name and same address.",
      recommendedAction: recommendedAction("exact_duplicate")
    };
  }

  if (sameName && exactPhone) {
    return {
      key: `name-phone:${groupKeyBase}:${normalizePhone(left.phone)}`,
      category: "exact_duplicate",
      confidence: "high",
      reason: "Same normalized name and same phone number.",
      recommendedAction: recommendedAction("exact_duplicate")
    };
  }

  if (exactWebsite && separateAddress && separatePlaceId) {
    return {
      key: `multi:${groupKeyBase}`,
      category: "multi_location",
      confidence: separatePhone ? "high" : "medium",
      reason: "Same website and brand name, but different address and different Google Place IDs indicate separate locations.",
      recommendedAction: recommendedAction("multi_location")
    };
  }

  if (exactWebsite && exactAddress) {
    return {
      key: `website-address:${normalizeWebsite(left.website)}:${normalizeAddress(left.address)}`,
      category: "exact_duplicate",
      confidence: "high",
      reason: "Same website and same address.",
      recommendedAction: recommendedAction("exact_duplicate")
    };
  }

  if (exactMaps) {
    return {
      key: `maps:${normalizeMapsUrl(left.googleMapsUrl ?? left.google?.mapsUrl)}`,
      category: "exact_duplicate",
      confidence: "high",
      reason: "Same normalized Google Maps URL.",
      recommendedAction: recommendedAction("exact_duplicate")
    };
  }

  if (closeName && closeAddress) {
    return {
      key: `possible:${groupKeyBase}`,
      category: "possible_duplicate",
      confidence: sameName ? "high" : "medium",
      reason: "Very similar name and similar address.",
      recommendedAction: recommendedAction("possible_duplicate")
    };
  }

  if (exactWebsite && (!left.address || !right.address || !exactAddress)) {
    return {
      key: `possible-website:${normalizeWebsite(left.website)}`,
      category: "possible_duplicate",
      confidence: "medium",
      reason: "Same website but different or missing address data.",
      recommendedAction: recommendedAction("possible_duplicate")
    };
  }

  if (exactPhone && closeName) {
    return {
      key: `possible-phone:${normalizePhone(left.phone)}`,
      category: "possible_duplicate",
      confidence: "medium",
      reason: "Same phone number with slightly different name formatting.",
      recommendedAction: recommendedAction("possible_duplicate")
    };
  }

  if (closeName && separateAddress && separatePlaceId) {
    return {
      key: `multi:${groupKeyBase}`,
      category: "multi_location",
      confidence: separatePhone ? "high" : "medium",
      reason: "Similar business name but different address and different Google Place IDs.",
      recommendedAction: recommendedAction("multi_location")
    };
  }

  if (sameName && separateAddress) {
    return {
      key: `multi:${groupKeyBase}`,
      category: "multi_location",
      confidence: separatePhone ? "high" : "medium",
      reason: "Same normalized business name but separate addresses suggest multiple locations.",
      recommendedAction: recommendedAction("multi_location")
    };
  }

  return null;
}

function mergeIntoGroup(
  groups: Map<string, CandidateGroup>,
  review: Omit<DuplicateReviewGroup, "restaurants">,
  left: RestaurantProfile,
  right: RestaurantProfile
): void {
  const groupMapKey = `${review.category}:${review.key}`;
  const existing = groups.get(groupMapKey);

  if (!existing) {
    groups.set(groupMapKey, {
      ...review,
      restaurants: [left, right]
    });
    return;
  }

  const deduped = new Map(existing.restaurants.map((restaurant) => [restaurant.id, restaurant]));
  deduped.set(left.id, left);
  deduped.set(right.id, right);

  groups.set(groupMapKey, {
    ...existing,
    confidence:
      CONFIDENCE_PRIORITY[review.confidence] > CONFIDENCE_PRIORITY[existing.confidence]
        ? review.confidence
        : existing.confidence,
    restaurants: Array.from(deduped.values())
  });
}

export function analyzeDuplicateGroups(
  restaurants: RestaurantProfile[]
): DuplicateReviewGroup[] {
  const groups = new Map<string, CandidateGroup>();

  for (let index = 0; index < restaurants.length; index += 1) {
    for (let offset = index + 1; offset < restaurants.length; offset += 1) {
      const left = restaurants[index];
      const right = restaurants[offset];
      const review = comparePair(left, right);

      if (!review) {
        continue;
      }

      mergeIntoGroup(groups, review, left, right);
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      recommendedAction: group.recommendedAction,
      restaurants: group.restaurants.sort((left, right) => left.name.localeCompare(right.name))
    }))
    .sort((left, right) => {
      if (CATEGORY_PRIORITY[right.category] !== CATEGORY_PRIORITY[left.category]) {
        return CATEGORY_PRIORITY[right.category] - CATEGORY_PRIORITY[left.category];
      }

      if (CONFIDENCE_PRIORITY[right.confidence] !== CONFIDENCE_PRIORITY[left.confidence]) {
        return CONFIDENCE_PRIORITY[right.confidence] - CONFIDENCE_PRIORITY[left.confidence];
      }

      return left.key.localeCompare(right.key);
    });
}

export function applyDuplicateReviewMetadata(
  restaurants: RestaurantProfile[]
): RestaurantProfile[] {
  const groups = analyzeDuplicateGroups(restaurants);
  const now = new Date().toISOString();
  const statusByRestaurantId = new Map<
    string,
    {
      status: DuplicateReviewStatus;
      notes: string[];
      groupKey: string;
      priority: number;
    }
  >();

  for (const group of groups) {
    for (const restaurant of group.restaurants) {
      const existing = statusByRestaurantId.get(restaurant.id);
      const nextPriority = CATEGORY_PRIORITY[group.category];

      if (!existing || nextPriority > existing.priority) {
        statusByRestaurantId.set(restaurant.id, {
          status: group.category,
          notes: [
            `${group.reason} Recommended action: ${group.recommendedAction}.`
          ],
          groupKey: group.key,
          priority: nextPriority
        });
        continue;
      }

      if (existing.groupKey === group.key) {
        existing.notes = Array.from(
          new Set([
            ...existing.notes,
            `${group.reason} Recommended action: ${group.recommendedAction}.`
          ])
        );
      }
    }
  }

  return restaurants.map((restaurant) => {
    const review = statusByRestaurantId.get(restaurant.id);

    return {
      ...restaurant,
      duplicateReviewStatus: review?.status ?? "unique",
      duplicateReviewNotes: review?.notes ?? [],
      duplicateGroupKey: review?.groupKey,
      duplicateReviewedAt: now
    };
  });
}
