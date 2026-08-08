# CivicGuardian

**Community Hazard Reporting and Public Safety Management System** for Dhaka, Bangladesh.

CivicGuardian is a full-stack civic reporting application. Residents sign in with Google, choose a real Dhaka location, upload their own evidence photo, describe the problem, review a Gemini-assisted visual classification, check for nearby duplicates, and submit a trackable report. Community verification and administrator workflow changes are kept separate from AI output.

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

## Dhaka location system

The report form uses a real Leaflet map rather than category-specific location presets. Citizens can use device GPS, click the map, or search an address. A successful address search immediately moves the map and marks the best matching Dhaka result. Search and reverse geocoding are proxied through the server, rate limited, and request English display names from Nominatim. The current service boundary is a configurable Dhaka bounding area; hazard categories never determine coordinates.

Nearby candidates are computed with PostGIS `ST_DWithin`. Before submission, the citizen sees same-category reports within approximately 250 metres. No uncertain reports are merged automatically.

For a high-traffic public deployment, replace the community Nominatim endpoint with a geocoding provider or self-hosted service whose production-use terms fit the expected load.

## Dashboards, tracking and notifications

- Signed-in citizens have a dedicated dashboard containing only their own submitted reports, lifecycle progress, and notifications.
- Citizen Dashboard and Notifications are hidden from anonymous navigation and appear only after sign-in.
- Report status changes create a citizen notification and appear in the report timeline.
- Authorized administrators have a separate protected review dashboard with operational counts, recent alerts, filtering and status controls; Admin Dashboard is not exposed in anonymous or citizen navigation.
- New reports notify administrator accounts that already exist in the user database.
- Community Heroes are ranked only from real user activity using the documented formula: reports ×5, verification actions ×2, votes ×1. An empty database produces no fake leaderboard entries.

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
GEMINI_MODEL=gemini-2.5-flash
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

Tests cover Gemini schema safety, admin-email allowlisting, points across the configured Dhaka service area, citizen report ownership, notifications, and contributor scoring. GitHub Actions runs checks on pushes and pull requests.

## Known production limits

Before a large public rollout, add durable object storage for evidence media, formal moderation/retention policy, backup/restore procedures, accessibility testing with assistive technology, production observability, a higher-capacity geocoder, and verified institutional routing/integration agreements. The current project is deployment-capable for a capstone/portfolio and controlled real-world pilot, but those operational pieces matter at city scale.
