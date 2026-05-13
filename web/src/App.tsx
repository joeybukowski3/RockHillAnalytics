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
  socialReviewStatus?: string;
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
  duplicateReviewStatus?: string;
  duplicateReviewNotes: string[];
  duplicateGroupKey?: string;
  google?: {
    rating?: number;
    reviewCount?: number;
    businessStatus?: string;
    openingHours?: string[];
    reviews?: {
      authorName?: string;
      rating?: number;
      text?: string;
      publishedAt?: string;
    }[];
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
    recentPosts?: {
      postUrl?: string;
      caption?: string;
      publishedAt?: string;
      engagement?: {
        likes?: number;
        comments?: number;
        shares?: number;
        reactions?: number;
      };
    }[];
  };
  instagram?: {
    profileUrl?: string;
    followers?: number;
    postCount?: number;
    latestPostDate?: string;
    recentPostCount: number;
    recentPosts?: {
      postUrl?: string;
      caption?: string;
      publishedAt?: string;
      engagement?: {
        likes?: number;
        comments?: number;
        views?: number;
      };
    }[];
  };
  scores?: {
    reputation: number;
    socialPresence: number;
    opportunity: number;
    overall: number;
    notes?: string[];
  };
  reviewNotes: string[];
  socialVerificationNotes: string[];
  socialReviewNotes: string[];
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
  if (Number.isNaN(timestamp)) {
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
    value === "not_started" ||
    value === "partial" ||
    value === "in_progress" ||
    value === "Needs social URL review" ||
    value === "Partial social review" ||
    value === "Social reviewed but no profiles found" ||
    value === "Ready for Instagram enrichment" ||
    value === "Ready for Facebook enrichment" ||
    value === "Needs scoring" ||
    value === "Ready for report" ||
    value === "possible_duplicate"
  ) {
    return "warn";
  }

  if (
    value === "excluded" ||
    value === "closed" ||
    value === "failed" ||
    value === "exact_duplicate"
  ) {
    return "bad";
  }

  if (value === "multi_location" || value === "not_found") {
    return "neutral";
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

function getSocialReviewStatus(restaurant: DashboardRestaurant): string {
  return restaurant.socialReviewStatus ?? "not_started";
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
    "Strong reputation and strong social presence improve public presence, but lower immediate opportunity urgency.",
    "No social profile found is a marketing opportunity, not a data failure."
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
  const [view, setView] = useState<"dashboard" | "report">("dashboard");

  useEffect(() => {
    fetch("/data/restaurants.json")
      .then((response) => response.json())
      .then((json: DashboardPayload) => {
        setPayload(json);
      })
      .catch((error) => console.error(error));
  }, []);

  const restaurants = payload?.restaurants ?? [];
  const includedRestaurants = useMemo(
    () => restaurants.filter((restaurant) => restaurant.reviewStatus === "included"),
    [restaurants]
  );

  const featuredReports = useMemo(
    () => restaurants.filter((r) => r.workflowStage === "report_generated"),
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
      reportsGenerated: count((restaurant) => restaurant.reportExists),
      exactDuplicates: count((restaurant) => restaurant.duplicateReviewStatus === "exact_duplicate"),
      possibleDuplicates: count((restaurant) => restaurant.duplicateReviewStatus === "possible_duplicate"),
      multiLocation: count((restaurant) => restaurant.duplicateReviewStatus === "multi_location")
    };
  }, [includedRestaurants]);

  const socialReviewCounts = useMemo(() => {
    const count = (predicate: (restaurant: DashboardRestaurant) => boolean) =>
      includedRestaurants.filter(predicate).length;

    return {
      notStarted: count((restaurant) => getSocialReviewStatus(restaurant) === "not_started"),
      partial: count((restaurant) => getSocialReviewStatus(restaurant) === "partial"),
      verified: count((restaurant) => getSocialReviewStatus(restaurant) === "verified"),
      notFound: count((restaurant) => getSocialReviewStatus(restaurant) === "not_found"),
      inProgress: count((restaurant) => getSocialReviewStatus(restaurant) === "in_progress"),
      readyForInstagram: count(
        (restaurant) => restaurant.nextAction === "Ready for Instagram enrichment"
      ),
      readyForFacebook: count(
        (restaurant) => restaurant.nextAction === "Ready for Facebook enrichment"
      )
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

        return (right.scores?.[sortKey as keyof typeof right.scores] ?? -1) - (left.scores?.[sortKey as keyof typeof left.scores] ?? -1);
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

  const selectedRestaurant = useMemo(() => {
    return restaurants.find((r) => r.id === selectedId) || null;
  }, [restaurants, selectedId]);

  const handleViewReport = (id: string) => {
    setSelectedId(id);
    setView("report");
    window.scrollTo(0, 0);
  };

  if (!payload) {
    return <div className="loading">Loading RockHillAnalytics dashboard...</div>;
  }

  if (view === "report" && selectedRestaurant) {
    return (
      <ReportView
        restaurant={selectedRestaurant}
        onBack={() => setView("dashboard")}
      />
    );
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

      {featuredReports.length > 0 && (
        <section className="section-block">
          <div className="section-header">
            <h2>Featured Reports</h2>
            <p>Recently generated reports ready for review.</p>
          </div>
          <div className="featured-reports-grid">
            {featuredReports.map((r) => (
              <article key={r.id} className="featured-card">
                <div className="featured-head">
                  <div>
                    <h3>{getDisplayName(r)}</h3>
                    <p>{r.category}</p>
                  </div>
                  <span className="badge good">Report Generated</span>
                </div>
                <div className="metric-list">
                  <div>
                    <dt>Overall Score</dt>
                    <dd>{r.scores?.overall ?? "n/a"}</dd>
                  </div>
                  <div>
                    <dt>Completeness</dt>
                    <dd>{r.dataCompletenessScore}%</dd>
                  </div>
                </div>
                <button
                  className="report-link"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  onClick={() => handleViewReport(r.id)}
                >
                  View current data →
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

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
        <StatCard label="Exact duplicates" value={workflowCounts.exactDuplicates} />
        <StatCard label="Possible duplicates" value={workflowCounts.possibleDuplicates} />
        <StatCard label="Multi-location records" value={workflowCounts.multiLocation} />
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
          <h2>Social enrichment queue</h2>
          <p>Controlled batch candidates for Instagram and Facebook enrichment.</p>
        </div>
        <div className="featured-grid">
          <article className="featured-card">
            <div className="featured-head">
              <div>
                <h3>Enrichment readiness</h3>
                <p>Status of verified social URLs across included restaurants.</p>
              </div>
              <span className="badge neutral">Batch status</span>
            </div>
            <ul className="queue-list">
              <li>
                <strong>Ready for Instagram enrichment</strong>
                <span>{includedRestaurants.filter(r => (r.socialProfileStatus?.instagram === "verified") && !(r.instagram?.recentPostCount ?? 0)).length} restaurants</span>
              </li>
              <li>
                <strong>Ready for Facebook enrichment</strong>
                <span>{includedRestaurants.filter(r => (r.socialProfileStatus?.facebook === "verified") && !(r.facebook?.recentPostCount ?? 0)).length} restaurants</span>
              </li>
              <li>
                <strong>Enriched Instagram</strong>
                <span>{includedRestaurants.filter(r => (r.instagram?.recentPostCount ?? 0) > 0).length} restaurants</span>
              </li>
              <li>
                <strong>Enriched Facebook</strong>
                <span>{includedRestaurants.filter(r => (r.facebook?.recentPostCount ?? 0) > 0).length} restaurants</span>
              </li>
              <li>
                <strong>Social reviewed but no profiles found</strong>
                <span>{includedRestaurants.filter(r => r.socialProfileStatus?.instagram === "not_found" && r.socialProfileStatus?.facebook === "not_found").length} restaurants</span>
              </li>
            </ul>
          </article>
          <article className="featured-card">
            <div className="featured-head">
              <div>
                <h3>Suggested batch commands</h3>
                <p>Use --confirm to execute live Apify runs.</p>
              </div>
              <span className="badge neutral">Controlled batch</span>
            </div>
            <ul className="queue-list">
              <li>
                <strong>Instagram batch (dry run)</strong>
                <span>npm run batch:social -- --platform instagram --limit 5 --dry-run</span>
              </li>
              <li>
                <strong>Facebook batch (dry run)</strong>
                <span>npm run batch:social -- --platform facebook --limit 5 --dry-run</span>
              </li>
              <li>
                <strong>Instagram batch (live)</strong>
                <span>npm run batch:social -- --platform instagram --limit 5 --confirm</span>
              </li>
              <li>
                <strong>Facebook batch (live)</strong>
                <span>npm run batch:social -- --platform facebook --limit 5 --confirm</span>
              </li>
            </ul>
          </article>
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
            placeholder="Search restaurant..."
          />
          <select value={workflowFilter} onChange={(event) => setWorkflowFilter(event.target.value)}>
            <option value="all">All stages</option>
            {stageFunnel.map((f) => (
              <option key={f.stage} value={f.stage}>{f.stage}</option>
            ))}
          </select>
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
            <option value="all">All actions</option>
            <option value="Needs Google enrichment">Needs Google enrichment</option>
            <option value="Needs social URL review">Needs social URL review</option>
            <option value="Ready for Instagram enrichment">Ready for Instagram enrichment</option>
            <option value="Ready for Facebook enrichment">Ready for Facebook enrichment</option>
            <option value="Needs scoring">Needs scoring</option>
            <option value="Ready for report">Ready for report</option>
            <option value="Complete for MVP">Complete for MVP</option>
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

        <div className="table-card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Restaurant</th>
                  <th>Workflow Stage</th>
                  <th>Next Action</th>
                  <th>Completeness</th>
                  <th>Google</th>
                  <th>IG</th>
                  <th>FB</th>
                  <th>Posts</th>
                  <th>Overall</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRestaurants.map((restaurant) => (
                  <tr
                    key={restaurant.id}
                    className={restaurant.id === selectedId ? "selected-row" : ""}
                    onClick={() => setSelectedId(restaurant.id)}
                  >
                    <td>
                      <div className="table-name">
                        <strong>{getDisplayName(restaurant)}</strong>
                        <span>{restaurant.category}</span>
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
                    <td>{hasGoogleEnriched(restaurant) ? "✅" : "❌"}</td>
                    <td>{restaurant.socialProfileStatus?.instagram === "verified" ? "✅" : "❌"}</td>
                    <td>{restaurant.socialProfileStatus?.facebook === "verified" ? "✅" : "❌"}</td>
                    <td>{(restaurant.instagram?.recentPostCount ?? 0) + (restaurant.facebook?.recentPostCount ?? 0)}</td>
                    <td><strong>{restaurant.scores?.overall ?? "n/a"}</strong></td>
                    <td>
                      <button
                        className="report-link"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewReport(restaurant.id);
                        }}
                      >
                        View Data
                      </button>
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
          <h2>Quick Detail</h2>
          <p>Metadata and command suggestions.</p>
        </div>
        {selectedRestaurant ? (
          <div className="detail-card">
            <div className="detail-topline">
              <div>
                <h3>{getDisplayName(selectedRestaurant)}</h3>
                <p>{selectedRestaurant.address ?? "No address available"}</p>
              </div>
              <button className="badge neutral" onClick={() => handleViewReport(selectedRestaurant.id)}>Open Full Data Report</button>
            </div>
            <div className="detail-grid">
               <DetailGroup
                title="Next recommended commands"
                lines={selectedRestaurant.suggestedCommands}
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
                title="Notes"
                lines={[
                  ...selectedRestaurant.reviewNotes,
                  ...selectedRestaurant.socialVerificationNotes,
                  ...selectedRestaurant.socialReviewNotes,
                  ...selectedRestaurant.socialEnrichmentNotes
                ].length ? [
                  ...selectedRestaurant.reviewNotes,
                  ...selectedRestaurant.socialVerificationNotes,
                  ...selectedRestaurant.socialReviewNotes,
                  ...selectedRestaurant.socialEnrichmentNotes
                ] : ["No notes recorded."]}
              />
            </div>
          </div>
        ) : (
          <div className="detail-card">Select a restaurant above for quick details.</div>
        )}
      </section>
    </div>
  );
}

function ReportView({ restaurant, onBack }: { restaurant: DashboardRestaurant, onBack: () => void }) {
  const [markdown, setMarkdown] = useState<string | null>(null);

  useEffect(() => {
    if (restaurant.reportPath) {
      fetch(restaurant.reportPath)
        .then(res => res.text())
        .then(text => setMarkdown(text))
        .catch(err => console.error("Error fetching report:", err));
    }
  }, [restaurant.reportPath]);

  return (
    <div className="report-preview-view">
      <div className="back-button" onClick={onBack}>
        ← Back to Dashboard
      </div>

      <header className="report-header">
        <h1>{getDisplayName(restaurant)}</h1>
        <div className="badge-row">
          <span className={`badge ${badgeTone(restaurant.workflowStage ?? "discovered")}`}>{restaurant.workflowStage}</span>
          <span className="badge neutral">{restaurant.category}</span>
          <span className="badge good">{restaurant.dataCompletenessScore}% Complete</span>
        </div>
        <div style={{ marginTop: "16px", color: "#637387" }}>
          <p>{restaurant.address}</p>
          <p>{restaurant.phone} • <a href={restaurant.website} target="_blank" rel="noreferrer">{restaurant.website}</a></p>
          {restaurant.googleMapsUrl && <p><a href={restaurant.googleMapsUrl} target="_blank" rel="noreferrer">View on Google Maps</a></p>}
        </div>
      </header>

      <section className="report-section">
        <h2>Scoring Analysis</h2>
        <div className="score-cards">
          <div className="score-card">
            <h4>Overall Score</h4>
            <div className="score-value">{restaurant.scores?.overall ?? "n/a"}</div>
          </div>
          <div className="score-card">
            <h4>Reputation</h4>
            <div className="score-value">{restaurant.scores?.reputation ?? "n/a"}</div>
          </div>
          <div className="score-card">
            <h4>Social Presence</h4>
            <div className="score-value">{restaurant.scores?.socialPresence ?? "n/a"}</div>
          </div>
          <div className="score-card">
            <h4>Opportunity</h4>
            <div className="score-value">{restaurant.scores?.opportunity ?? "n/a"}</div>
          </div>
        </div>
        <ul style={{ color: "#4b5563" }}>
          {getScoreExplanation(restaurant).map((line, i) => <li key={i}>{line}</li>)}
          {restaurant.scores?.notes?.map((n, i) => <li key={`note-${i}`}><strong>Logic:</strong> {n}</li>)}
        </ul>
      </section>

      <section className="report-section">
        <h2>Google Business Profile</h2>
        <div className="metric-list">
          <div>
            <dt>Rating</dt>
            <dd>{restaurant.google?.rating ?? "n/a"} ({restaurant.google?.reviewCount ?? 0} reviews)</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{restaurant.google?.businessStatus ?? "unknown"}</dd>
          </div>
        </div>
        <h3>Stored Reviews</h3>
        {restaurant.google?.reviews?.length ? (
          <ul className="queue-list">
            {restaurant.google.reviews.map((r, i) => (
              <li key={i}>
                <strong>{r.authorName} • {r.rating} ⭐</strong>
                <span>{r.text}</span>
                <small>{formatDate(r.publishedAt)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "#637387" }}>Detailed Google review text is not currently available in stored data.</p>
        )}
      </section>

      <section className="report-section">
        <h2>Social Presence</h2>
        <div className="metric-list" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          <div>
            <dt>Instagram</dt>
            <dd>{restaurant.socialProfileStatus?.instagram ?? "unknown"}</dd>
            {restaurant.instagramUrl && <a href={restaurant.instagramUrl} target="_blank" rel="noreferrer">Profile Link</a>}
          </div>
          <div>
            <dt>Facebook</dt>
            <dd>{restaurant.socialProfileStatus?.facebook ?? "unknown"}</dd>
            {restaurant.facebookUrl && <a href={restaurant.facebookUrl} target="_blank" rel="noreferrer">Page Link</a>}
          </div>
          <div>
            <dt>TikTok</dt>
            <dd>{restaurant.socialProfileStatus?.tiktok ?? "unknown"}</dd>
          </div>
        </div>
        <p style={{ fontSize: "0.9rem", color: "#637387" }}>
          Last Reviewed: {formatDate(restaurant.lastSocialReviewedAt)}<br />
          Notes: {restaurant.socialVerificationNotes.join(", ") || "No verification notes."}
        </p>

        {restaurant.instagram && restaurant.instagram.recentPosts?.length ? (
          <div style={{ marginTop: "24px" }}>
            <h3>Recent Instagram Posts ({restaurant.instagram.recentPostCount})</h3>
            <div className="table-wrapper">
              <table style={{ minWidth: "100%" }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Caption Preview</th>
                    <th>Engagement</th>
                    <th>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurant.instagram.recentPosts.map((p, i) => (
                    <tr key={i}>
                      <td>{formatDate(p.publishedAt)}</td>
                      <td style={{ maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.caption}</td>
                      <td>{p.engagement?.likes ?? 0} Likes, {p.engagement?.comments ?? 0} Comments</td>
                      <td><a href={p.postUrl} target="_blank" rel="noreferrer">View</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {restaurant.facebook && restaurant.facebook.recentPosts?.length ? (
          <div style={{ marginTop: "24px" }}>
            <h3>Recent Facebook Posts ({restaurant.facebook.recentPostCount})</h3>
            <div className="table-wrapper">
              <table style={{ minWidth: "100%" }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Caption Preview</th>
                    <th>Engagement</th>
                    <th>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurant.facebook.recentPosts.map((p, i) => (
                    <tr key={i}>
                      <td>{formatDate(p.publishedAt)}</td>
                      <td style={{ maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.caption}</td>
                      <td>{p.engagement?.reactions ?? p.engagement?.likes ?? 0} Reactions, {p.engagement?.comments ?? 0} Comments</td>
                      <td><a href={p.postUrl} target="_blank" rel="noreferrer">View</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section className="report-section">
        <h2>Workflow & Data Quality</h2>
        <div className="detail-grid">
          <DetailGroup
            title="Metadata"
            lines={[
              `Stage: ${restaurant.workflowStage}`,
              `Next: ${restaurant.nextAction}`,
              `Duplicate Status: ${restaurant.duplicateReviewStatus ?? "unique"}`,
              `Ready for Report: ${restaurant.readyForReport ? "Yes" : "No"}`
            ]}
          />
          <DetailGroup
             title="Timestamps"
             lines={[
               `Last Google Enrichment: ${formatDate(restaurant.lastGoogleEnrichedAt)}`,
               `Last Social Review: ${formatDate(restaurant.lastSocialReviewedAt)}`,
               `Last Social Enrichment: ${formatDate(restaurant.lastSocialEnrichedAt)}`,
               `Last Scored: ${formatDate(restaurant.lastScoredAt)}`
             ]}
          />
        </div>
      </section>

      {markdown && (
        <section className="report-section">
          <h2>Current Markdown Report</h2>
          <div className="markdown-content">
            {markdown}
          </div>
        </section>
      )}

      <footer style={{ marginTop: "64px", borderTop: "1px solid #eee", paddingTop: "24px", textAlign: "center", color: "#999" }}>
        Internal Data Review • RockHillAnalytics • {new Date().toLocaleDateString()}
      </footer>
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
