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

src/
  apis/
    googlePlaces.ts
    apify.ts
  lib/
    normalizeRestaurant.ts
    scoring.ts
    sentiment.ts
    slug.ts
  types/
    restaurant.ts
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
- `APIFY_TOKEN` reserved for future Facebook/Instagram enrichment
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

Social profile statuses:

- `verified`: a manually verified official public profile URL was stored
- `not_found`: a manual check was done and no official profile was found
- `unknown`: the profile has not been manually checked yet

Run typecheck:

```powershell
npm run typecheck
```

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

## Notes

- If `GOOGLE_PLACES_API_KEY` is missing, the Google scripts fail with a clear message instead of crashing.
- Raw Google payloads are stored locally under `data/raw/google/`.
- Facebook and Instagram enrichment are placeholders in Phase 1 and are not implemented yet.
- Social/profile URLs should be manually verified before any future scraping workflow uses them.
