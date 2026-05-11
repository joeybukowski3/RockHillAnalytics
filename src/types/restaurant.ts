export type Review = {
  authorName?: string;
  rating?: number;
  text?: string;
  relativeTimeDescription?: string;
  publishedAt?: string;
  source: "google" | "facebook" | "instagram" | "other";
};

export type SocialPost = {
  id?: string;
  platform: "facebook" | "instagram" | "tiktok" | "other";
  url?: string;
  caption?: string;
  publishedAt?: string;
  engagement?: {
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
  };
};

export type ScoreSummary = {
  reputation: number;
  socialPresence: number;
  opportunity: number;
  overall: number;
  notes?: string[];
  calculatedAt: string;
};

export type RestaurantReviewStatus =
  | "included"
  | "needs_review"
  | "excluded"
  | "closed";

export type RestaurantPipelineStage =
  | "seeded"
  | "enriched"
  | "scored"
  | "reported";

export type RestaurantProfile = {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  category?: string;
  address?: string;
  phone?: string;
  website?: string;
  googlePlaceId?: string;
  googleMapsUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  status: RestaurantReviewStatus;
  reviewStatus?: RestaurantReviewStatus;
  pipelineStage?: RestaurantPipelineStage;
  reviewNotes: string[];
  sourceQueries: string[];
  lastVerifiedAt: string;
  google?: {
    rating?: number;
    reviewCount?: number;
    priceLevel?: number;
    businessStatus?: string;
    types?: string[];
    openingHours?: string[];
    mapsUrl?: string;
    rawReference?: string;
    reviews?: Review[];
    lastEnrichedAt?: string;
  };
  facebook?: {
    pageUrl?: string;
    followers?: number;
    posts?: SocialPost[];
    lastEnrichedAt?: string;
  };
  instagram?: {
    profileUrl?: string;
    followers?: number;
    posts?: SocialPost[];
    lastEnrichedAt?: string;
  };
  scores?: ScoreSummary;
  insights?: {
    strengths?: string[];
    gaps?: string[];
    notes?: string[];
  };
  createdAt: string;
  updatedAt: string;
};
