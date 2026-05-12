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
  source?: "facebook" | "instagram" | "tiktok" | "other";
  postUrl?: string;
  url?: string;
  caption?: string;
  contentType?: string;
  hashtags?: string[];
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

export type SocialProfileVerificationStatus =
  | "verified"
  | "not_found"
  | "unknown";

export type SocialEnrichmentStatus =
  | "not_ready"
  | "ready"
  | "enriched"
  | "failed";

export type WorkflowStage =
  | "discovered"
  | "google_enriched"
  | "social_review_needed"
  | "social_links_verified"
  | "social_enriched"
  | "scored"
  | "ready_for_report"
  | "report_generated";

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
  socialVerificationNotes?: string[];
  socialLinksVerifiedAt?: string;
  socialProfileStatus?: {
    facebook: SocialProfileVerificationStatus;
    instagram: SocialProfileVerificationStatus;
    tiktok: SocialProfileVerificationStatus;
  };
  socialEnrichmentStatus?: SocialEnrichmentStatus;
  socialEnrichmentNotes?: string[];
  workflowStage?: WorkflowStage;
  workflowNotes?: string[];
  lastGoogleEnrichedAt?: string;
  lastSocialReviewedAt?: string;
  lastSocialEnrichedAt?: string;
  lastScoredAt?: string;
  readyForReport?: boolean;
  dataCompletenessScore?: number;
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
    postCount?: number;
    recentPosts?: SocialPost[];
    lastEnrichedAt?: string;
  };
  instagram?: {
    profileUrl?: string;
    followers?: number;
    postCount?: number;
    recentPosts?: SocialPost[];
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
