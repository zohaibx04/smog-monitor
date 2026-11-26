# PBL requirements audit

Reviewed on 2 November 2026 against `FINAL PBL Project Questionnaire.pdf`, `Smog_Monitoring_Alert_Phase_1_Proposal.docx`, the supplied Phase 2 report, application source, automated tests, and the running application.

## Conclusion

The application implements the five core features promised in Phase 1 using a Java backend and PostgreSQL. The verified software supports the proposed demonstration. **The complete academic submission is not yet compliant:** team size needs confirmation, Phase 1 pagination needs checking against the specified limit, Phase 2 diagrams are unfinished, and a final implementation report with screenshots is absent. This audit is evidence and a completion checklist, not a replacement for those reports or the instructor's assessment.

## Questionnaire requirements

| Requirement | Finding and evidence | Status |
|---|---|---|
| Select an offered real-world problem | The proposal selects problem 5, Proactive Real-Time Smog Level Monitoring and Alert System. No alternative-topic approval is needed. | Met |
| Team of 4–5 members | Phase 1 lists Syeda Momina Sherazi (534663), Zohaib Ali (534742), and Muqaddus Habib (534702): three members. No instructor exception was supplied. | Needs team/instructor confirmation |
| Phase 1 problem background, importance, statement, stakeholders | Sections 1.1–1.4 contain all four items. | Met in proposal |
| Proposed software solution | Section 2 defines a responsive web app, Java service, provider, storage, and information flow. | Met in proposal and app |
| Five explained features and practical outcomes | Sections 2.3 and 3 define the five features and demonstration outcomes, mapped below. | Met |
| Team roles, CMS IDs, responsibilities | Section 5 supplies names, IDs, and responsibilities for the three listed members. This does not resolve the separate team-size requirement. | Content present |
| Gantt chart covering three phases | Section 6 supplies work periods and submission milestones; section 7 explains deadlines. | Met in proposal |
| Phase 1 report of 4–5 pages | Word's saved document metadata reports **6 pages**. This is a warning, not a fresh rendering measurement. Confirm the current Word/PDF page count and reduce to 4–5 pages or obtain an explicit exception. | Needs pagination correction/verification |
| Phase 2 tools and technologies | Section 3 exists. Update actual tools: React/TypeScript/Vite frontend, inline SVG charts, Spring Boot/Java, PostgreSQL 18.6, token-protected administration. pgAdmin is optional; project setup uses command-line tools. | Needs final implementation alignment |
| Main UML use case diagram and five use cases | Five use case specifications exist, but section 5 says to insert the diagram. | Diagram missing |
| UML class diagrams | Section 7 lists planned classes and relationships, but no completed diagram is supplied. Actual service is `MonitoringService`; planned service names should not be presented as implemented classes. | Diagram missing |
| Sequence diagrams for major functions | Section 8 supplies textual flows and explicitly says to convert them into five UML sequence diagrams. | Diagrams missing |
| Deployment diagram | Section 9 describes nodes without a finished UML deployment diagram. Show browser → Vite/proxy :5173 → Java :8080 → PostgreSQL :5432, plus external Open-Meteo HTTPS calls. | Diagram missing |
| Java implementation | Spring Boot controllers, services, entities, repositories, validation, alert logic, and persistence are Java. React/TypeScript supplies the browser interface. | Met |
| Working demonstration of all five features | Functional paths exist; test and UI evidence appear below. Delivery of the demonstration to the instructor remains a team activity. | Software ready; presentation pending |
| Final implementation report explaining five features with screenshots | No final implementation report exists in the supplied project. Existing README and verification notes do not fulfill this deliverable by themselves. | Missing |
| Installation/setup/run manual within final report | README and POSTGRESQL.md provide the instructions. Include them in condensed form inside the final report, including IDE and command-line launch paths. | Source material ready; report inclusion pending |
| Validate with test cases or sample inputs/outputs | 27 backend tests passed, including real PostgreSQL tests; frontend TypeScript and production build passed. | Met technically; include evidence in report |

Questionnaire dates: Phase 1 due 29 October 2026; Phase 2 and Phase 3 due 3 December 2026. This review does not establish that any report has been submitted.

## Phase 1 software traceability

| Feature or constraint | Implementation | Verification |
|---|---|---|
| Current dashboard with AQI/category, PM2.5, PM10, location/source/time | `Dashboard.tsx`, `ApiController`, `MonitoringService` | UI displayed Berlin AQI 53 with coordinates, source and timestamp; switching to saved Islamabad showed AQI 132 and Islamabad coordinates. These are time-specific observed values, not fixed test fixtures. |
| Configurable area selection and comparison | Dashboard selector, Areas checkboxes, worldwide search, exact coordinates, administrator CRUD | Two selected locations appeared with their own AQI/pollutants, timestamp and source. Tests cover valid/invalid location requests and authorization. |
| Per-location indicator threshold and in-app alerts | Explicitly labelled **US AQI** threshold, preferences, crossing evaluation, alert history and acknowledgement | Automated tests cover initial exceedance, equality/recovery, repeat suppression, stale/future/null values, delayed-refresh crossings, acknowledgement and resolution. Phase 2 explicitly models an AQI threshold; selectable PM thresholds are not promised. |
| Timestamped history, period selection and summaries | PostgreSQL readings; selected-area range endpoint; AQI/PM2.5/PM10 chart, average/peak/lowest/count, CSV | UI switched from 24 readings to 168 on the seven-day PM2.5 view. API tests prove location and time-range isolation. |
| Authorized location and rule administration; missing/outdated inspection | `X-Admin-Token`, administration form, protected network rules, per-area status | API tests reject unauthorized location creation and rule creation/update/deletion, accept authorized operations, and show missing-data state. PostgreSQL test verifies dependent-record deletion. |
| Open-Meteo primary source | `/v1/air-quality`, hourly `us_aqi,pm2_5,pm10`, UTC ingestion | Source inspection and current provider-backed API results. Berlin readings are not relabelled as Pakistan readings. |
| Check a suitable Pakistan location | Saved Islamabad, Pakistan location uses latitude 33.7215, longitude 73.0433 and has live provider readings | Runtime dashboard verification. Berlin defaults remain explicitly labelled development points. |
| Honest missing/stale/unavailable handling | Null values displayed as unavailable; older-than-three-hour or future values ineligible for alerts; provider failure retains stored history | Automated tests plus source inspection. Chart lines now break across missing hours. |
| Repeatable tests; labelled samples only | Separate `smog_test` and `smog_demo`; demo banner and synthetic source | 27 passing backend tests. This audit used live mode; it did not inject synthetic data into `smog_db`. |
| Responsive phone/computer interface | Responsive CSS breakpoints, mobile navigation and wrapping forms | Implementation inspected and desktop UI controls checked. A fresh mobile visual check remains advisable; no claim of a new mobile screenshot verification is made. |
| Informational scope | Model-estimate labels and informational notice | No hardware, ML, prediction, SMS/email/push or official-warning service was added. Account registration is not a Phase 1 requirement; user preferences are shared. |

“Real-time” in this prototype means current available hourly provider estimates: the backend checks every 15 minutes and the browser polls every 60 seconds. It is not second-by-second sensor streaming, which Phase 1 does not promise.

## Corrections made during this audit

1. A delayed refresh now evaluates all eligible recent readings in timestamp order. A recovery followed by a new exceedance can no longer be lost by evaluating only the latest reading.
2. Recovery resolves an acknowledged alert episode as well as an active one. Rule changes/removal also close either unresolved state.
3. A late acknowledgement request cannot change an already resolved alert back to acknowledged.
4. History lines break across missing hourly intervals rather than visually suggesting uninterrupted measurements.
5. Area cards and comparison rows now include each reading's source alongside its timestamp.

Tests added for delayed refresh, acknowledged recovery, resolved-alert acknowledgement, and location/time-isolated history. Result: **27 tests, zero failures, errors, or skips**. The frontend's TypeScript check and Vite production build also passed. The backend was restarted with the corrections and the updated frontend was checked through the browser.

## Five-outcome demonstration checklist

1. **Reading metadata:** open Dashboard, select a location, identify coordinates, source, timestamp, US AQI/category, PM2.5 and PM10. Explain model estimates and freshness.
2. **Location changes:** change to another location, verify name/coordinates/values change, then compare two locations in Areas.
3. **Threshold alert:** use the separate demo database for a controlled presentation or show the automated crossing test. In demo mode, save a threshold below a fresh synthetic AQI, show the labelled in-app alert, acknowledge it, and explain duplicate suppression and recovery. Do not claim this is a live provider event.
4. **History:** select a location and seven-day period, switch AQI to PM2.5/PM10, explain summary values and missing gaps, and export CSV. Longer periods only include accumulated records.
5. **Administration:** demonstrate that a mutation without the token fails; with the token, create or update a demonstration location and network rule, then inspect freshness. Use `smog_demo` for disposable presentation records.

Run regression checks with `pwsh -File scripts/backend.ps1 -Test`; run `npm run build` inside `Air Quality Monitoring Dashboard`. Logs from this audit are in `.run/requirements-tests.log`. For startup, database connections and backups, use README.md and POSTGRESQL.md.

## Submission completion order

1. Confirm a permitted team size with the instructor or provide the additional genuine team member(s) and responsibilities. Do not invent members or an approval.
2. Verify Phase 1's rendered page count and fit the complete content into the required 4–5 pages.
3. Replace Phase 2's diagram placeholders with actual UML use case, class, sequence and deployment diagrams; align their names and flows with the implemented system.
4. Assemble the Phase 3 report with screenshots of all five screens, setup/user-manual instructions, concrete tests/results, limitations and the demonstration checklist.
5. Capture desktop and phone-size screenshots of the final build and rehearse the demo. Browser screenshot capture was unavailable during this audit; accessibility-state checks succeeded, but new screenshots were not produced.
