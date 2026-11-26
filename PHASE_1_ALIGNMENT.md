# Phase 1 implementation alignment

Source: `Smog_Monitoring_Alert_Phase_1_Proposal.docx`, sections 2–4.

For the complete questionnaire audit, including report/team requirements and remaining submission work, see `PBL_REQUIREMENTS_AUDIT.md`. The five implemented features do not by themselves establish full academic submission compliance.

## Data source and locations

The application requests **Open-Meteo Air Quality API** data from `https://air-quality-api.open-meteo.com/v1/air-quality`, the endpoint named in Phase 1. It reads hourly `us_aqi`, `pm2_5`, and `pm10` for configured coordinates. Values come from the provider; city names do not supply or determine AQI values.

Phase 1 names Berlin as an allowable development location but supplies neither a fixed AQI value nor an exact coordinate pair. Following the user's correction, the implementation now uses these explicitly chosen development coordinates:

| Test point | Latitude | Longitude |
|---|---:|---:|
| Berlin — Central test point | 52.52 | 13.41 |
| Berlin — West test point | 52.52 | 13.21 |
| Berlin — East test point | 52.52 | 13.61 |

These are startup defaults, not a restriction on coverage. **Areas and Administration provide worldwide location search** through Open-Meteo's geocoding API. Any returned place can be previewed with live AQI/PM2.5/PM10 and accurate source/time labels. Exact latitude/longitude entry supports places outside the named-location catalog. Search returns up to 20 matches at a time; the query and optional country code refine the results. Provider coverage and availability still determine whether a reading exists.

The central coordinate is the development reference. West and east points provide a small configurable comparison set, not claimed physical stations. The provider may return the same estimate for nearby points. Administrators can save any discovered location to the network, or add coordinates manually, then edit, pause, or remove locations. Read-only worldwide previews do not silently add locations or alter the stored network. This retains Phase 1's small selected monitoring set while making worldwide coverage accessible.

The report does not mandate a US or European index. The implementation explicitly uses Open-Meteo's **US AQI** field and labels its categories and thresholds accordingly, including in Berlin. It never interprets a European AQI number using US AQI categories.

The original automatically seeded Pakistan locations are archived by exact name and coordinates. Their original readings remain attached to their original locations and are excluded from the current monitoring network. No old AQI values are copied to Berlin. Custom locations are preserved.

## Five required features

| Phase 1 requirement | Implementation |
|---|---|
| Current air-quality dashboard | Select location; display provider AQI, category, PM2.5, PM10, source, timestamp, and missing/stale state. |
| Area-based monitoring | Search locations worldwide or enter coordinates, preview available air quality, and compare a selected set of saved locations; administrators configure coverage. |
| Configurable smog alerts | Save per-location AQI thresholds; fresh readings trigger an in-app alert episode; repeated high readings do not duplicate it; recovery resolves it. |
| Historical trends and summaries | Persist timestamped readings; select location, period and AQI/PM2.5/PM10; show real summary values and export CSV. |
| Basic monitoring and rule administration | Require the administrator token for location changes and creation, editing, or deletion of network-wide threshold rules. Inspect freshness and provider failures for every area. |

## Data integrity and scope

- Live results are labelled Open-Meteo/CAMS model estimates with their true location and timestamp.
- Future forecast values are excluded from current/history views; unavailable or negative values are not shown as zero.
- Provider failures retain the last stored reading with a visible warning. Readings older than three hours cannot generate alerts.
- Demo mode is opt-in and clearly labels every synthetic reading. Live and demo queries use distinct source values.
- This is an informational Java web prototype. It includes no sensors, machine learning, smog prediction, SMS, email, or official warning service.
- Alert preferences remain a shared prototype workspace; account registration was not a Phase 1 requirement. Protected administrator rules are separate from user preferences.

## Verification

Automated tests cover worldwide search responses and country filters, coordinate validation, preview exclusion of future/missing values, Berlin defaults, preservation of archived readings, authorization for all rule mutations, invalid input, threshold crossing/recovery, duplicate prevention, stale/future/missing readings, and stored-history retrieval. Run `pwsh -File scripts/backend.ps1 -Test` and `npm run build` in the frontend directory.

Provider documentation: [Air Quality API](https://open-meteo.com/en/docs/air-quality-api), [worldwide location search](https://open-meteo.com/en/docs/geocoding-api).
