$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $projectRoot 'Air Quality Monitoring Dashboard')
try {
    $requiredPackages = @('vite', 'leaflet', 'react-leaflet', 'maplibre-gl', '@maplibre/maplibre-gl-leaflet')
    if ($requiredPackages | Where-Object { -not (Test-Path -LiteralPath "node_modules/$_/package.json") }) {
        & npm.cmd install
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    }
    & npm.cmd run dev
} finally { Pop-Location }
