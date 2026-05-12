# RockHillAnalytics

RockHillAnalytics is a local restaurant intelligence and analytics project focused first on restaurants in Rock Hill, South Carolina.

## Phase 1 Goal

Phase 1 is a local TypeScript/Node.js data pipeline. It is not a public website or dashboard yet.

Phase 1 covers:

- Finding Rock Hill restaurants with Google Places
- Saving raw API responses locally
- Normalizing restaurant records into a master seed file
- Enriching a single restaurant with Google detail data
- Scoring one restaurant with simple early heuristics
- Generating a Markdown intelligence report
- Leaving clean placeholders for future Facebook and Instagram enrichment

## Phase 2A Goal

Phase 2A adds a manual social URL verification workflow. This phase does not scrape Facebook, Instagram, or TikTok yet. It stores manually verified public URLs on restaurant records, or records that no official profile was found, so later enrichment can use cleaner inputs.

## Phase 2B Goal

Phase 2B adds one-restaurant social enrichment through Apify after social URLs have been manually verified. This phase is still intentionally narrow: it runs against one restaurant at a time, preserves raw actor output locally, normalizes a small recent-post sample, updates scoring, and refreshes the report.

## Phase 2C Goal

Phase 2C hardens the social enrichment workflow before scaling. It caps stored social posts, adds review/readiness reporting, and clarifies how to move restaurants through a safe enrichment sequence.

## Phase 3 Goal

Phase 3 adds workflow infrastructure before final reports. The focus is controlled progression through discovery, Google enrichment, social review, social enrichment, scoring, and dashboard review. Final reports still exist, but they are intentionally secondary until the workflow is stable.

## Local Dashboard

The repository now includes a lightweight local review dashboard built with Vite + React. It is intended as an internal workflow command center for reviewing restaurant records, identifying missing data, and deciding what to enrich next. It is not a public launch site.

## Stack

- Node.js
- TypeScript
- `tsx`
- `dotenv`
- `zod`
- Built-in `fetch`
- Local JSON storage

## Project Structure

```text
data/
  restaurants.seed.json
  raw/
    google/
    facebook/
    instagram/
  processed/

reports/

scripts/
  01-find-restaurants.ts
  02-enrich-google.ts
  03-enrich-facebook.ts
  04-enrich-instagram.ts
  05-score-restaurant.ts
  06-generate-report.ts
  07-review-seed-list.ts
  08-add-social-links.ts
  09-review-social-data.ts
  10-export-web-data.ts
  11-review-workflow.ts

src/
  apis/
    googlePlaces.ts
    apify.ts
  lib/
    normalizeRestaurant.ts
    scoring.ts
    sentiment.ts
    slug.ts
    workflow.ts
  types/
    restaurant.ts

web/
  src/
    App.tsx
    main.tsx
    styles.css

public/
  data/
    restaurants.json
  reports/
```

## Setup

1. Install dependencies:

```powershell
npm install
```

2. Create a local environment file:

```powershell
Copy-Item .env.example .env.local
```

3. Add your API keys to `.env.local`.

## Environment Variables

- `GOOGLE_PLACES_API_KEY` for Google Places search and place details
- `APIFY_TOKEN` for Apify-backed Facebook and Instagram enrichment
- `APIFY_INSTAGRAM_ACTOR_ID` for the Instagram actor, currently tested with `apify/instagram-scraper`
- `APIFY_FACEBOOK_ACTOR_ID` for the Facebook Posts Scraper actor, currently tested with `apify/facebook-posts-scraper`
- `SOCIAL_MAX_POSTS` to cap stored recent social posts per platform. Defaults to `10`.
- `OPENAI_API_KEY` reserved for future analysis and report enhancements

## Commands

Find and seed restaurants:

```powershell
npm run find:restaurants
```

Enrich a single restaurant from Google Places details:

```powershell
npm run enrich:google -- "Restaurant Name"
```

Score a single restaurant:

```powershell
npm run score -- "Restaurant Name"
```

Generate a Markdown report:

```powershell
npm run report -- "Restaurant Name"
```

Review and classify the current seed list:

```powershell
npm run review:seed
```

Manually attach verified social/profile URLs:

```powershell
npm run add:social -- "Big Wok II" --no-facebook --no-instagram --notes "No official Facebook or Instagram found during manual check"
npm run add:social -- "Big Wok II" --facebook "https://facebook.com/example" --instagram "https://instagram.com/example"
npm run add:social -- "Big Wok II" --website "https://example.com"
npm run add:social -- "Big Wok II" --tiktok "https://tiktok.com/@example"
```

Run one-restaurant Instagram enrichment after URLs are verified:

```powershell
npm run enrich:instagram -- "Jackass Café & Wine Bar"
```

Run one-restaurant Facebook enrichment after URLs are verified:

```powershell
npm run enrich:facebook -- "Jackass Café & Wine Bar"
```

Review current social readiness and enrichment coverage:

```powershell
npm run review:social
```

Review the current workflow queue and stage distribution:

```powershell
npm run review:workflow
```

Review likely duplicates while preserving legitimate multi-location restaurants:

```powershell
npm run review:duplicates
```

Preview the next controlled Google enrichment batch:

```powershell
npm run batch:google -- --limit 10 --dry-run
```

Run a confirmed live Google enrichment batch:

```powershell
npm run batch:google -- --limit 10 --confirm
```

Export safe dashboard data and copied reports:

```powershell
npm run export:web-data
```

Start the local dashboard:

```powershell
npm run dev
```

Build the dashboard:

```powershell
npm run build
```

Social profile statuses:

- `verified`: a manually verified official public profile URL was stored
- `not_found`: a manual check was done and no official profile was found
- `unknown`: the profile has not been manually checked yet

Run typecheck:

```powershell
npm run typecheck
```

## Safe Scaling Process

Recommended order for the workflow:

1. `npm run find:restaurants`
2. `npm run review:seed`
3. `npm run batch:google -- --limit 10 --dry-run`
4. `npm run batch:google -- --limit 10 --confirm`
5. `npm run review:workflow`
6. `npm run export:web-data`
7. Review the dashboard and inspect the batch results
8. `npm run add:social -- "Restaurant Name" ...`
9. `npm run review:social`
10. `npm run enrich:instagram -- "Restaurant Name"`
11. `npm run enrich:facebook -- "Restaurant Name"`
12. `npm run score -- "Restaurant Name"`
13. `npm run review:workflow`
14. `npm run export:web-data`
15. `npm run dev`

This keeps manual URL verification ahead of scraping, limits cost exposure, and makes it easier to review quality before scaling. Final report generation is intentionally deferred until a restaurant has stable workflow coverage.

`batch:google` safety notes:

- The default batch size is `10`.
- `--dry-run` shows the next candidates without calling Google.
- Live Google enrichment requires `--confirm`.
- Progress is written back to `data/restaurants.seed.json` after each restaurant so a mid-run failure does not lose earlier work.
- Optional flags:
  - `--limit 10`
  - `--status included`
  - `--start-after "Restaurant Name"`

Duplicate review notes:

- Same-name restaurants are not automatically duplicates.
- If restaurants have different Google Place IDs, addresses, phone numbers, or clearly separate locations, they should usually remain separate records.
- Multi-location businesses should keep location-specific records so each location can retain its own Google reviews, social links, scores, and future report path.
- `npm run review:duplicates` flags records as `exact_duplicate`, `possible_duplicate`, `multi_location`, or `unique` without deleting or merging anything automatically.

Dashboard review flow:

1. `npm run export:web-data`
2. `npm run dev`
3. Open the local Vite URL shown in the terminal
4. Re-run `npm run export:web-data` after seed or report changes

## Example Workflow

```powershell
npm install
Copy-Item .env.example .env.local
npm run find:restaurants
npm run enrich:google -- "Legal Remedy Brewing"
npm run score -- "Legal Remedy Brewing"
npm run report -- "Legal Remedy Brewing"
```

## Data Compliance

- Use public business data only.
- Do not scrape private/member-only Facebook groups.
- Do not store unnecessary personal data from individual commenters.
- Summarize public sentiment trends rather than republishing personal comments.
- Use Facebook Posts Scraper for recent public Facebook page posts.
- Do not use Facebook Pages Scraper unless page metadata is explicitly needed later.
- Only scrape public Facebook pages and public Instagram profiles after manual URL verification.

## Notes

- If `GOOGLE_PLACES_API_KEY` is missing, the Google scripts fail with a clear message instead of crashing.
- Raw Google payloads are stored locally under `data/raw/google/`.
- Raw Facebook and Instagram actor payloads are stored locally under `data/raw/facebook/` and `data/raw/instagram/`.
- Social/profile URLs should be manually verified before any future scraping workflow uses them.
- Stored Facebook and Instagram recent posts are capped by `SOCIAL_MAX_POSTS`, which defaults to `10`.
- Dashboard data is exported to `public/data/restaurants.json` and excludes raw API payloads and unnecessary personal/commenter data.
- Workflow metadata is stored on restaurant records so the dashboard and `npm run review:workflow` can recommend the next command without auto-running it.
