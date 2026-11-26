$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
if(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue){throw 'Stop the backend before migrating.'}
$pg=Get-Content (Join-Path $projectRoot '.run/postgresql.json') -Raw | ConvertFrom-Json
& (Join-Path $PSScriptRoot 'postgres.ps1') -Action Start
$source=Join-Path $projectRoot 'backend/data/smog'
$backupDir=Join-Path $projectRoot '.run/backups'
New-Item -ItemType Directory -Force $backupDir | Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item -LiteralPath "$source.mv.db" -Destination (Join-Path $backupDir "smog-before-postgresql-$stamp.mv.db")
$java=if($env:JAVA_HOME){Join-Path $env:JAVA_HOME 'bin/java.exe'}else{
    $idea=Get-ChildItem 'C:/Program Files/JetBrains' -Directory -Filter 'IntelliJ IDEA*' | Sort-Object Name -Descending | Select-Object -First 1
    Join-Path $idea.FullName 'jbr/bin/java.exe'
}
$h2=Get-ChildItem (Join-Path $projectRoot '.m2-repository/com/h2database/h2') -Recurse -Filter 'h2-*.jar' | Select-Object -First 1
$driver=Get-ChildItem (Join-Path $projectRoot '.m2-repository/org/postgresql/postgresql') -Recurse -Filter 'postgresql-*.jar' | Select-Object -First 1
$previous=@($env:DB_URL,$env:DB_USER,$env:DB_PASSWORD)
try {
    $env:DB_URL="jdbc:postgresql://$($pg.Host):$($pg.Port)/$($pg.Database)"
    $env:DB_USER=$pg.Username
    $env:DB_PASSWORD=[Net.NetworkCredential]::new('',(ConvertTo-SecureString $pg.Password)).Password
    & $java -cp "$($h2.FullName);$($driver.FullName)" (Join-Path $PSScriptRoot 'MigrateH2ToPostgres.java') $source | Tee-Object -FilePath (Join-Path $backupDir "migration-$stamp.txt")
    if($LASTEXITCODE -ne 0){throw 'Migration failed; source backup retained.'}
} finally {$env:DB_URL=$previous[0];$env:DB_USER=$previous[1];$env:DB_PASSWORD=$previous[2]}
