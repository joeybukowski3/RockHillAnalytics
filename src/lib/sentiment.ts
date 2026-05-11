import { Review } from "../types/restaurant.js";

export function summarizePublicSentiment(reviews: Review[]): string {
  if (reviews.length === 0) {
    return "No public review data summarized yet.";
  }

  const avgRating =
    reviews.reduce((sum, review) => sum + (review.rating ?? 0), 0) / reviews.length;

  if (avgRating >= 4.5) {
    return "Public sentiment appears very strong based on currently stored review data.";
  }

  if (avgRating >= 4) {
    return "Public sentiment appears positive based on currently stored review data.";
  }

  if (avgRating >= 3) {
    return "Public sentiment appears mixed based on currently stored review data.";
  }

  return "Public sentiment appears weak based on currently stored review data.";
}
