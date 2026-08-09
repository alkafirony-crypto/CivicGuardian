# CivicGuardian V12 balanced professional frontend

## Completed

- Reworked the frontend around proven civic-reporting patterns: location-first reporting, one clear report action, compact public data cards, visible progress, and privacy-aware community participation.
- Rebalanced the V10 compact interface to a readable 16 px base, 72 px navigation, 32–42 px functional page headings, and a responsive 1280 px content shell.
- Reworked typography, spacing, cards, tables, forms, calls to action, dashboards, and empty states across the landing page, public map, report wizard, report details, Community Heroes, citizen dashboard, notifications, and administrator console without removing any V11 behavior.
- Added a professional Work Sans design system inspired by the strongest patterns on Snap Send Solve: warm black, high-visibility lime, sky blue, orange highlights, warm-neutral surfaces, strong contrast, and clear primary actions. CivicGuardian branding and workflows remain original.
- Community Heroes now uses a practical 28–34 px page title, horizontal scoring summaries, denser leaderboard rows, and smaller empty/loading states.
- Smooth optimistic voting, corroboration, dispute, follow, comment, and evidence flows with rollback and friendly errors.
- Offline-safe seven-day report drafts, duplicate-submit protection, network timeouts, and previously loaded public report cache.
- Browser-side evidence resizing, orientation handling where supported, metadata removal, and permanent user-selected privacy redaction.
- Lazy-loaded map and feature pages, incremental report loading, persistent filters, direct report links, and Back/Forward routing.
- My Area filtering with explicit permission context and no location upload or storage.
- Smart duplicate ranking by distance, category, age, status, and description similarity, with clear explanations and no automatic merge.
- Report following, unread notification badge, mark-all-read, and notification preferences.
- Required before-and-after repair proof, citizen resolution confirmation, and rule-based reopening for credible disagreement.
- Consistent English-only interface copy. The language switch and previously saved Bengali preference are removed.
- Original shield, pin, and verification logo; favicon; installable PWA; update prompt; offline app shell.
- Transparent review queue wording, accessibility improvements, reduced-motion support, moderation endpoints, and production-safe indexes.
- Admins can appear in Community Heroes for genuine community actions with an Admin badge. Admin workflow changes earn no points.
- Bangladesh-wide public and reporting maps with national bounds, GPS, map-click reverse lookup, and Bangladesh-only address results.
- Road-number-aware address search with normalized query fallbacks, multiple result choices, and immediate zoom appropriate to roads, neighbourhoods, cities, or districts.
- One shared set of 11 civic categories across Gemini, report creation, public filters, map filters, backend validation, and routing queues. It includes fire, gas leakage, road damage, flooding, water/sewer, electrical hazards, waste, and public safety.
- Balanced typography, spacing, statistics, map controls, and desktop navigation so the interface is neither oversized nor difficult to read.
- Immediate public landing-page rendering without waiting for report and statistics requests.
- Cached public reports are restored before the live refresh, so repeat visits remain useful during a slow connection or service wake-up.
- Cache-first application-shell and hashed-asset loading for repeat visits, with background refresh and safe API exclusions.
- Long-lived immutable HTTP caching for fingerprinted production assets, while the service worker and HTML remain update-safe.
- One-time migration tracking through `civicguardian_migrations`, avoiding repeated schema work on every server cold start.

## Data migration

`db/migrations/002_trusted_resolution.sql` adds resolution proof, follows, resolution feedback, notification preferences, moderation state, and query indexes. It uses idempotent statements and preserves existing users and reports. Successful migration filenames are now tracked so each file runs only once.

## Verification

- `npm run lint`: passed
- `npm test`: 6 files, 14 tests passed
- `npm run build`: passed
- Service-worker JavaScript syntax check: passed.
- Runtime smoke checks: public health, issues, and Bangladesh PWA manifest passed.
- Runtime smoke checks also confirmed the V12 font, theme metadata, updated PWA cache, and static application shell.
- Live geocoder check: `Road 12, Dhanmondi, Dhaka` returned two Bangladesh road results with immediate road-level zoom 17.

## Deployment

The source is deployment-ready. No authenticated Git remote is present in this workspace, so the live Render service was not changed from here. Render Free web services still display Render's own wake-up page after 15 minutes without inbound traffic; that provider-controlled first-visit delay requires an always-on instance or a separately hosted static frontend to eliminate completely.
