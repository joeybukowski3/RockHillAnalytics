import { z } from "zod";

const GOOGLE_PLACE_QUERIES = [
  "restaurants in Rock Hill SC",
  "pizza in Rock Hill SC",
  "mexican restaurants in Rock Hill SC",
  "bbq restaurants in Rock Hill SC",
  "breakfast restaurants in Rock Hill SC",
  "coffee shops in Rock Hill SC",
  "bars in Rock Hill SC",
  "breweries in Rock Hill SC",
  "food trucks in Rock Hill SC",
  "chinese restaurants in Rock Hill SC",
  "japanese restaurants in Rock Hill SC",
  "italian restaurants in Rock Hill SC",
  "seafood restaurants in Rock Hill SC",
  "burgers in Rock Hill SC"
] as const;

const placeSearchResultSchema = z.object({
  place_id: z.string(),
  name: z.string(),
  formatted_address: z.string().optional(),
  rating: z.number().optional(),
  user_ratings_total: z.number().optional(),
  price_level: z.number().optional(),
  business_status: z.string().optional(),
  types: z.array(z.string()).optional()
});

const textSearchResponseSchema = z.object({
  results: z.array(placeSearchResultSchema),
  status: z.string(),
  error_message: z.string().optional(),
  next_page_token: z.string().optional()
});

const placeDetailsSchema = z.object({
  result: z
    .object({
      place_id: z.string(),
      name: z.string(),
      formatted_address: z.string().optional(),
      formatted_phone_number: z.string().optional(),
      website: z.string().optional(),
      url: z.string().optional(),
      rating: z.number().optional(),
      user_ratings_total: z.number().optional(),
      price_level: z.number().optional(),
      business_status: z.string().optional(),
      types: z.array(z.string()).optional(),
      opening_hours: z
        .object({
          weekday_text: z.array(z.string()).optional()
        })
        .optional(),
      reviews: z
        .array(
          z.object({
            author_name: z.string().optional(),
            rating: z.number().optional(),
            text: z.string().optional(),
            relative_time_description: z.string().optional(),
            time: z.number().optional()
          })
        )
        .optional()
    })
    .optional(),
  status: z.string(),
  error_message: z.string().optional()
});

export type GooglePlaceSearchResult = z.infer<typeof placeSearchResultSchema>;
export type GoogleTextSearchResponse = z.infer<typeof textSearchResponseSchema>;
export type GooglePlaceDetailsResponse = z.infer<typeof placeDetailsSchema>;
type GoogleApiStatusResponse = {
  status: string;
  error_message?: string;
};

function getGooglePlacesApiKey(): string {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "Missing GOOGLE_PLACES_API_KEY. Add it to .env.local before running Google Places scripts."
    );
  }

  return apiKey;
}

async function fetchGoogleJson<T extends GoogleApiStatusResponse>(
  url: URL,
  schema: z.ZodType<T>
): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Google Places request failed with ${response.status} ${response.statusText}.`
    );
  }

  const json = await response.json();
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    throw new Error(`Google Places response validation failed: ${parsed.error.message}`);
  }

  if (parsed.data.status !== "OK" && parsed.data.status !== "ZERO_RESULTS") {
    const message =
      parsed.data.error_message ?? `Google Places returned status ${parsed.data.status}.`;
    throw new Error(message);
  }

  return parsed.data;
}

export async function searchGooglePlacesText(
  query: string
): Promise<GoogleTextSearchResponse> {
  const apiKey = getGooglePlacesApiKey();
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");

  url.searchParams.set("query", query);
  url.searchParams.set("key", apiKey);

  return fetchGoogleJson(url, textSearchResponseSchema);
}

export async function getPlaceDetails(
  placeId: string
): Promise<GooglePlaceDetailsResponse> {
  const apiKey = getGooglePlacesApiKey();
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");

  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    [
      "place_id",
      "name",
      "formatted_address",
      "formatted_phone_number",
      "website",
      "url",
      "rating",
      "user_ratings_total",
      "price_level",
      "business_status",
      "types",
      "opening_hours",
      "reviews"
    ].join(",")
  );
  url.searchParams.set("reviews_sort", "newest");
  url.searchParams.set("key", apiKey);

  return fetchGoogleJson(url, placeDetailsSchema);
}

export async function searchRestaurantsInRockHill(): Promise<{
  searchedAt: string;
  queries: Array<{
    query: string;
    response: GoogleTextSearchResponse;
  }>;
}> {
  const queries = await Promise.all(
    GOOGLE_PLACE_QUERIES.map(async (query) => ({
      query,
      response: await searchGooglePlacesText(query)
    }))
  );

  return {
    searchedAt: new Date().toISOString(),
    queries
  };
}
