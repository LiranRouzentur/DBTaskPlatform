
$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $projectRoot

$composeProject = 'taskplatform'
$scriptStart = Get-Date

function Write-Banner {
    param([int]$Step, [int]$Total, [string]$Title)
    Write-Host ''
    Write-Host ('==[ {0}/{1} ]== {2}' -f $Step, $Total, $Title) -ForegroundColor Cyan
}

function Write-Info { param([string]$Message) Write-Host ('   {0}' -f $Message) -ForegroundColor Gray }
function Write-Ok   { param([string]$Message) Write-Host ('   OK  {0}' -f $Message) -ForegroundColor Green }
function Write-Fail { param([string]$Message) Write-Host ('   FAIL {0}' -f $Message) -ForegroundColor Red }
function Get-Elapsed { param([DateTime]$Since) [Math]::Round(((Get-Date) - $Since).TotalSeconds, 1) }

function Remove-PathIfExists {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path) {
        try {
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
            Write-Info ('  removed {0}' -f $Path)
        } catch {
            Write-Info ('  could not remove {0}: {1}' -f $Path, $_.Exception.Message)
        }
    }
}

$totalSteps = 8

Write-Host ''
Write-Host '#############################################################' -ForegroundColor Cyan
Write-Host '#  Task-Management Platform - fresh-start spinup            #' -ForegroundColor Cyan
Write-Host '#############################################################' -ForegroundColor Cyan
Write-Info ('Project root : {0}' -f $projectRoot)
Write-Info ('Compose name : {0}' -f $composeProject)
Write-Info ('Started      : {0}' -f $scriptStart.ToString('yyyy-MM-dd HH:mm:ss'))

Write-Banner -Step 1 -Total $totalSteps -Title 'Docker Desktop check'
$stepStart = Get-Date

$dockerCli = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCli) {
    Write-Fail 'docker CLI not on PATH. Install Docker Desktop and try again.'
    exit 1
}
Write-Info ('docker CLI : {0}' -f $dockerCli.Path)

$dockerInfoOk = $false
try { docker info *> $null; if ($LASTEXITCODE -eq 0) { $dockerInfoOk = $true } } catch {}

if (-not $dockerInfoOk) {
    $dockerExe = "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (-not (Test-Path $dockerExe)) {
        Write-Fail "Docker Desktop binary not found at $dockerExe"
        exit 1
    }
    Write-Info 'Docker daemon unreachable. Starting Docker Desktop...'
    Start-Process -FilePath $dockerExe | Out-Null

    $deadline = (Get-Date).AddSeconds(180)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 3
        try { docker info *> $null; if ($LASTEXITCODE -eq 0) { $dockerInfoOk = $true; break } } catch {}
        Write-Info '  waiting for Docker daemon...'
    }
    if (-not $dockerInfoOk) {
        Write-Fail 'Docker Desktop did not become ready within 3 minutes.'
        exit 1
    }
}
Write-Ok ('Docker daemon ready ({0}s)' -f (Get-Elapsed -Since $stepStart))

Write-Banner -Step 2 -Total $totalSteps -Title 'Tear down containers + SQL volume + locally-built images'
$stepStart = Get-Date
$prevPref = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    docker compose -p $composeProject down -v --rmi local --remove-orphans
} finally {
    $ErrorActionPreference = $prevPref
}
if ($LASTEXITCODE -ne 0) {
    Write-Info ('docker compose down exited {0} (no-op on first run is fine)' -f $LASTEXITCODE)
}
Write-Ok ('Containers + volume + local images removed ({0}s)' -f (Get-Elapsed -Since $stepStart))

Write-Banner -Step 3 -Total $totalSteps -Title 'Wipe build caches (.NET bin/obj + Angular dist/.angular/node_modules)'
$stepStart = Get-Date

Get-ChildItem -Path (Join-Path $projectRoot 'server') -Directory -Recurse -Force -ErrorAction SilentlyContinue `
    | Where-Object { $_.Name -in @('bin', 'obj') } `
    | ForEach-Object { Remove-PathIfExists -Path $_.FullName }

Remove-PathIfExists -Path (Join-Path $projectRoot 'client\dist')
Remove-PathIfExists -Path (Join-Path $projectRoot 'client\.angular')
Remove-PathIfExists -Path (Join-Path $projectRoot 'client\.nx')

Write-Ok ('Caches wiped ({0}s)' -f (Get-Elapsed -Since $stepStart))

Write-Banner -Step 4 -Total $totalSteps -Title 'Frontend dependencies (npm install if needed)'
$stepStart = Get-Date
Push-Location (Join-Path $projectRoot 'client')
try {
    if (Test-Path 'node_modules') {
        Write-Info 'node_modules present - skipping npm install'
    } else {
        Write-Info 'node_modules missing - installing...'
        if (Test-Path 'package-lock.json') { npm ci } else { npm install }
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
    }
} finally { Pop-Location }
Write-Ok ('Frontend deps ready ({0}s)' -f (Get-Elapsed -Since $stepStart))

Write-Banner -Step 5 -Total $totalSteps -Title '.NET build (server/TaskPlatform.slnx)'
$stepStart = Get-Date
dotnet build (Join-Path $projectRoot 'server\TaskPlatform.slnx') -c Release --nologo
if ($LASTEXITCODE -ne 0) { Write-Fail '.NET build failed'; exit 1 }
Write-Ok ('.NET build complete ({0}s)' -f (Get-Elapsed -Since $stepStart))

Write-Banner -Step 6 -Total $totalSteps -Title 'Angular build (client/)'
$stepStart = Get-Date
Push-Location (Join-Path $projectRoot 'client')
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Angular build failed' }
} finally { Pop-Location }
Write-Ok ('Angular build complete ({0}s)' -f (Get-Elapsed -Since $stepStart))

Write-Banner -Step 7 -Total $totalSteps -Title 'docker compose build --no-cache + up'
$stepStart = Get-Date

docker compose -p $composeProject build --no-cache --pull
if ($LASTEXITCODE -ne 0) { Write-Fail 'docker compose build failed'; exit 1 }
docker compose -p $composeProject up -d --force-recreate
if ($LASTEXITCODE -ne 0) { Write-Fail 'docker compose up failed'; exit 1 }
Write-Ok ('Containers built + started ({0}s)' -f (Get-Elapsed -Since $stepStart))

Write-Banner -Step 8 -Total $totalSteps -Title 'Wait for API health'
$stepStart = Get-Date
$healthUrl = 'http://localhost:5028/health'
$healthDeadline = (Get-Date).AddSeconds(180)
$healthOk = $false
while ((Get-Date) -lt $healthDeadline) {
    try {
        $resp = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 3 -UseBasicParsing
        if ($resp.StatusCode -eq 200) { $healthOk = $true; break }
    } catch {}
    Start-Sleep -Seconds 3
    Write-Info '  waiting for /health...'
}
if (-not $healthOk) {
    Write-Fail 'API /health did not return 200 within 3 minutes.'
    Write-Info 'See container logs: docker compose -p taskplatform logs api'
    exit 1
}
Write-Ok ('API healthy ({0}s)' -f (Get-Elapsed -Since $stepStart))

$totalSeconds = (Get-Elapsed -Since $scriptStart)
Write-Host ''
Write-Host '  Frontend  : http://localhost:4200'           -ForegroundColor Green
Write-Host '  API       : http://localhost:5028'           -ForegroundColor Green
Write-Host '  API health: http://localhost:5028/health'    -ForegroundColor Green
Write-Host '  Swagger   : http://localhost:5028/scalar/v1' -ForegroundColor Green
Write-Host '  OpenAPI   : http://localhost:5028/openapi/v1.json' -ForegroundColor Green
Write-Host '  SQL       : localhost:1433' -ForegroundColor Green
Write-Host ''
Write-Host ('Total elapsed: {0}s' -f $totalSeconds) -ForegroundColor Cyan
Write-Host 'Stop later: docker compose -p taskplatform down' -ForegroundColor Gray
Write-Host ''
