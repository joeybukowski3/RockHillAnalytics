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
  workflowStage?: string;
  nextAction: string;
  dataCompletenessScore: number;
  missingData: string[];
  readyForReport: boolean;
  suggestedCommands: string[];
  lastGoogleEnrichedAt?: string;
  lastSocialReviewedAt?: string;
  lastSocialEnrichedAt?: string;
  lastScoredAt?: string;
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
  | "overall"
  | "completeness";

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
    value === "report_generated" ||
    value === "Complete for MVP"
  ) {
    return "good";
  }

  if (
    value === "needs_review" ||
    value === "ready" ||
    value === "social_review_needed" ||
    value === "social_links_verified" ||
    value === "Needs social URL review" ||
    value === "Ready for Instagram enrichment" ||
    value === "Ready for Facebook enrichment" ||
    value === "Needs scoring" ||
    value === "Ready for report"
  ) {
    return "warn";
  }

  if (value === "excluded" || value === "closed" || value === "failed") {
    return "bad";
  }

  return "neutral";
}

function getDisplayName(restaurant: DashboardRestaurant): string {
  return restaurant.name
    .replaceAll("Ã©", "é")
    .replaceAll("â€™", "’")
    .replaceAll("â€“", "–")
    .replaceAll("â€¦", "…");
}

function hasGoogleEnriched(restaurant: DashboardRestaurant): boolean {
  return Boolean(restaurant.lastGoogleEnrichedAt || restaurant.google?.rating !== undefined || restaurant.phone || restaurant.website);
}

function hasSocialPosts(restaurant: DashboardRestaurant): boolean {
  return (
    (restaurant.instagram?.recentPostCount ?? 0) > 0 ||
    (restaurant.facebook?.recentPostCount ?? 0) > 0
  );
}

function getLastEnrichedLabel(restaurant: DashboardRestaurant): string {
  return (
    formatDate(restaurant.lastSocialEnrichedAt) !== "n/a"
      ? formatDate(restaurant.lastSocialEnrichedAt)
      : formatDate(restaurant.lastGoogleEnrichedAt)
  );
}

function getScoreExplanation(restaurant: DashboardRestaurant): string[] {
  return [
    `Reputation Score: ${restaurant.scores?.reputation ?? "n/a"} based on Google rating and review count.`,
    `Social Presence Score: ${restaurant.scores?.socialPresence ?? "n/a"} based on verified profiles, post counts, recency, and engagement.`,
    `Opportunity Score: ${restaurant.scores?.opportunity ?? "n/a"} rises when reputation is strong but social presence is weaker or missing.`,
    "Strong reputation and strong social presence improve public presence, but lower immediate opportunity urgency."
  ];
}

export default function App() {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [query, setQuery] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [readyFilter, setReadyFilter] = useState("all");
  const [includedOnly, setIncludedOnly] = useState(false);
  const [hasInstagramUrl, setHasInstagramUrl] = useState(false);
  const [hasFacebookUrl, setHasFacebookUrl] = useState(false);
  const [hasPostsOnly, setHasPostsOnly] = useState(false);
  const [missingSocialReviewOnly, setMissingSocialReviewOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/restaurants.json")
      .then((response) => response.json())
      .then((json: DashboardPayload) => {
        setPayload(json);
        setSelectedId(json.restaurants[0]?.id ?? null);
      })
      .catch((error) => console.error(error));
  }, []);

  const restaurants = payload?.restaurants ?? [];
  const includedRestaurants = useMemo(
    () => restaurants.filter((restaurant) => restaurant.reviewStatus === "included"),
    [restaurants]
  );

  const workflowCounts = useMemo(() => {
    const count = (predicate: (restaurant: DashboardRestaurant) => boolean) =>
      includedRestaurants.filter(predicate).length;

    return {
      included: includedRestaurants.length,
      googleEnriched: count(hasGoogleEnriched),
      socialReviewNeeded: count((restaurant) => restaurant.workflowStage === "social_review_needed"),
      socialLinksVerified: count((restaurant) => restaurant.workflowStage === "social_links_verified"),
      socialEnriched: count((restaurant) => restaurant.workflowStage === "social_enriched"),
      scored: count((restaurant) => restaurant.workflowStage === "scored"),
      readyForReport: count((restaurant) => restaurant.readyForReport),
      reportsGenerated: count((restaurant) => restaurant.reportExists)
    };
  }, [includedRestaurants]);

  const stageFunnel = useMemo(
    () =>
      [
        "discovered",
        "google_enriched",
        "social_review_needed",
        "social_links_verified",
        "social_enriched",
        "scored",
        "ready_for_report",
        "report_generated"
      ].map((stage) => ({
        stage,
        count: includedRestaurants.filter((restaurant) => restaurant.workflowStage === stage).length
      })),
    [includedRestaurants]
  );

  const actionQueue = useMemo(
    () =>
      [
        "Needs Google enrichment",
        "Needs social URL review",
        "Ready for Instagram enrichment",
        "Ready for Facebook enrichment",
        "Needs scoring",
        "Ready for report"
      ].map((action) => ({
        action,
        restaurants: includedRestaurants
          .filter((restaurant) => restaurant.nextAction === action)
          .slice(0, 8)
      })),
    [includedRestaurants]
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
            restaurant.address ?? "",
            restaurant.nextAction,
            restaurant.workflowStage ?? ""
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)
        ) {
          return false;
        }

        if (workflowFilter !== "all" && restaurant.workflowStage !== workflowFilter) {
          return false;
        }

        if (actionFilter !== "all" && restaurant.nextAction !== actionFilter) {
          return false;
        }

        if (readyFilter === "ready" && !restaurant.readyForReport) {
          return false;
        }

        if (readyFilter === "not_ready" && restaurant.readyForReport) {
          return false;
        }

        if (includedOnly && restaurant.reviewStatus !== "included") {
          return false;
        }

        if (hasInstagramUrl && !restaurant.instagramUrl) {
          return false;
        }

        if (hasFacebookUrl && !restaurant.facebookUrl) {
          return false;
        }

        if (hasPostsOnly && !hasSocialPosts(restaurant)) {
          return false;
        }

        if (
          missingSocialReviewOnly &&
          !(
            restaurant.nextAction === "Needs social URL review" ||
            restaurant.workflowStage === "social_review_needed"
          )
        ) {
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

        if (sortKey === "completeness") {
          return right.dataCompletenessScore - left.dataCompletenessScore;
        }

        return (right.scores?.[sortKey] ?? -1) - (left.scores?.[sortKey] ?? -1);
      });
  }, [
    restaurants,
    query,
    workflowFilter,
    actionFilter,
    readyFilter,
    includedOnly,
    hasInstagramUrl,
    hasFacebookUrl,
    hasPostsOnly,
    missingSocialReviewOnly,
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
          <p className="eyebrow">Rock Hill Restaurant Workflow Command Center</p>
          <h1>RockHillAnalytics</h1>
          <p className="hero-copy">
            Internal workflow control center for restaurant discovery, enrichment,
            scoring, and report readiness in Rock Hill, SC.
          </p>
        </div>
        <div className="badge-row">
          <span className="badge neutral">Workflow-first phase</span>
          <span className="badge warn">Final reports intentionally secondary</span>
          <span className="badge neutral">Exported from restaurants.seed.json</span>
        </div>
      </header>

      <section className="stats-grid">
        <StatCard label="Total restaurants" value={payload.totalRestaurants} />
        <StatCard label="Included restaurants" value={workflowCounts.included} />
        <StatCard label="Google enriched" value={workflowCounts.googleEnriched} />
        <StatCard label="Social review needed" value={workflowCounts.socialReviewNeeded} />
        <StatCard label="Social links verified" value={workflowCounts.socialLinksVerified} />
        <StatCard label="Social enriched" value={workflowCounts.socialEnriched} />
        <StatCard label="Scored" value={workflowCounts.scored} />
        <StatCard label="Ready for report" value={workflowCounts.readyForReport} />
        <StatCard label="Reports generated" value={workflowCounts.reportsGenerated} />
      </section>

      <section className="section-block">
        <div className="section-header">
          <h2>Workflow funnel</h2>
          <p>Counts by current workflow stage across the restaurant master list.</p>
        </div>
        <div className="featured-grid">
          {stageFunnel.map((entry) => (
            <article key={entry.stage} className="featured-card compact-card">
              <div className="featured-head">
                <div>
                  <h3>{entry.stage}</h3>
                </div>
                <strong className="funnel-count">{entry.count}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-header">
          <h2>Action queue</h2>
          <p>Which restaurants need the next operational step.</p>
        </div>
        <div className="featured-grid">
          {actionQueue.map((group) => (
            <article key={group.action} className="featured-card">
              <div className="featured-head">
                <div>
                  <h3>{group.action}</h3>
                  <p>{group.restaurants.length} shown</p>
                </div>
                <span className={`badge ${badgeTone(group.action)}`}>{group.action}</span>
              </div>
              <ul className="queue-list">
                {group.restaurants.length ? (
                  group.restaurants.map((restaurant) => (
                    <li key={restaurant.id}>
                      <strong>{getDisplayName(restaurant)}</strong>
                      <span>{restaurant.suggestedCommands[0] ?? "No command suggestion"}</span>
                    </li>
                  ))
                ) : (
                  <li>
                    <strong>None</strong>
                    <span>No restaurants currently in this queue.</span>
                  </li>
                )}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-header">
          <h2>Restaurant workflow table</h2>
          <p>Filter, sort, and select restaurants for the next enrichment step.</p>
        </div>
        <div className="toolbar toolbar-wide">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search restaurant, slug, category, workflow stage, or next action"
          />
          <select value={workflowFilter} onChange={(event) => setWorkflowFilter(event.target.value)}>
            <option value="all">All workflow stages</option>
            <option value="discovered">discovered</option>
            <option value="google_enriched">google_enriched</option>
            <option value="social_review_needed">social_review_needed</option>
            <option value="social_links_verified">social_links_verified</option>
            <option value="social_enriched">social_enriched</option>
            <option value="scored">scored</option>
            <option value="ready_for_report">ready_for_report</option>
            <option value="report_generated">report_generated</option>
          </select>
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
            <option value="all">All next actions</option>
            <option value="Needs Google enrichment">Needs Google enrichment</option>
            <option value="Needs social URL review">Needs social URL review</option>
            <option value="Ready for Instagram enrichment">Ready for Instagram enrichment</option>
            <option value="Ready for Facebook enrichment">Ready for Facebook enrichment</option>
            <option value="Needs scoring">Needs scoring</option>
            <option value="Ready for report">Ready for report</option>
            <option value="Complete for MVP">Complete for MVP</option>
          </select>
          <select value={readyFilter} onChange={(event) => setReadyFilter(event.target.value)}>
            <option value="all">All report readiness</option>
            <option value="ready">Ready for report</option>
            <option value="not_ready">Not ready for report</option>
          </select>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="overall">Sort by Overall Score</option>
            <option value="opportunity">Sort by Opportunity Score</option>
            <option value="socialPresence">Sort by Social Presence Score</option>
            <option value="reputation">Sort by Reputation Score</option>
            <option value="googleRating">Sort by Google Rating</option>
            <option value="reviewCount">Sort by Review Count</option>
            <option value="completeness">Sort by Completeness %</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>

        <div className="toggle-row">
          <label><input type="checkbox" checked={includedOnly} onChange={() => setIncludedOnly((value) => !value)} /> Included only</label>
          <label><input type="checkbox" checked={hasInstagramUrl} onChange={() => setHasInstagramUrl((value) => !value)} /> Has Instagram URL</label>
          <label><input type="checkbox" checked={hasFacebookUrl} onChange={() => setHasFacebookUrl((value) => !value)} /> Has Facebook URL</label>
          <label><input type="checkbox" checked={hasPostsOnly} onChange={() => setHasPostsOnly((value) => !value)} /> Has social posts</label>
          <label><input type="checkbox" checked={missingSocialReviewOnly} onChange={() => setMissingSocialReviewOnly((value) => !value)} /> Missing social review</label>
        </div>

        <div className="table-card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Restaurant</th>
                  <th>Workflow Stage</th>
                  <th>Next Action</th>
                  <th>Completeness</th>
                  <th>Google Status</th>
                  <th>Instagram Status</th>
                  <th>Facebook Status</th>
                  <th>Social Posts</th>
                  <th>Last Enriched</th>
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
                        <strong>{getDisplayName(restaurant)}</strong>
                        <span>{restaurant.category ?? restaurant.city}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${badgeTone(restaurant.workflowStage ?? "discovered")}`}>
                        {restaurant.workflowStage ?? "discovered"}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${badgeTone(restaurant.nextAction)}`}>
                        {restaurant.nextAction}
                      </span>
                    </td>
                    <td>{restaurant.dataCompletenessScore}%</td>
                    <td>{hasGoogleEnriched(restaurant) ? "enriched" : "missing"}</td>
                    <td>{restaurant.socialProfileStatus?.instagram ?? "unknown"}</td>
                    <td>{restaurant.socialProfileStatus?.facebook ?? "unknown"}</td>
                    <td>{(restaurant.instagram?.recentPostCount ?? 0) + (restaurant.facebook?.recentPostCount ?? 0)}</td>
                    <td>{getLastEnrichedLabel(restaurant)}</td>
                    <td>{restaurant.scores?.reputation ?? "n/a"}</td>
                    <td>{restaurant.scores?.socialPresence ?? "n/a"}</td>
                    <td>{restaurant.scores?.opportunity ?? "n/a"}</td>
                    <td>{restaurant.scores?.overall ?? "n/a"}</td>
                    <td>{restaurant.reportPath ? <a href={restaurant.reportPath} target="_blank" rel="noreferrer">Report</a> : "n/a"}</td>
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
          <p>Command suggestions and missing data for the selected restaurant.</p>
        </div>
        {selectedRestaurant ? (
          <div className="detail-card">
            <div className="detail-topline">
              <div>
                <h3>{getDisplayName(selectedRestaurant)}</h3>
                <p>{selectedRestaurant.address ?? "No address available"}</p>
              </div>
              <span className={`badge ${badgeTone(selectedRestaurant.nextAction)}`}>
                {selectedRestaurant.nextAction}
              </span>
            </div>
            <div className="detail-grid">
              <DetailGroup
                title="Workflow"
                lines={[
                  `Current workflow stage: ${selectedRestaurant.workflowStage ?? "discovered"}`,
                  `Data completeness: ${selectedRestaurant.dataCompletenessScore}%`,
                  `Ready for report: ${selectedRestaurant.readyForReport ? "yes" : "no"}`,
                  `Report exists: ${selectedRestaurant.reportExists ? "yes" : "no"}`
                ]}
              />
              <DetailGroup
                title="Missing data"
                lines={
                  selectedRestaurant.missingData.length
                    ? selectedRestaurant.missingData
                    : ["No current workflow gaps."]
                }
              />
              <DetailGroup
                title="Next recommended commands"
                lines={selectedRestaurant.suggestedCommands}
              />
              <DetailGroup
                title="Google details"
                lines={[
                  `Rating: ${selectedRestaurant.google?.rating ?? "n/a"}`,
                  `Review count: ${selectedRestaurant.google?.reviewCount ?? "n/a"}`,
                  `Phone: ${selectedRestaurant.phone ?? "n/a"}`,
                  `Website: ${selectedRestaurant.website ?? "n/a"}`
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
                title="Latest enrichment dates"
                lines={[
                  `Last Google enrichment: ${formatDate(selectedRestaurant.lastGoogleEnrichedAt)}`,
                  `Last social review: ${formatDate(selectedRestaurant.lastSocialReviewedAt)}`,
                  `Last social enrichment: ${formatDate(selectedRestaurant.lastSocialEnrichedAt)}`,
                  `Last scoring: ${formatDate(selectedRestaurant.lastScoredAt)}`
                ]}
              />
              <DetailGroup
                title="Recent social posts"
                lines={[
                  `Instagram posts stored: ${selectedRestaurant.instagram?.recentPostCount ?? 0}`,
                  `Latest Instagram post: ${formatDate(selectedRestaurant.instagram?.latestPostDate)}`,
                  `Facebook posts stored: ${selectedRestaurant.facebook?.recentPostCount ?? 0}`,
                  `Latest Facebook post: ${formatDate(selectedRestaurant.facebook?.latestPostDate)}`
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
                title="Notes"
                lines={[
                  ...selectedRestaurant.reviewNotes,
                  ...selectedRestaurant.socialVerificationNotes,
                  ...selectedRestaurant.socialEnrichmentNotes
                ].length ? [
                  ...selectedRestaurant.reviewNotes,
                  ...selectedRestaurant.socialVerificationNotes,
                  ...selectedRestaurant.socialEnrichmentNotes
                ] : ["No notes recorded."]}
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
        {lines.map((line, index) => (
          <li key={`${title}-${index}`}>{line}</li>
        ))}
      </ul>
    </article>
  );
}
