# Proactive Real-Time Smog Level Monitoring and Alert System

A Spring Boot, PostgreSQL, and React application for monitoring particulate estimates in Pakistani cities and issuing in-app US AQI threshold alerts.

## Run locally

Requires Java 17 or later, Maven 3.6.3 or later, Node.js 22.12 or later, and PostgreSQL. The Windows launcher can use the Java and Maven bundled with IntelliJ IDEA.

From the project directory, configure PostgreSQL on the first run. See [PostgreSQL setup](POSTGRESQL.md) for installation and connection options.

```powershell
pwsh -File scripts/postgres.ps1 -Action Setup
```

Start the backend and frontend in separate PowerShell terminals.

```powershell
pwsh -File scripts/backend.ps1
pwsh -File scripts/frontend.ps1
```

Open http://localhost:5173. The frontend forwards API requests to the Java service on port 8080. The first provider check starts a few seconds after startup. Select **Refresh data** to request another check.

For administration, enter the token generated in `.run/admin-token.txt` or provide `ADMIN_TOKEN` in the backend environment. Credentials belong in the backend environment or ignored `.run` files.

## Five core features

| Feature | Workflow |
|---|---|
| Smog dashboard | Select a location and inspect US AQI, PM2.5, PM10, timestamp, source, freshness, and enabled alert rules. |
| Area monitoring | Search and compare saved locations. Use **Add Location** to find a city or enter coordinates without an administrator token. Karachi, Lahore, Islamabad, Peshawar, and Quetta are seeded by default. |
| In-app alerts | Create a per-location US AQI threshold. An above-threshold episode stays open until a fresh value returns to the threshold or lower. Alerts can be acknowledged while active. |
| Historical trends | Select a location, time range, and indicator. Inspect points, check summary statistics, or export the stored data as CSV. |
| Administration | Add, edit, pause, or remove monitoring locations and manage protected network rules. Data status shows unavailable or stale readings. |

Locations added through the public tab are shared across the prototype. Administrator authorization protects location edits, pausing, removal, and network-wide alert rules. The dashboard, history, and alert rules use Open-Meteo / CAMS model estimates for US AQI, PM2.5, and PM10. City search uses Open-Meteo Geocoding with location data from GeoNames.

The **Smog Map** plots those same saved locations on a MapLibre basemap from OpenFreeMap. Place labels use available English names or Latin-script names. Use **Zoom to monitored locations** or choose a city from the map selector, then open its dashboard from the marker popup.

## Data handling

- Open-Meteo supplies hourly US AQI, PM2.5, and PM10 model estimates for each area's coordinates. The application checks the provider every 15 minutes and excludes future timestamps.
- A first successful refresh can backfill up to seven days of model estimates. Longer histories accumulate in PostgreSQL. Missing fields appear as unavailable.
- A provider failure preserves stored readings and shows its status. Readings older than three hours cannot trigger a new alert.
- Configuring a rule against a fresh reading that is already above its threshold can open an episode immediately. Repeated high readings do not open additional alerts for that rule.

## Demonstrate a threshold crossing

Start the backend with `pwsh -File scripts/backend.ps1 -Demo` and start the frontend normally. The launcher selects the separate `smog_demo` PostgreSQL database when using the bundled configuration. If you configure a custom database URL, point demo mode to a dedicated demo database. The dashboard labels the source and all generated readings as synthetic.

1. Choose a location with its default threshold of 150. If it was changed, check or update the shared rule in **Administration**.
2. In the dashboard demo form, submit **120**, **175**, **185**, then **110**. The reading at 175 opens an alert. The reading at 185 keeps the same episode open. The reading at 110 resolves it.
3. Check **Alerts**, compare two cities in **Areas**, and use **History & Trends** to inspect and export the readings.

## Verification

```powershell
pwsh -File scripts/backend.ps1 -Test
Set-Location 'Air Quality Monitoring Dashboard'
npm run build
```

See the [Open-Meteo Air Quality API documentation](https://open-meteo.com/en/docs/air-quality-api) for the model data and [CAMS](https://atmosphere.copernicus.eu/) for the underlying air-quality forecasts.

