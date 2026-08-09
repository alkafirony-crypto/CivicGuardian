# CivicGuardian

**Community Hazard Reporting and Public Safety Management System** for Bangladesh.

CivicGuardian is a full-stack civic reporting application. Residents sign in with Google, choose a real Bangladesh location, upload their own evidence photo, describe the problem, review a Gemini-assisted visual classification, check for nearby duplicates, and submit a trackable report. Community verification and administrator workflow changes are kept separate from AI output.

This repository intentionally contains **no seeded incidents and no generated/stock hazard photographs presented as evidence**. An empty database produces an honest empty state.

## Trust model

- Citizen images are labeled as citizen-provided evidence.
- Gemini output is advisory, schema-validated, confidence-scored, and flagged for human review when uncertain or critical.
- A citizen may correct the AI category before submitting.
- The AI assessment is server-attested and bound to the evidence image so the browser cannot silently swap the analyzed image before submission.
- Community confirmation/dispute votes belong to individual signed-in users.
- Admin workflow actions require a server-verified `admin` session and are audit logged.
- Everyone uses the same Google sign-in. The server derives the role from the verified email; there is no public Admin sign-in selector.
- Admin role is granted only when the verified Google email appears in `ADMIN_EMAILS`. The provided configuration reserves `alkafirony@gmail.com` for that role.
- CivicGuardian does not claim to be connected to a government agency. Authority labels are routing guidance only until a real integration is formally configured.

## Stack

- React 19 + TypeScript + Tailwind CSS
- Leaflet + OpenStreetMap
- Express API
- Google Identity Services
- Gemini multimodal structured output
- PostgreSQL + PostGIS
- Zod validation, Helmet, rate limiting, signed HTTP-only sessions
- Docker + GitHub Actions

## Frontend design

CivicGuardian uses a compact civic-service interface rather than oversized marketing layouts. Its location-first entry point and short report steps are informed by established civic-reporting products, while its map-and-data view, visible status workflow, and privacy guidance remain specific to CivicGuardian's Bangladesh use case. The interface uses a 56 px navigation bar, a restrained 14 px base scale, 28–34 px page headings, a 1152 px content shell, compact report cards, and responsive form controls that remain comfortable on small Android screens.

## Bangladesh location system

The report form uses a real Leaflet map rather than category-specific location presets. Citizens can use device GPS, click the map, or search an address. A successful address search immediately moves the map and marks the best matching Bangladesh result. Road-number queries receive normalized fallback variants, and search results carry a location-aware zoom level so roads, neighbourhoods, cities and districts open at an appropriate scale. Search and reverse geocoding are proxied through the server, rate limited, restricted to Bangladesh, and request English display names from Nominatim. Hazard categories never determine coordinates.

Nearby candidates are computed with PostGIS `ST_DWithin`. Before submission, the citizen sees same-category reports within approximately 250 metres. No uncertain reports are merged automatically.

For a high-traffic public deployment, replace the community Nominatim endpoint with a geocoding provider or self-hosted service whose production-use terms fit the expected load.

## Dashboards, tracking and notifications

- Signed-in citizens have a dedicated dashboard containing only their own submitted reports, lifecycle progress, and notifications.
- Citizen Dashboard and Notifications are hidden from anonymous navigation and appear only after sign-in.
- Report status changes create a citizen notification and appear in the report timeline.
- Authorized administrators have a separate protected review dashboard with operational counts, recent alerts, filtering and status controls; Admin Dashboard is not exposed in anonymous or citizen navigation.
- New reports notify administrator accounts that already exist in the user database.
- Citizens can follow reports independently of voting or commenting, use mark-all-read, and choose status, admin, and resolution notification preferences.
- Community Heroes are ranked only from real community activity using the documented formula: reports ×5, verification actions ×2, votes ×1. Genuine community actions by an admin may appear with an Admin badge; admin workflow changes never earn points. An empty database produces no fake leaderboard entries.

## Trusted resolution workflow

CivicGuardian's strongest workflow is a transparent before-and-after record:

1. A citizen submits optimized, metadata-stripped evidence and a real Bangladesh location.
2. Gemini produces a server-attested advisory assessment.
3. Smart duplicate suggestions explain category, distance, age, and text similarity without automatically merging reports.
4. Community members may corroborate, dispute, follow, comment, or add privacy-redacted evidence.
5. An administrator cannot mark a report resolved without a resolution note and after-repair photo.
6. The original reporter and community can confirm the outcome, report it unresolved, or request another review.
7. The original reporter's disagreement, or multiple independent review requests, reopens the report and creates an auditable timeline event.

Gemini never marks a report resolved automatically.

## Smooth mobile experience

- Report forms auto-save locally for seven days and never submit silently while offline.
- Evidence images are orientation-corrected where supported, resized, re-encoded, and stripped of unnecessary metadata in the browser.
- A built-in privacy editor permanently redacts selected sensitive regions without facial recognition.
- Public report filters persist while navigating to details and back.
- Map code is loaded only when needed. Public lists use incremental loading and the API supports limit/offset plus search filters.
- My Area filters nearby reports in the browser; the citizen's current location is not uploaded or stored.
- Shareable `#/reports/REPORT_ID` routes support browser Back/Forward navigation.
- The installable PWA keeps the app shell, offline drafts, and previously loaded public reports available during connection loss.
- The interface uses a consistent English-only copy system.

## Gemini evidence analysis

Gemini receives the citizen image plus their description and returns strict structured output:

- category
- severity
- confidence
- visible evidence
- safety-risk wording
- image quality
- human-review flag

The prompt forbids invented addresses, casualties, population counts, repair costs, department actions, causes, measurements, and unseen damage. If Gemini is not configured or safely returns an invalid result, the API fails explicitly. There is no fabricated offline AI result.

One Gemini call is used for the report-analysis step. The server signs the validated result and evidence hash for a short time, allowing submission to reuse that assessment without paying for a duplicate model call.

The included `scripts/evaluate-vision.ts` can evaluate a labeled, lawfully sourced dataset. Do not publish accuracy numbers unless they were produced by an actual evaluation.

## Local setup

Requirements: Node 22+ and, for persistent data, PostgreSQL with PostGIS.

1. Copy `.env.example` to `.env`.
2. Add your free Google OAuth client ID and Gemini API key.
3. Set a random `COOKIE_SECRET` of at least 32 characters.
4. Start PostGIS with Docker Compose or point `DATABASE_URL` at a PostGIS database.
5. Run `npm install` and `npm run dev`.

Without `DATABASE_URL`, development uses an **empty, non-persistent local memory store** for interface work. Production refuses to start without the required database and security credentials.

## Environment variables

```text
DATABASE_URL
COOKIE_SECRET
GOOGLE_CLIENT_ID
VITE_GOOGLE_CLIENT_ID
ADMIN_EMAILS=alkafirony@gmail.com
GEMINI_API_KEY
GEMINI_MODEL=gemini-3.6-flash
PUBLIC_APP_URL
PORT=3000
```

Never commit real API keys, database credentials, or cookie secrets.

## Production deployment

`Dockerfile` builds the React frontend and Express server. `docker-compose.yml` provides a local PostGIS deployment. `/api/health` is suitable for health checks.

Production mode refuses to start unless `DATABASE_URL`, `COOKIE_SECRET`, `GOOGLE_CLIENT_ID`, and `GEMINI_API_KEY` exist, and it rejects cookie secrets shorter than 32 characters. Use HTTPS in production; session cookies become `Secure`, `HttpOnly`, and `SameSite=Lax`.

The software can be deployed without buying a custom domain or paid map API. Free service tiers have quotas and are not a guarantee of indefinite zero-cost operation at public-city scale.

## Verification

```bash
npm run lint
npm test
npm run build
```

Tests cover Gemini schema safety, admin-email allowlisting, representative locations across Bangladesh, road-number query normalization, map zoom selection, citizen report ownership, notifications, preferences, follows, resolution feedback, contributor scoring, and smart duplicate matching. GitHub Actions runs checks on pushes and pull requests.

Startup applies each SQL file in `db/migrations` once, in filename order, and records successful filenames in `civicguardian_migrations`. `002_trusted_resolution.sql` is idempotent and adds follows, resolution feedback, notification preferences, moderation support, resolution proof, and supporting indexes without deleting existing users or reports.

The production app restores cached public reports before refreshing them, renders the public landing page without waiting for the API, and uses a cached application shell on repeat visits. Hashed frontend assets receive long-lived immutable cache headers. These measures shorten application-controlled loading, but a Render Free web service can still show Render's own wake-up page after the service has been idle.

## Known production limits

Before a large public rollout, add durable object storage for evidence media, formal moderation/retention policy, backup/restore procedures, accessibility testing with assistive technology, production observability, a higher-capacity geocoder, and verified institutional routing/integration agreements. The current project is deployment-capable for a capstone/portfolio and controlled real-world pilot, but those operational pieces matter at city scale.
