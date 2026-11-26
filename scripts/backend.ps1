param([switch]$Demo, [switch]$Test)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
# Use Windows' existing trusted certificate roots, including locally managed roots.
$env:JAVA_TOOL_OPTIONS = "$($env:JAVA_TOOL_OPTIONS) -Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE".Trim()
$mavenCommand = Get-Command mvn.cmd -ErrorAction SilentlyContinue
if ($mavenCommand) { $mavenPath = $mavenCommand.Source }
else {
    $idea = Get-ChildItem 'C:/Program Files/JetBrains' -Directory -Filter 'IntelliJ IDEA*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($idea) {
        $mavenPath = Join-Path $idea.FullName 'plugins/maven-plugin/lib/maven3/bin/mvn.cmd'
        if (-not $env:JAVA_HOME) { $env:JAVA_HOME = Join-Path $idea.FullName 'jbr' }
    }
}
if (-not $mavenPath -or -not (Test-Path -LiteralPath $mavenPath)) { throw 'Install Maven 3.6.3+ and Java 17–25, then set JAVA_HOME. See README.md.' }
$runDir = Join-Path $projectRoot '.run'
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
if (-not $env:ADMIN_TOKEN) {
    $tokenFile = Join-Path $runDir 'admin-token.txt'
    if (-not (Test-Path -LiteralPath $tokenFile)) {
        [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)) | Set-Content -LiteralPath $tokenFile -NoNewline
    }
    $env:ADMIN_TOKEN = (Get-Content -LiteralPath $tokenFile -Raw).Trim()
    Write-Host "Administrator token is saved in $tokenFile"
}
$env:DEMO_MODE = if ($Demo) { 'true' } else { 'false' }
$databaseConfig=Join-Path $runDir 'postgresql.json'
if(-not $env:DB_URL -and (Test-Path -LiteralPath $databaseConfig)) {
    & (Join-Path $PSScriptRoot 'postgres.ps1') -Action Start
    $pg=Get-Content -LiteralPath $databaseConfig -Raw | ConvertFrom-Json
    $databaseName=if($Demo){'smog_demo'}else{$pg.Database}
    $env:DB_URL="jdbc:postgresql://$($pg.Host):$($pg.Port)/$databaseName"
    $env:DB_USER=$pg.Username
    $env:DB_PASSWORD=[Net.NetworkCredential]::new('',(ConvertTo-SecureString $pg.Password)).Password
    if($Test){$env:AERIS_POSTGRES_TEST_URL="jdbc:postgresql://$($pg.Host):$($pg.Port)/smog_test"}
} elseif(-not $env:DB_URL -and -not $Test) {
    throw 'Configure PostgreSQL with scripts/postgres.ps1 -Action Setup, or supply DB_URL, DB_USER, and DB_PASSWORD. See POSTGRESQL.md.'
}
Push-Location (Join-Path $projectRoot 'backend')
try {
    if ($Test) { & $mavenPath '-Dmaven.repo.local=../.m2-repository' -s ../scripts/maven-settings.xml test }
    else { & $mavenPath '-Dmaven.repo.local=../.m2-repository' -s ../scripts/maven-settings.xml spring-boot:run }
    if ($LASTEXITCODE -ne 0) { throw "Maven failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }
