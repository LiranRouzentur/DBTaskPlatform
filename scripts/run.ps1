# scripts/run.ps1 — fresh-start spinup for the Task-Management Platform.
# Wipes prior state, rebuilds .NET + Angular, brings up the compose stack, and waits on /health.

# Convert any cmdlet failure into a terminating error so the catch/exit paths below actually fire.
$ErrorActionPreference = 'Stop'

# Repo root resolved relative to this script — lets the script run from any cwd.
$projectRoot = Resolve-Path "$PSScriptRoot\.."
# All subsequent relative paths (compose, dotnet) are anchored here.
Set-Location $projectRoot

# Compose project name — namespaces containers/volumes so multiple checkouts don't collide.
$composeProject = 'taskplatform'
# Wall-clock start used for the "Total elapsed" footer.
$scriptStart = Get-Date

# Prints a cyan "==[ step/total ]== title" banner before each phase.
function Write-Banner {
    param([int]$Step, [int]$Total, [string]$Title)
    # Leading blank line — visual spacing between phases.
    Write-Host ''
    Write-Host ('==[ {0}/{1} ]== {2}' -f $Step, $Total, $Title) -ForegroundColor Cyan
}

# Indented gray info line — used for sub-steps and waiting messages.
function Write-Info { param([string]$Message) Write-Host ('   {0}' -f $Message) -ForegroundColor Gray }
# Green "OK <message>" — phase succeeded.
function Write-Ok   { param([string]$Message) Write-Host ('   OK  {0}' -f $Message) -ForegroundColor Green }
# Red "FAIL <message>" — phase failed (usually followed by `exit 1`).
function Write-Fail { param([string]$Message) Write-Host ('   FAIL {0}' -f $Message) -ForegroundColor Red }
# Returns seconds (1 decimal) since `$Since` — used for per-phase timings in OK lines.
function Get-Elapsed { param([DateTime]$Since) [Math]::Round(((Get-Date) - $Since).TotalSeconds, 1) }

# Idempotent rm-rf with logging — used during the cache-wipe phase.
function Remove-PathIfExists {
    param([string]$Path)
    # No-op when path doesn't exist — keeps the wipe step safe on first run.
    if (Test-Path -LiteralPath $Path) {
        try {
            # -Recurse -Force handles read-only files inside bin/obj (CI artifacts, generated code).
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
            Write-Info ('  removed {0}' -f $Path)
        } catch {
            # Don't abort the run — a leftover lock on one path shouldn't kill the whole spinup.
            Write-Info ('  could not remove {0}: {1}' -f $Path, $_.Exception.Message)
        }
    }
}

# Total phase count — kept in sync with the Write-Banner -Step calls below.
$totalSteps = 8

# Header block — identifies the run in CI logs.
Write-Host ''
Write-Host '#############################################################' -ForegroundColor Cyan
Write-Host '#  Task-Management Platform - fresh-start spinup            #' -ForegroundColor Cyan
Write-Host '#############################################################' -ForegroundColor Cyan
Write-Info ('Project root : {0}' -f $projectRoot)
Write-Info ('Compose name : {0}' -f $composeProject)
Write-Info ('Started      : {0}' -f $scriptStart.ToString('yyyy-MM-dd HH:mm:ss'))

# ─── Step 1: ensure Docker Desktop is running ──────────────────────────────
Write-Banner -Step 1 -Total $totalSteps -Title 'Docker Desktop check'
# Per-phase timer reset so the OK line reports just this phase's duration.
$stepStart = Get-Date

# Look up the docker CLI on PATH; missing it is a hard prerequisite.
$dockerCli = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCli) {
    Write-Fail 'docker CLI not on PATH. Install Docker Desktop and try again.'
    exit 1
}
Write-Info ('docker CLI : {0}' -f $dockerCli.Path)

# Probe the daemon — `docker info` returns non-zero when the daemon isn't reachable.
$dockerInfoOk = $false
# Swallow native-stderr + check exit code; stdout/stderr suppressed to keep the banner clean.
try { docker info *> $null; if ($LASTEXITCODE -eq 0) { $dockerInfoOk = $true } } catch {}

# Daemon down → try to start Docker Desktop ourselves and poll until it's up.
if (-not $dockerInfoOk) {
    # Default Docker Desktop install path; not configurable today.
    $dockerExe = "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    if (-not (Test-Path $dockerExe)) {
        Write-Fail "Docker Desktop binary not found at $dockerExe"
        exit 1
    }
    Write-Info 'Docker daemon unreachable. Starting Docker Desktop...'
    # Fire-and-forget — Docker Desktop launches asynchronously; the poll below detects readiness.
    Start-Process -FilePath $dockerExe | Out-Null

    # 3-minute budget — empirically enough for a cold WSL2 startup.
    $deadline = (Get-Date).AddSeconds(180)
    while ((Get-Date) -lt $deadline) {
        # 3s cadence — fast enough to feel responsive, slow enough to not hammer `docker info`.
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

# ─── Step 2: tear down any prior containers/volumes/images for this compose project ──
Write-Banner -Step 2 -Total $totalSteps -Title 'Tear down containers + SQL volume + locally-built images'
$stepStart = Get-Date
# `compose down` exits non-zero on first run (nothing to remove). Save/restore so a non-zero
# exit here doesn't terminate the whole script via $ErrorActionPreference='Stop'.
$prevPref = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    # -v removes the SQL volume (drops the DB), --rmi local removes locally-built images,
    # --remove-orphans cleans up containers from removed compose services.
    docker compose -p $composeProject down -v --rmi local --remove-orphans
} finally {
    # Always restore the strict policy, even if `compose down` threw.
    $ErrorActionPreference = $prevPref
}
if ($LASTEXITCODE -ne 0) {
    # Non-zero on first run is expected (nothing existed to remove); not a failure.
    Write-Info ('docker compose down exited {0} (no-op on first run is fine)' -f $LASTEXITCODE)
}
Write-Ok ('Containers + volume + local images removed ({0}s)' -f (Get-Elapsed -Since $stepStart))

# ─── Step 3: wipe local build caches so the next build is truly fresh ──────
Write-Banner -Step 3 -Total $totalSteps -Title 'Wipe build caches (.NET bin/obj + Angular dist/.angular/node_modules)'
$stepStart = Get-Date

# Recursive sweep across the .NET solution — every csproj has its own bin/obj.
Get-ChildItem -Path (Join-Path $projectRoot 'server') -Directory -Recurse -Force -ErrorAction SilentlyContinue `
    | Where-Object { $_.Name -in @('bin', 'obj') } `
    | ForEach-Object { Remove-PathIfExists -Path $_.FullName }

# Angular output dir — stale builds confuse the dev-server cache.
Remove-PathIfExists -Path (Join-Path $projectRoot 'client\dist')
# Angular CLI's incremental cache — stale entries can mask config changes.
Remove-PathIfExists -Path (Join-Path $projectRoot 'client\.angular')
# Nx cache (defensive — repo doesn't use Nx today but the dir can appear after experimentation).
Remove-PathIfExists -Path (Join-Path $projectRoot 'client\.nx')

Write-Ok ('Caches wiped ({0}s)' -f (Get-Elapsed -Since $stepStart))

# ─── Step 4: ensure node_modules is installed before the Angular build ─────
Write-Banner -Step 4 -Total $totalSteps -Title 'Frontend dependencies (npm install if needed)'
$stepStart = Get-Date
# Scope cwd to client/ so npm picks up the right package.json.
Push-Location (Join-Path $projectRoot 'client')
try {
    # Skip when deps already exist — Step 3 intentionally does NOT wipe node_modules to save 60-90s.
    if (Test-Path 'node_modules') {
        Write-Info 'node_modules present - skipping npm install'
    } else {
        Write-Info 'node_modules missing - installing...'
        # Prefer reproducible install when a lockfile is present; fall back to plain install otherwise.
        if (Test-Path 'package-lock.json') { npm ci } else { npm install }
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
    }
} finally {
    # Always restore the previous cwd so a thrown install error doesn't strand the script in client/.
    Pop-Location
}
Write-Ok ('Frontend deps ready ({0}s)' -f (Get-Elapsed -Since $stepStart))

# ─── Step 5: compile the .NET solution (Release config, used by the Dockerfile too) ──
Write-Banner -Step 5 -Total $totalSteps -Title '.NET build (server/TaskPlatform.slnx)'
$stepStart = Get-Date
# Solution file is the new .slnx format; --nologo suppresses MSBuild banner.
dotnet build (Join-Path $projectRoot 'server\TaskPlatform.slnx') -c Release --nologo
if ($LASTEXITCODE -ne 0) { Write-Fail '.NET build failed'; exit 1 }
Write-Ok ('.NET build complete ({0}s)' -f (Get-Elapsed -Since $stepStart))

# ─── Step 6: build the Angular bundle (verifies the build before the container runs nginx) ──
Write-Banner -Step 6 -Total $totalSteps -Title 'Angular build (client/)'
$stepStart = Get-Date
Push-Location (Join-Path $projectRoot 'client')
try {
    # `npm run build` resolves to `ng build` via package.json.
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Angular build failed' }
} finally { Pop-Location }
Write-Ok ('Angular build complete ({0}s)' -f (Get-Elapsed -Since $stepStart))

# ─── Step 7: rebuild + start the compose stack from scratch ────────────────
Write-Banner -Step 7 -Total $totalSteps -Title 'docker compose build --no-cache + up'
$stepStart = Get-Date

# --no-cache forces a fresh image build; --pull refreshes base images (catches CVE updates).
docker compose -p $composeProject build --no-cache --pull
if ($LASTEXITCODE -ne 0) { Write-Fail 'docker compose build failed'; exit 1 }
# --force-recreate guarantees containers boot against the freshly built images, even if an
# old container with the same name lingers somewhere.
docker compose -p $composeProject up -d --force-recreate
if ($LASTEXITCODE -ne 0) { Write-Fail 'docker compose up failed'; exit 1 }
Write-Ok ('Containers built + started ({0}s)' -f (Get-Elapsed -Since $stepStart))

# ─── Step 8: poll /health until the API is ready (or 3 minutes elapse) ─────
Write-Banner -Step 8 -Total $totalSteps -Title 'Wait for API health'
$stepStart = Get-Date
# Host port mapped to the API container in compose.
$healthUrl = 'http://localhost:5028/health'
# 3-minute readiness budget — covers cold SQL Server warmup + EF migration apply.
$healthDeadline = (Get-Date).AddSeconds(180)
$healthOk = $false
while ((Get-Date) -lt $healthDeadline) {
    try {
        # 3s per-request timeout — long enough for cold-JIT first hit, short enough to keep the poll tight.
        $resp = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 3 -UseBasicParsing
        if ($resp.StatusCode -eq 200) { $healthOk = $true; break }
    } catch {
        # Connection refused / 5xx during warmup — swallow and retry until the deadline.
    }
    # Back off between attempts so we're not in a tight loop during startup.
    Start-Sleep -Seconds 3
    Write-Info '  waiting for /health...'
}
if (-not $healthOk) {
    Write-Fail 'API /health did not return 200 within 3 minutes.'
    # Point operator at the most useful diagnostic when this trips.
    Write-Info 'See container logs: docker compose -p taskplatform logs api'
    exit 1
}
Write-Ok ('API healthy ({0}s)' -f (Get-Elapsed -Since $stepStart))

# ─── Footer: print the URLs and total elapsed time ─────────────────────────
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