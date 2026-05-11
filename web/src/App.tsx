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

type SortKey = "overall" | "opportunity" | "reputation" | "name";

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
  if (value === "included" || value === "verified" || value === "enriched") {
    return "good";
  }

  if (value === "needs_review" || value === "ready") {
    return "warn";
  }

  if (value === "excluded" || value === "closed" || value === "failed") {
    return "bad";
  }

  return "neutral";
}

export default function App() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [query, setQuery] = useState("");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [socialFilter, setSocialFilter] = useState("all");
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
    const googleEnriched = restaurants.filter(
      (r) => r.google?.rating !== undefined || r.google?.reviewCount !== undefined
    ).length;
    const verifiedInstagram = restaurants.filter(
      (r) => r.socialProfileStatus?.instagram === "verified"
    ).length;
    const verifiedFacebook = restaurants.filter(
      (r) => r.socialProfileStatus?.facebook === "verified"
    ).length;
    const socialPosts = restaurants.filter(
      (r) => (r.instagram?.recentPostCount ?? 0) > 0 || (r.facebook?.recentPostCount ?? 0) > 0
    ).length;
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
        if (
          normalizedQuery &&
          ![
            restaurant.name,
            restaurant.slug,
            restaurant.category ?? "",
            restaurant.address ?? ""
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

        if (socialFilter !== "all") {
          if ((restaurant.socialEnrichmentStatus ?? "not_ready") !== socialFilter) {
            return false;
          }
        }

        return true;
      })
      .sort((left, right) => {
        if (sortKey === "name") {
          return left.name.localeCompare(right.name);
        }

        const leftValue = left.scores?.[sortKey] ?? -1;
        const rightValue = right.scores?.[sortKey] ?? -1;
        return rightValue - leftValue;
      });
  }, [restaurants, query, reviewFilter, socialFilter, sortKey]);

  const selectedRestaurant =
    filteredRestaurants.find((restaurant) => restaurant.id === selectedId) ??
    restaurants.find((restaurant) => restaurant.id === selectedId) ??
    filteredRestaurants[0] ??
    null;

  if (!payload) {
    return <div className="loading">Loading RockHillAnalytics dashboard…</div>;
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
                  <h3>{restaurant.name}</h3>
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
                  <dt>Opportunity</dt>
                  <dd>{restaurant.scores?.opportunity ?? "n/a"}</dd>
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
          <p>Search, filter, and sort the current Rock Hill restaurant master list.</p>
        </div>
        <div className="toolbar">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search restaurant, slug, category, or address"
          />
          <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>
            <option value="all">All review statuses</option>
            <option value="included">Included</option>
            <option value="needs_review">Needs review</option>
            <option value="excluded">Excluded</option>
            <option value="closed">Closed</option>
          </select>
          <select value={socialFilter} onChange={(event) => setSocialFilter(event.target.value)}>
            <option value="all">All social readiness</option>
            <option value="not_ready">Not ready</option>
            <option value="ready">Ready</option>
            <option value="enriched">Enriched</option>
            <option value="failed">Failed</option>
          </select>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="overall">Sort by overall score</option>
            <option value="opportunity">Sort by opportunity score</option>
            <option value="reputation">Sort by reputation score</option>
            <option value="name">Sort by name</option>
          </select>
        </div>

        <div className="table-card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Restaurant</th>
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
                {filteredRestaurants.map((restaurant) => (
                  <tr
                    key={restaurant.id}
                    className={restaurant.id === selectedRestaurant?.id ? "selected-row" : ""}
                    onClick={() => setSelectedId(restaurant.id)}
                  >
                    <td>
                      <div className="table-name">
                        <strong>{restaurant.name}</strong>
                        <span>{restaurant.city}</span>
                      </div>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-header">
          <h2>Restaurant detail</h2>
          <p>Click a row above to inspect the current stored signals for one restaurant.</p>
        </div>
        {selectedRestaurant ? (
          <div className="detail-card">
            <div className="detail-grid">
              <DetailGroup
                title="Core profile"
                lines={[
                  selectedRestaurant.name,
                  selectedRestaurant.address ?? "No address",
                  `Phone: ${selectedRestaurant.phone ?? "n/a"}`,
                  `Website: ${selectedRestaurant.website ?? "n/a"}`
                ]}
              />
              <DetailGroup
                title="Google"
                lines={[
                  `Rating: ${selectedRestaurant.google?.rating ?? "n/a"}`,
                  `Review count: ${selectedRestaurant.google?.reviewCount ?? "n/a"}`,
                  `Business status: ${selectedRestaurant.google?.businessStatus ?? "n/a"}`,
                  `Maps: ${selectedRestaurant.googleMapsUrl ?? "n/a"}`
                ]}
              />
              <DetailGroup
                title="Social presence"
                lines={[
                  `Facebook: ${selectedRestaurant.facebookUrl ?? "n/a"} (${selectedRestaurant.socialProfileStatus?.facebook ?? "unknown"})`,
                  `Instagram: ${selectedRestaurant.instagramUrl ?? "n/a"} (${selectedRestaurant.socialProfileStatus?.instagram ?? "unknown"})`,
                  `TikTok: ${selectedRestaurant.tiktokUrl ?? "n/a"} (${selectedRestaurant.socialProfileStatus?.tiktok ?? "unknown"})`,
                  `Social enrichment: ${selectedRestaurant.socialEnrichmentStatus ?? "not_ready"}`
                ]}
              />
              <DetailGroup
                title="Social post signals"
                lines={[
                  `Latest Facebook post: ${formatDate(selectedRestaurant.facebook?.latestPostDate)}`,
                  `Facebook post count: ${selectedRestaurant.facebook?.recentPostCount ?? 0}`,
                  `Latest Instagram post: ${formatDate(selectedRestaurant.instagram?.latestPostDate)}`,
                  `Instagram post count: ${selectedRestaurant.instagram?.recentPostCount ?? 0}`
                ]}
              />
              <DetailGroup
                title="Scores"
                lines={[
                  `Reputation: ${selectedRestaurant.scores?.reputation ?? "n/a"}`,
                  `Social presence: ${selectedRestaurant.scores?.socialPresence ?? "n/a"}`,
                  `Opportunity: ${selectedRestaurant.scores?.opportunity ?? "n/a"}`,
                  `Overall: ${selectedRestaurant.scores?.overall ?? "n/a"}`
                ]}
              />
              <DetailGroup
                title="Notes"
                lines={[
                  ...selectedRestaurant.reviewNotes,
                  ...selectedRestaurant.socialVerificationNotes,
                  ...selectedRestaurant.socialEnrichmentNotes
                ]}
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
        {lines.length ? lines.map((line) => <li key={line}>{line}</li>) : <li>n/a</li>}
      </ul>
    </article>
  );
}
