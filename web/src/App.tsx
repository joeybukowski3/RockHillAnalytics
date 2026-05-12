import { useEffect, useMemo, useState } from "react";

type DashboardRestaurant = {
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
  reviewStatus: string;
  pipelineStage?: string;
  socialEnrichmentStatus?: string;
  google?: {
    rating?: number;
    reviewCount?: number;
    businessStatus?: string;
    openingHours?: string[];
  };
  facebookUrl?: string;
  instagramUrl?: string;
  tiktokUrl?: string;
  socialProfileStatus?: {
    facebook?: string;
    instagram?: string;
    tiktok?: string;
  };
  facebook?: {
    pageUrl?: string;
    postCount?: number;
    latestPostDate?: string;
    recentPostCount: number;
  };
  instagram?: {
    profileUrl?: string;
    followers?: number;
    postCount?: number;
    latestPostDate?: string;
    recentPostCount: number;
  };
  scores?: {
    reputation: number;
    socialPresence: number;
    opportunity: number;
    overall: number;
  };
  reviewNotes: string[];
  socialVerificationNotes: string[];
  socialEnrichmentNotes: string[];
  reportPath?: string;
  reportExists: boolean;
  updatedAt: string;
};

type DashboardPayload = {
  exportedAt: string;
  totalRestaurants: number;
  restaurants: DashboardRestaurant[];
};

type SortKey =
  | "name"
  | "googleRating"
  | "reviewCount"
  | "reputation"
  | "socialPresence"
  | "opportunity"
  | "overall";

type NextAction =
  | "Needs Google enrichment"
  | "Needs social link review"
  | "Ready for Instagram enrichment"
  | "Ready for Facebook enrichment"
  | "Needs score/report refresh"
  | "Complete for MVP";

function formatDate(value?: string): string {
  if (!value) {
    return "n/a";
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleDateString();
}

function badgeTone(value: string): string {
  if (
    value === "included" ||
    value === "verified" ||
    value === "enriched" ||
    value === "Complete for MVP"
  ) {
    return "good";
  }

  if (
    value === "needs_review" ||
    value === "ready" ||
    value === "Needs score/report refresh" ||
    value === "Ready for Instagram enrichment" ||
    value === "Ready for Facebook enrichment" ||
    value === "Needs social link review"
  ) {
    return "warn";
  }

  if (value === "excluded" || value === "closed" || value === "failed") {
    return "bad";
  }

  return "neutral";
}

function hasGoogleEnrichment(restaurant: DashboardRestaurant): boolean {
  return Boolean(
    restaurant.google?.rating !== undefined ||
      restaurant.google?.reviewCount !== undefined ||
      restaurant.phone ||
      restaurant.website
  );
}

function hasSocialPosts(restaurant: DashboardRestaurant): boolean {
  return (
    (restaurant.instagram?.recentPostCount ?? 0) > 0 ||
    (restaurant.facebook?.recentPostCount ?? 0) > 0
  );
}

function getNextAction(restaurant: DashboardRestaurant): NextAction {
  const facebookStatus = restaurant.socialProfileStatus?.facebook ?? "unknown";
  const instagramStatus = restaurant.socialProfileStatus?.instagram ?? "unknown";
  const hasGoogle = hasGoogleEnrichment(restaurant);
  const hasReport = restaurant.reportExists;
  const hasScores = Boolean(restaurant.scores);
  const hasInstagramPosts = (restaurant.instagram?.recentPostCount ?? 0) > 0;
  const hasFacebookPosts = (restaurant.facebook?.recentPostCount ?? 0) > 0;

  if (!hasGoogle) {
    return "Needs Google enrichment";
  }

  if (
    facebookStatus === "unknown" ||
    instagramStatus === "unknown" ||
    restaurant.socialEnrichmentStatus === "not_ready"
  ) {
    return "Needs social link review";
  }

  if (instagramStatus === "verified" && !hasInstagramPosts) {
    return "Ready for Instagram enrichment";
  }

  if (facebookStatus === "verified" && !hasFacebookPosts) {
    return "Ready for Facebook enrichment";
  }

  if (!hasScores || !hasReport || restaurant.pipelineStage !== "reported") {
    return "Needs score/report refresh";
  }

  return "Complete for MVP";
}

function getScoreExplanation(restaurant: DashboardRestaurant): string[] {
  return [
    `Reputation Score reflects Google rating and review volume. Current value: ${restaurant.scores?.reputation ?? "n/a"}.`,
    `Social Presence Score reflects verified profiles, recent posting activity, and lightweight engagement signals. Current value: ${restaurant.scores?.socialPresence ?? "n/a"}.`,
    `Opportunity Score rises when reputation is strong but social presence is weak or missing. Current value: ${restaurant.scores?.opportunity ?? "n/a"}.`,
    "If social is strong and reputation is strong, immediate marketing opportunity is lower but public presence is healthier."
  ];
}

function getDisplayName(restaurant: DashboardRestaurant): string {
  return restaurant.name
    .replaceAll("Ã©", "é")
    .replaceAll("â€™", "’")
    .replaceAll("â€“", "–")
    .replaceAll("â€¦", "…");
}

export default function App() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [query, setQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [googleFilter, setGoogleFilter] = useState("all");
  const [instagramFilter, setInstagramFilter] = useState("all");
  const [facebookFilter, setFacebookFilter] = useState("all");
  const [socialPostsFilter, setSocialPostsFilter] = useState("all");
  const [readyFilter, setReadyFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/restaurants.json")
      .then((response) => response.json())
      .then((json: DashboardPayload) => {
        setPayload(json);
        setSelectedId(json.restaurants[0]?.id ?? null);
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  const restaurants = payload?.restaurants ?? [];

  const stats = useMemo(() => {
    const included = restaurants.filter((r) => r.reviewStatus === "included").length;
    const needsReview = restaurants.filter((r) => r.reviewStatus === "needs_review").length;
    const excluded = restaurants.filter((r) => r.reviewStatus === "excluded").length;
    const closed = restaurants.filter((r) => r.reviewStatus === "closed").length;
    const googleEnriched = restaurants.filter(hasGoogleEnrichment).length;
    const verifiedInstagram = restaurants.filter(
      (r) => r.socialProfileStatus?.instagram === "verified"
    ).length;
    const verifiedFacebook = restaurants.filter(
      (r) => r.socialProfileStatus?.facebook === "verified"
    ).length;
    const socialPosts = restaurants.filter(hasSocialPosts).length;
    const reports = restaurants.filter((r) => r.reportExists).length;

    return {
      included,
      needsReview,
      excluded,
      closed,
      googleEnriched,
      verifiedInstagram,
      verifiedFacebook,
      socialPosts,
      reports
    };
  }, [restaurants]);

  const featured = useMemo(
    () =>
      ["big-wok-ii", "jackass-caf-wine-bar"]
        .map((slug) => restaurants.find((restaurant) => restaurant.slug === slug))
        .filter((restaurant): restaurant is DashboardRestaurant => Boolean(restaurant)),
    [restaurants]
  );

  const filteredRestaurants = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return [...restaurants]
      .filter((restaurant) => {
        const nextAction = getNextAction(restaurant);

        if (
          normalizedQuery &&
          ![
            restaurant.name,
            restaurant.slug,
            restaurant.category ?? "",
            restaurant.address ?? "",
            nextAction
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        ) {
          return false;
        }

        if (reviewFilter !== "all" && restaurant.reviewStatus !== reviewFilter) {
          return false;
        }

        if (googleFilter === "enriched" && !hasGoogleEnrichment(restaurant)) {
          return false;
        }

        if (googleFilter === "missing" && hasGoogleEnrichment(restaurant)) {
          return false;
        }

        if (
          instagramFilter !== "all" &&
          (restaurant.socialProfileStatus?.instagram ?? "unknown") !== instagramFilter
        ) {
          return false;
        }

        if (
          facebookFilter !== "all" &&
          (restaurant.socialProfileStatus?.facebook ?? "unknown") !== facebookFilter
        ) {
          return false;
        }

        if (socialPostsFilter === "has_posts" && !hasSocialPosts(restaurant)) {
          return false;
        }

        if (socialPostsFilter === "no_posts" && hasSocialPosts(restaurant)) {
          return false;
        }

        if (readyFilter === "ready" && !nextAction.startsWith("Ready for")) {
          return false;
        }

        if (readyFilter === "not_ready" && nextAction.startsWith("Ready for")) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        if (sortKey === "name") {
          return getDisplayName(left).localeCompare(getDisplayName(right));
        }

        if (sortKey === "googleRating") {
          return (right.google?.rating ?? -1) - (left.google?.rating ?? -1);
        }

        if (sortKey === "reviewCount") {
          return (right.google?.reviewCount ?? -1) - (left.google?.reviewCount ?? -1);
        }

        const leftValue = left.scores?.[sortKey] ?? -1;
        const rightValue = right.scores?.[sortKey] ?? -1;
        return rightValue - leftValue;
      });
  }, [
    restaurants,
    query,
    reviewFilter,
    googleFilter,
    instagramFilter,
    facebookFilter,
    socialPostsFilter,
    readyFilter,
    sortKey
  ]);

  const selectedRestaurant =
    filteredRestaurants.find((restaurant) => restaurant.id === selectedId) ??
    restaurants.find((restaurant) => restaurant.id === selectedId) ??
    filteredRestaurants[0] ??
    null;

  if (!payload) {
    return <div className="loading">Loading RockHillAnalytics dashboard...</div>;
  }

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Rock Hill Restaurant Intelligence</p>
          <h1>RockHillAnalytics</h1>
          <p className="hero-copy">
            Local restaurant reputation, social presence, and opportunity tracking for
            Rock Hill, SC.
          </p>
        </div>
        <div className="badge-row">
          <span className="badge neutral">Phase 1: Google discovery complete</span>
          <span className="badge warn">Phase 2: Social enrichment testing</span>
          <span className="badge neutral">Data source: restaurants.seed.json</span>
        </div>
      </header>

      <section className="stats-grid">
        <StatCard label="Total restaurants" value={payload.totalRestaurants} />
        <StatCard label="Included" value={stats.included} />
        <StatCard label="Needs review" value={stats.needsReview} />
        <StatCard label="Excluded" value={stats.excluded} />
        <StatCard label="Closed" value={stats.closed} />
        <StatCard label="Google enriched" value={stats.googleEnriched} />
        <StatCard label="Verified Instagram" value={stats.verifiedInstagram} />
        <StatCard label="Verified Facebook" value={stats.verifiedFacebook} />
        <StatCard label="Restaurants with social posts" value={stats.socialPosts} />
        <StatCard label="Generated reports" value={stats.reports} />
      </section>

      <section className="section-block">
        <div className="section-header">
          <h2>Featured test restaurants</h2>
          <p>Quick visual checks for the current Google-only and social-enriched examples.</p>
        </div>
        <div className="featured-grid">
          {featured.map((restaurant) => (
            <article key={restaurant.id} className="featured-card">
              <div className="featured-head">
                <div>
                  <h3>{getDisplayName(restaurant)}</h3>
                  <p>
                    {restaurant.slug === "big-wok-ii"
                      ? "Google-only test"
                      : "Google + Instagram + Facebook test"}
                  </p>
                </div>
                <span className={`badge ${badgeTone(restaurant.reviewStatus)}`}>
                  {restaurant.reviewStatus}
                </span>
              </div>
              <dl className="metric-list">
                <div>
                  <dt>Rating</dt>
                  <dd>{restaurant.google?.rating ?? "n/a"}</dd>
                </div>
                <div>
                  <dt>Reviews</dt>
                  <dd>{restaurant.google?.reviewCount ?? "n/a"}</dd>
                </div>
                <div>
                  <dt>Instagram status</dt>
                  <dd>{restaurant.socialProfileStatus?.instagram ?? "unknown"}</dd>
                </div>
                <div>
                  <dt>Facebook status</dt>
                  <dd>{restaurant.socialProfileStatus?.facebook ?? "unknown"}</dd>
                </div>
                <div>
                  <dt>Instagram posts</dt>
                  <dd>{restaurant.instagram?.recentPostCount ?? 0}</dd>
                </div>
                <div>
                  <dt>Facebook posts</dt>
                  <dd>{restaurant.facebook?.recentPostCount ?? 0}</dd>
                </div>
                <div>
                  <dt>Overall score</dt>
                  <dd>{restaurant.scores?.overall ?? "n/a"}</dd>
                </div>
                <div>
                  <dt>Next action</dt>
                  <dd>{getNextAction(restaurant)}</dd>
                </div>
              </dl>
              {restaurant.reportPath ? (
                <a className="report-link" href={restaurant.reportPath} target="_blank" rel="noreferrer">
                  Open report
                </a>
              ) : (
                <span className="report-link muted">No report yet</span>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-header">
          <h2>Restaurant review table</h2>
          <p>Search, filter, sort, and decide what to enrich next.</p>
        </div>
        <div className="toolbar toolbar-wide">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search restaurant, slug, category, address, or next action"
          />
          <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>
            <option value="all">All review statuses</option>
            <option value="included">Included</option>
            <option value="needs_review">Needs review</option>
            <option value="excluded">Excluded</option>
            <option value="closed">Closed</option>
          </select>
          <select value={googleFilter} onChange={(event) => setGoogleFilter(event.target.value)}>
            <option value="all">All Google states</option>
            <option value="enriched">Google enriched</option>
            <option value="missing">Google not enriched</option>
          </select>
          <select
            value={instagramFilter}
            onChange={(event) => setInstagramFilter(event.target.value)}
          >
            <option value="all">All Instagram states</option>
            <option value="verified">Instagram verified</option>
            <option value="not_found">Instagram not_found</option>
            <option value="unknown">Instagram unknown</option>
          </select>
          <select
            value={facebookFilter}
            onChange={(event) => setFacebookFilter(event.target.value)}
          >
            <option value="all">All Facebook states</option>
            <option value="verified">Facebook verified</option>
            <option value="not_found">Facebook not_found</option>
            <option value="unknown">Facebook unknown</option>
          </select>
          <select
            value={socialPostsFilter}
            onChange={(event) => setSocialPostsFilter(event.target.value)}
          >
            <option value="all">All social post states</option>
            <option value="has_posts">Has social posts</option>
            <option value="no_posts">No social posts</option>
          </select>
          <select value={readyFilter} onChange={(event) => setReadyFilter(event.target.value)}>
            <option value="all">All readiness states</option>
            <option value="ready">Ready for enrichment</option>
            <option value="not_ready">Not ready for enrichment</option>
          </select>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="overall">Sort by Overall Score</option>
            <option value="opportunity">Sort by Opportunity Score</option>
            <option value="socialPresence">Sort by Social Presence Score</option>
            <option value="reputation">Sort by Reputation Score</option>
            <option value="googleRating">Sort by Google rating</option>
            <option value="reviewCount">Sort by review count</option>
            <option value="name">Sort by restaurant name</option>
          </select>
        </div>

        <div className="table-card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Restaurant</th>
                  <th>Next Action</th>
                  <th>Review Status</th>
                  <th>Category</th>
                  <th>Google Rating</th>
                  <th>Review Count</th>
                  <th>Instagram Status</th>
                  <th>Facebook Status</th>
                  <th>Instagram Posts</th>
                  <th>Facebook Posts</th>
                  <th>Reputation</th>
                  <th>Social</th>
                  <th>Opportunity</th>
                  <th>Overall</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {filteredRestaurants.map((restaurant) => {
                  const nextAction = getNextAction(restaurant);

                  return (
                    <tr
                      key={restaurant.id}
                      className={restaurant.id === selectedRestaurant?.id ? "selected-row" : ""}
                      onClick={() => setSelectedId(restaurant.id)}
                    >
                      <td>
                        <div className="table-name">
                          <strong>{getDisplayName(restaurant)}</strong>
                          <span>{restaurant.city}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${badgeTone(nextAction)}`}>{nextAction}</span>
                      </td>
                      <td>
                        <span className={`badge ${badgeTone(restaurant.reviewStatus)}`}>
                          {restaurant.reviewStatus}
                        </span>
                      </td>
                      <td>{restaurant.category ?? "n/a"}</td>
                      <td>{restaurant.google?.rating ?? "n/a"}</td>
                      <td>{restaurant.google?.reviewCount ?? "n/a"}</td>
                      <td>{restaurant.socialProfileStatus?.instagram ?? "unknown"}</td>
                      <td>{restaurant.socialProfileStatus?.facebook ?? "unknown"}</td>
                      <td>{restaurant.instagram?.recentPostCount ?? 0}</td>
                      <td>{restaurant.facebook?.recentPostCount ?? 0}</td>
                      <td>{restaurant.scores?.reputation ?? "n/a"}</td>
                      <td>{restaurant.scores?.socialPresence ?? "n/a"}</td>
                      <td>{restaurant.scores?.opportunity ?? "n/a"}</td>
                      <td>{restaurant.scores?.overall ?? "n/a"}</td>
                      <td>
                        {restaurant.reportPath ? (
                          <a href={restaurant.reportPath} target="_blank" rel="noreferrer">
                            Report
                          </a>
                        ) : (
                          "n/a"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-header">
          <h2>Restaurant detail</h2>
          <p>Click a row above to inspect the current stored signals and next decisions.</p>
        </div>
        {selectedRestaurant ? (
          <div className="detail-card">
            <div className="detail-topline">
              <div>
                <h3>{getDisplayName(selectedRestaurant)}</h3>
                <p>{selectedRestaurant.address ?? "No address available"}</p>
              </div>
              <span className={`badge ${badgeTone(getNextAction(selectedRestaurant))}`}>
                {getNextAction(selectedRestaurant)}
              </span>
            </div>
            <div className="detail-grid">
              <DetailGroup
                title="Core profile"
                lines={[
                  `Phone: ${selectedRestaurant.phone ?? "n/a"}`,
                  `Website: ${selectedRestaurant.website ?? "n/a"}`,
                  `Category: ${selectedRestaurant.category ?? "n/a"}`,
                  `Pipeline stage: ${selectedRestaurant.pipelineStage ?? "seeded"}`
                ]}
              />
              <DetailGroup
                title="Google details"
                lines={[
                  `Rating: ${selectedRestaurant.google?.rating ?? "n/a"}`,
                  `Review count: ${selectedRestaurant.google?.reviewCount ?? "n/a"}`,
                  `Business status: ${selectedRestaurant.google?.businessStatus ?? "n/a"}`,
                  `Google Maps: ${selectedRestaurant.googleMapsUrl ?? "n/a"}`
                ]}
              />
              <DetailGroup
                title="Social URLs and statuses"
                lines={[
                  `Facebook: ${selectedRestaurant.facebookUrl ?? "n/a"} (${selectedRestaurant.socialProfileStatus?.facebook ?? "unknown"})`,
                  `Instagram: ${selectedRestaurant.instagramUrl ?? "n/a"} (${selectedRestaurant.socialProfileStatus?.instagram ?? "unknown"})`,
                  `TikTok: ${selectedRestaurant.tiktokUrl ?? "n/a"} (${selectedRestaurant.socialProfileStatus?.tiktok ?? "unknown"})`,
                  `Social enrichment status: ${selectedRestaurant.socialEnrichmentStatus ?? "not_ready"}`
                ]}
              />
              <DetailGroup
                title="Recent post signals"
                lines={[
                  `Facebook post count: ${selectedRestaurant.facebook?.recentPostCount ?? 0}`,
                  `Latest Facebook post: ${formatDate(selectedRestaurant.facebook?.latestPostDate)}`,
                  `Instagram post count: ${selectedRestaurant.instagram?.recentPostCount ?? 0}`,
                  `Latest Instagram post: ${formatDate(selectedRestaurant.instagram?.latestPostDate)}`
                ]}
              />
              <DetailGroup
                title="Scores"
                lines={[
                  `Reputation Score: ${selectedRestaurant.scores?.reputation ?? "n/a"}`,
                  `Social Presence Score: ${selectedRestaurant.scores?.socialPresence ?? "n/a"}`,
                  `Opportunity Score: ${selectedRestaurant.scores?.opportunity ?? "n/a"}`,
                  `Overall Score: ${selectedRestaurant.scores?.overall ?? "n/a"}`
                ]}
              />
              <DetailGroup title="Score explanations" lines={getScoreExplanation(selectedRestaurant)} />
              <DetailGroup
                title="Review notes"
                lines={
                  selectedRestaurant.reviewNotes.length
                    ? selectedRestaurant.reviewNotes
                    : ["No review notes recorded."]
                }
              />
              <DetailGroup
                title="Social verification notes"
                lines={
                  selectedRestaurant.socialVerificationNotes.length
                    ? selectedRestaurant.socialVerificationNotes
                    : ["No social verification notes recorded."]
                }
              />
            </div>
            {selectedRestaurant.reportPath ? (
              <a className="report-link" href={selectedRestaurant.reportPath} target="_blank" rel="noreferrer">
                Open Markdown report
              </a>
            ) : null}
          </div>
        ) : (
          <div className="detail-card">No restaurant selected.</div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DetailGroup({ title, lines }: { title: string; lines: string[] }) {
  return (
    <article className="detail-group">
      <h3>{title}</h3>
      <ul>
        {lines.length ? lines.map((line, index) => <li key={`${title}-${index}`}>{line}</li>) : <li>n/a</li>}
      </ul>
    </article>
  );
}
