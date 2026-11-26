param([ValidateSet('Setup','Start','Stop','Status','Backup')][string]$Action='Start')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$pgBase=Join-Path $projectRoot '.tools/postgres/pgsql'
$pgBin=Join-Path $pgBase 'bin'
$pgData=Join-Path $projectRoot '.run/postgresql/data'
$configFile=Join-Path $projectRoot '.run/postgresql.json'
$runDir=Join-Path $projectRoot '.run'
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
function Invoke-PgTool([string]$Name,[string[]]$Arguments) {
    & (Join-Path $pgBin $Name) @Arguments
    if($LASTEXITCODE -ne 0){throw "$Name failed (exit $LASTEXITCODE)."}
}
function Decode-Secret([string]$Value) { [Net.NetworkCredential]::new('',(ConvertTo-SecureString $Value)).Password }
if(-not (Test-Path (Join-Path $pgBin 'pg_ctl.exe'))) {throw 'PostgreSQL binaries are missing. See POSTGRESQL.md for installation instructions.'}

if($Action -eq 'Setup') {
    if(-not (Test-Path $configFile)) {
        $appPassword=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
        $adminPassword=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
        @{
            Host='127.0.0.1'; Port=5432; Database='smog_db'; Username='aeris';
            Password=($appPassword | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString);
            AdminPassword=($adminPassword | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString)
        } | ConvertTo-Json | Set-Content -LiteralPath $configFile
    }
    $config=Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
    if(-not (Test-Path (Join-Path $pgData 'PG_VERSION'))) {
        New-Item -ItemType Directory -Force -Path (Split-Path $pgData -Parent) | Out-Null
        $passwordFile=Join-Path $runDir 'postgres-init-password.tmp'
        try {
            Decode-Secret $config.AdminPassword | Set-Content -LiteralPath $passwordFile -NoNewline
            Invoke-PgTool 'initdb.exe' @('-D',$pgData,'-U','postgres','--encoding=UTF8','--locale=C','--auth=scram-sha-256',"--pwfile=$passwordFile")
        } finally {if(Test-Path -LiteralPath $passwordFile){Remove-Item -LiteralPath $passwordFile}}
        @"
listen_addresses = '127.0.0.1'
port = $($config.Port)
password_encryption = 'scram-sha-256'
timezone = 'UTC'
"@ | Add-Content -LiteralPath (Join-Path $pgData 'postgresql.conf')
    }
}
if(-not (Test-Path -LiteralPath $configFile)){throw 'Run scripts/postgres.ps1 -Action Setup first.'}
$config=Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
$connection=@('-h',$config.Host,'-p',"$($config.Port)")
if($Action -in @('Setup','Start','Backup')) {
    & (Join-Path $pgBin 'pg_ctl.exe') status -D $pgData *> $null
    if($LASTEXITCODE -ne 0) {
        Invoke-PgTool 'pg_ctl.exe' @('start','-D',$pgData,'-l',(Join-Path $runDir 'postgresql.log'),'-w','-t','30')
    }
}
if($Action -eq 'Setup') {
    $previousPassword=$env:PGPASSWORD
    try {
        $env:PGPASSWORD=Decode-Secret $config.AdminPassword
        $role= & (Join-Path $pgBin 'psql.exe') @connection -U postgres -d postgres -At -c "SELECT 1 FROM pg_roles WHERE rolname='aeris'"
        if($LASTEXITCODE -ne 0){throw 'Could not inspect database roles.'}
        if($role -ne '1') {
            $roleFile=Join-Path $runDir 'create-role.tmp.sql'
            try {
                $appPassword=Decode-Secret $config.Password
                "CREATE ROLE aeris LOGIN PASSWORD '$appPassword' NOSUPERUSER NOCREATEDB NOCREATEROLE;" | Set-Content -LiteralPath $roleFile
                Invoke-PgTool 'psql.exe' ($connection+@('-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f',$roleFile))
            } finally {if(Test-Path -LiteralPath $roleFile){Remove-Item -LiteralPath $roleFile}}
        }
        foreach($database in @('smog_db','smog_test','smog_demo')) {
            $exists= & (Join-Path $pgBin 'psql.exe') @connection -U postgres -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname='$database'"
            if($LASTEXITCODE -ne 0){throw 'Could not inspect database list.'}
            if($exists -ne '1'){Invoke-PgTool 'createdb.exe' ($connection+@('-U','postgres','--owner=aeris',$database))}
            $env:PGPASSWORD=Decode-Secret $config.Password
            Invoke-PgTool 'psql.exe' ($connection+@('-U','aeris','-d',$database,'-v','ON_ERROR_STOP=1','-f',(Join-Path $projectRoot 'database/postgresql/schema.sql')))
            $env:PGPASSWORD=Decode-Secret $config.AdminPassword
        }
        Write-Host 'PostgreSQL is ready: smog_db (app), smog_test (tests), smog_demo (demo).'
    } finally {$env:PGPASSWORD=$previousPassword}
} elseif($Action -eq 'Stop') {
    Invoke-PgTool 'pg_ctl.exe' @('stop','-D',$pgData,'-m','fast','-w','-t','30')
} elseif($Action -eq 'Status') {
    Invoke-PgTool 'pg_ctl.exe' @('status','-D',$pgData)
} elseif($Action -eq 'Backup') {
    $backupDir=Join-Path $runDir 'backups';New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    $backupFile=Join-Path $backupDir ('smog-postgresql-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.dump')
    $previousPassword=$env:PGPASSWORD
    try {
        $env:PGPASSWORD=Decode-Secret $config.Password
        Invoke-PgTool 'pg_dump.exe' ($connection+@('-U','aeris','-d','smog_db','-Fc','-f',$backupFile))
        Write-Host "Database backup: $backupFile"
    } finally {$env:PGPASSWORD=$previousPassword}
}
