# Verification — 2 November 2026

Latest requirements audit: **27 backend tests passed**, zero failures/errors/skips; frontend TypeScript and Vite production build passed. The audit fixed delayed-refresh alert crossings, acknowledged-alert recovery, late acknowledgements, history gaps and comparison source labels. See `PBL_REQUIREMENTS_AUDIT.md` for evidence and academic submission gaps; earlier counts below describe previous checkpoints.

- Frontend: TypeScript check and Vite production build passed.
- Backend after Phase 1 alignment: 20 tests passed, zero failures/errors (10 API integration tests, 4 worldwide discovery tests, and 6 alert-service tests).
- Worldwide search tests verify provider result mapping and country filters; preview tests reject future forecasts and preserve missing values. Invalid searches and coordinates are rejected before contacting a provider.
- Live verification: worldwide search returned Tokyo, Japan and its coordinates; the app preview loaded real Open-Meteo/CAMS AQI, PM2.5 and PM10 with an hourly timestamp. The Add to monitoring action prefilled the administrator form with those coordinates.
- Berlin development points successfully loaded their own provider readings after migration. The frontend and API remain available through the configured LAN address on port 5173.
- Connected API: frontend `/api/status` and `/api/areas` returned successfully through the Vite proxy.
- The original run retrieved Open-Meteo/CAMS readings for the former Pakistan defaults. Those locations are now archived without relabelling their readings; the current network uses the Berlin development points described in PHASE_1_ALIGNMENT.md.
- Browser: verified dashboard location switching, two-area comparison, seven-day history (168 readings), and AQI/PM2.5 indicator switching.
- PostgreSQL 18.6 is installed locally and is now the running application's database (`127.0.0.1:5432/smog_db`, dedicated `aeris` role). Hibernate schema validation succeeded.
- Migration copied 7 locations (including archived locations) and 1,236 readings from H2. Preferences and alerts were empty. Every table passed SHA-256 content verification before transaction commit; IDs and timestamps were preserved. Original H2 data and timestamped backups remain available.
- After the PostgreSQL change, all 23 backend tests passed with zero failures, errors, or skips. Three tests ran against real PostgreSQL: timestamp/value round trip, duplicate-reading rejection, and dependent-record deletion under foreign-key constraints.
- Live frontend proxy checks returned `/api/status` and all four active locations with current readings after PostgreSQL startup. New provider readings were successfully persisted. A PostgreSQL custom-format backup was created at `.run/backups/smog-postgresql-20261102-204550.dump`.
- The prototype uses shared user preferences and alerts; per-user accounts are not implemented. Network-wide administrator rules are separately protected for creation, editing, and deletion.

The initial 502 was caused by the backend not running during setup. Integration tests then exposed direct field access through a proxied Spring service; repositories are now injected directly into the controller. The corrected backend and frontend were started and the connection was verified.

## IQAir-style smog UI and Earth integration — 4 November 2026
- Location-led dashboard with AQI category colours, PM2.5/PM10 indicators, timestamp/source attribution, alert readiness, unresolved episodes, history chart, and recent hourly observations.
- Original IQAir Earth globe loaded in its own app tab from the public frame used by IQAir's Earth page. Full-screen mode and source navigation checked in browser. External content is not used to evaluate local alert rules.
- Frontend TypeScript and production build passed. Backend/proxied status verified live, IQAir configured, all five monitored locations returning readings.
- Existing accepted Phase 1 documents remain unchanged. Final report/diagram/distribution work remains deferred until team review, as requested.
