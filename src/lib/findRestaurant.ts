import { RestaurantProfile } from "../types/restaurant.js";

export type FindRestaurantResult = {
  restaurant: RestaurantProfile;
  matchType: "googlePlaceId" | "slug" | "exactName" | "partialName";
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeRestaurants(restaurants: RestaurantProfile[]): RestaurantProfile[] {
  const seen = new Set<string>();
  const deduped: RestaurantProfile[] = [];

  for (const restaurant of restaurants) {
    if (seen.has(restaurant.id)) {
      continue;
    }

    seen.add(restaurant.id);
    deduped.push(restaurant);
  }

  return deduped;
}

export function findRestaurant(
  restaurants: RestaurantProfile[],
  identifier: string
): FindRestaurantResult {
  const normalizedIdentifier = normalize(identifier);

  const byGooglePlaceId = restaurants.find(
    (restaurant) => restaurant.googlePlaceId === identifier
  );

  if (byGooglePlaceId) {
    return { restaurant: byGooglePlaceId, matchType: "googlePlaceId" };
  }

  const bySlug = restaurants.find(
    (restaurant) => normalize(restaurant.slug) === normalizedIdentifier
  );

  if (bySlug) {
    return { restaurant: bySlug, matchType: "slug" };
  }

  const byExactName = restaurants.find(
    (restaurant) => normalize(restaurant.name) === normalizedIdentifier
  );

  if (byExactName) {
    return { restaurant: byExactName, matchType: "exactName" };
  }

  const partialMatches = dedupeRestaurants(
    restaurants.filter((restaurant) =>
      normalize(restaurant.name).includes(normalizedIdentifier)
    )
  );

  if (partialMatches.length === 1) {
    return { restaurant: partialMatches[0], matchType: "partialName" };
  }

  if (partialMatches.length > 1) {
    throw new Error(
      [
        `Multiple restaurants matched "${identifier}".`,
        "Close matches:",
        ...partialMatches
          .slice(0, 10)
          .map((restaurant) => `- ${restaurant.name} (${restaurant.slug})`)
      ].join("\n")
    );
  }

  const closeMatches = dedupeRestaurants(
    restaurants.filter((restaurant) => {
      const name = normalize(restaurant.name);
      const slug = normalize(restaurant.slug);
      return (
        normalizedIdentifier.includes(name) ||
        normalizedIdentifier.includes(slug) ||
        name.startsWith(normalizedIdentifier) ||
        slug.startsWith(normalizedIdentifier)
      );
    })
  );

  const closeMatchMessage = closeMatches.length
    ? `\nClose matches:\n${closeMatches
        .slice(0, 10)
        .map((restaurant) => `- ${restaurant.name} (${restaurant.slug})`)
        .join("\n")}`
    : "";

  throw new Error(
    `No restaurant matched "${identifier}" in data/restaurants.seed.json.${closeMatchMessage}`
  );
}
