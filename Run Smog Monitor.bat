@echo off
setlocal EnableExtensions
cd /d "%~dp0" || exit /b 1

set "SMOG_MODE=live"
set "SMOG_BACKEND_ARGUMENT="
if /i "%~1"=="--demo" (
    set "SMOG_MODE=demo"
    set "SMOG_BACKEND_ARGUMENT=-Demo"
    shift
)
set "SMOG_OPEN_BROWSER=1"
if /i "%~1"=="--no-browser" (
    set "SMOG_OPEN_BROWSER=0"
    shift
)
if not "%~1"=="" (
    echo Usage: "%~nx0" [--demo] [--no-browser]
    exit /b 2
)

set "SMOG_PWSH="
for /f "delims=" %%P in ('where pwsh.exe 2^>nul') do if not defined SMOG_PWSH set "SMOG_PWSH=%%P"
if not defined SMOG_PWSH if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "SMOG_PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not defined SMOG_PWSH (
    for /f "delims=" %%P in ('powershell.exe -NoProfile -Command "$p = @(Get-AppxPackage -Name 'OpenAI.CodexPrimaryRuntime*')[0]; if ($p) { Join-Path $p.InstallLocation 'dependencies\native\powershell\pwsh.exe' }"') do if exist "%%P" set "SMOG_PWSH=%%P"
)
if not defined SMOG_PWSH (
    echo PowerShell 7 is required. Install it, then try again.
    goto failed
)
if not exist "scripts\backend.ps1" goto missing_scripts
if not exist "scripts\frontend.ps1" goto missing_scripts
where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo Node.js and npm are required. Install Node.js 22.12 or later.
    goto failed
)
if not defined DB_URL if not exist ".run\postgresql.json" (
    echo Set up PostgreSQL once before launching Smog Monitor:
    echo "%SMOG_PWSH%" -NoProfile -File scripts\postgres.ps1 -Action Setup
    goto failed
)

set "PORT=8080"
set "SERVER_ADDRESS=127.0.0.1"
set "SMOG_URL=http://127.0.0.1:5173"
echo Starting Smog Monitor in %SMOG_MODE% mode...

"%SMOG_PWSH%" -NoLogo -NoProfile -Command "try { $s = Invoke-RestMethod http://127.0.0.1:8080/api/status -NoProxy -TimeoutSec 2; if ($s.mode -eq $env:SMOG_MODE -and $s.source -match '^(Open-Meteo|DEMO)') { exit 0 }; Write-Host 'Port 8080 is in use by a different app or Smog Monitor mode.'; exit 2 } catch { if ($_.Exception.Response) { Write-Host 'Port 8080 is in use by another HTTP service.'; exit 2 }; exit 1 }"
if errorlevel 2 goto failed
if errorlevel 1 start "Smog Monitor Backend" "%SMOG_PWSH%" -NoLogo -NoProfile -NoExit -File "%~dp0scripts\backend.ps1" %SMOG_BACKEND_ARGUMENT%

"%SMOG_PWSH%" -NoLogo -NoProfile -Command "try { $r = Invoke-WebRequest $env:SMOG_URL -NoProxy -TimeoutSec 2; if ($r.Content -match 'Proactive Real-Time Smog Level Monitoring and Alert System') { exit 0 }; Write-Host 'Port 5173 is in use by another app.'; exit 2 } catch { if ($_.Exception.Response) { Write-Host 'Port 5173 is in use by another HTTP service.'; exit 2 }; exit 1 }"
if errorlevel 2 goto failed
if errorlevel 1 start "Smog Monitor Frontend" "%SMOG_PWSH%" -NoLogo -NoProfile -NoExit -File "%~dp0scripts\frontend.ps1"

echo Waiting for the dashboard and Java API...
"%SMOG_PWSH%" -NoLogo -NoProfile -Command "$until = [DateTime]::UtcNow.AddMinutes(2); do { try { $web = Invoke-WebRequest $env:SMOG_URL -NoProxy -TimeoutSec 2; $api = Invoke-RestMethod ($env:SMOG_URL + '/api/status') -NoProxy -TimeoutSec 2; if ($web.Content -match 'Proactive Real-Time Smog Level Monitoring and Alert System' -and $api.mode -eq $env:SMOG_MODE -and $api.source -match '^(Open-Meteo|DEMO)') { exit 0 } } catch {}; Start-Sleep -Seconds 2 } while ([DateTime]::UtcNow -lt $until); exit 1"
if errorlevel 1 (
    echo The dashboard did not become ready. Check the backend and frontend windows for details.
    goto failed
)

echo Smog Monitor is ready at %SMOG_URL%.
if "%SMOG_OPEN_BROWSER%"=="1" start "" "%SMOG_URL%/"
exit /b 0

:missing_scripts
echo Keep this launcher in the PBL folder next to the scripts directory.
:failed
pause
exit /b 1
