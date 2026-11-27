import { type ReactNode } from "react"
export { default } from './Dashboard'

export type Page =
  | "dashboard"
  | "forecast"
  | "usaqi"
  | "pm25"
  | "pm10"
  | "gases"
  | "rankings"
  | "global-rankings"
  | "map"
  | "areas"
  | "add-location"
  | "alerts"
  | "admin"
  | "admin-overview"
  | "admin-catalog"
  | "admin-users"
  | "admin-advisories"
  | "admin-health"
export type NavGroup = "Overview" | "Pollutants" | "Network" | "Admin" | "System"
export type IconName =
  | "grid"
  | "pin"
  | "bell"
  | "chart"
  | "settings"
  | "search"
  | "chevron"
  | "chevronDown"
  | "wind"
  | "droplet"
  | "clock"
  | "database"
  | "arrowUp"
  | "arrowDown"
  | "activity"
  | "warning"
  | "check"
  | "plus"
  | "trash"
  | "menu"
  | "close"
  | "filter"
  | "download"
  | "more"
  | "shield"
  | "sliders"
  | "cloud"
  | "refresh"
  | "info"
  | "map"
  | "list"
  | "layers"
  | "sun"
  | "moon"
  | "globe"
  | "user"
  | "logOut"
  | "mail"

const iconPaths: Record<IconName, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="m7 16 4-5 3 3 5-7" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08a1.7 1.7 0 0 0-1.04-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  wind: (
    <>
      <path d="M3 8h11a3 3 0 1 0-3-3" />
      <path d="M3 12h16a2 2 0 1 1-2 2" />
      <path d="M3 16h8a2 2 0 1 1-2 2" />
    </>
  ),
  droplet: <path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),
  arrowUp: (
    <>
      <path d="m18 15-6-6-6 6" />
      <path d="M12 9v10" />
    </>
  ),
  arrowDown: (
    <>
      <path d="m6 9 6 6 6-6" />
      <path d="M12 5v10" />
    </>
  ),
  activity: <path d="M3 12h4l2-7 4 14 2-7h6" />,
  warning: (
    <>
      <path d="M10.3 3.6 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="m9 7 1-3h4l1 3M6 7l1 14h10l1-14" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  filter: <path d="M4 5h16l-6 7v6l-4 2v-8Z" />,
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h7M15 6h5M4 12h2M10 12h10M4 18h10M18 18h2" />
      <circle cx="13" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </>
  ),
  cloud: (
    <path d="M17.5 19H7a5 5 0 1 1 1.7-9.7A6 6 0 0 1 20 12a3.5 3.5 0 0 1-2.5 7Z" />
  ),
  refresh: (
    <>
      <path d="M20 7h-5V2" />
      <path d="M20 7a9 9 0 1 0 1 8" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  map: (
    <>
      <path d="M3 6 9 3l6 3 6-3v15l-6 3-6-3-6 3V6Z" />
      <path d="M9 3v15" />
      <path d="M15 6v15" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </>
  ),
  layers: (
    <>
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </>
  ),
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a13.5 13.5 0 0 1 0 18" />
      <path d="M12 3a13.5 13.5 0 0 0 0 18" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  logOut: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
}

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  )
}

export const navGroups: NavGroup[] = ["Overview", "Pollutants", "Network", "Admin", "System"]

export const navItems: { id: Page; label: string; icon: IconName; group: NavGroup }[] = [
  { id: "dashboard", label: "Smog overview", icon: "grid", group: "Overview" },
  { id: "forecast", label: "Forecast & health", icon: "activity", group: "Overview" },
  { id: "rankings", label: "City rankings", icon: "list", group: "Overview" },
  { id: "global-rankings", label: "Global rankings", icon: "globe", group: "Overview" },
  { id: "map", label: "Smog map", icon: "map", group: "Overview" },
  { id: "usaqi", label: "US AQI", icon: "activity", group: "Pollutants" },
  { id: "pm25", label: "PM2.5", icon: "droplet", group: "Pollutants" },
  { id: "pm10", label: "PM10", icon: "layers", group: "Pollutants" },
  { id: "gases", label: "Gases & weather", icon: "cloud", group: "Pollutants" },
  { id: "areas", label: "Compare locations", icon: "pin", group: "Network" },
  { id: "add-location", label: "My locations", icon: "plus", group: "Network" },
  { id: "alerts", label: "Smog alerts", icon: "bell", group: "Network" },
  { id: "admin-overview", label: "Admin overview", icon: "shield", group: "Admin" },
  { id: "admin-catalog", label: "Global catalog", icon: "database", group: "Admin" },
  { id: "admin-users", label: "Users & roles", icon: "user", group: "Admin" },
  { id: "admin-advisories", label: "Advisories & rules", icon: "mail", group: "Admin" },
  { id: "admin-health", label: "Network health", icon: "sliders", group: "Admin" },
  { id: "admin", label: "Administration", icon: "settings", group: "System" },
]
