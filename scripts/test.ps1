
$ErrorActionPreference = 'Stop'

# Windows PowerShell defaults to the legacy OEM code page for child-process stdout,
# which mangles vitest's UTF-8 glyphs (✓ becomes "Γ£ô"). Force UTF-8 for both
# directions so the per-test regex below actually matches.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding           = [System.Text.Encoding]::UTF8

$projectRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $projectRoot

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

function Convert-ToPurpose {
    
    param([string]$Name)
    if ([string]::IsNullOrWhiteSpace($Name)) { return '' }
    $pieces = $Name -split '_'
    $expanded = foreach ($p in $pieces) {
        ($p -creplace '([a-z0-9])([A-Z])', '$1 $2') -creplace '([A-Z]+)([A-Z][a-z])', '$1 $2'
    }
    ($expanded -join ' - ').Trim()
}

function Format-TestLine {
    param(
        [string]$Status,           
        [string]$Name,
        [string]$Purpose,
        [Nullable[double]]$DurationMs
    )
    $color = switch ($Status) {
        'PASS' { 'Green' }
        'FAIL' { 'Red' }
        'SKIP' { 'Yellow' }
        default { 'Gray' }
    }
    $tag = '[{0}]' -f $Status.PadRight(4)
    Write-Host ('   {0} {1}' -f $tag, $Name) -ForegroundColor $color
    if ($Purpose) {
        Write-Host ('          Purpose : {0}' -f $Purpose) -ForegroundColor DarkGray
    }
    if ($null -ne $DurationMs) {
        Write-Host ('          Duration: {0} ms' -f [Math]::Round($DurationMs, 1)) -ForegroundColor DarkGray
    }
}

function Remove-AnsiCodes {
    param([string]$Text)
    $esc = [char]0x1B
    
    $stripped = $Text -replace "$esc\[[0-9;]*[a-zA-Z]", ''
    
    $stripped = $stripped -replace '\[[0-9;]+m', ''
    return $stripped
}

Write-Host ''
Write-Host '#############################################################' -ForegroundColor Cyan
Write-Host '#  Task-Management Platform - test suite (console-only)     #' -ForegroundColor Cyan
Write-Host '#############################################################' -ForegroundColor Cyan
Write-Info ('Project root : {0}' -f $projectRoot)
Write-Info ('Started      : {0}' -f $scriptStart.ToString('yyyy-MM-dd HH:mm:ss'))

Write-Banner -Step 1 -Total 2 -Title 'Backend tests (xUnit + LocalDB integration)'
$stepStart = Get-Date

$slnx = Join-Path $projectRoot 'server\TaskPlatform.slnx'

$beTotal = 0; $bePass = 0; $beFail = 0; $beSkip = 0
$dotnetExit = 0
$prevPref = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try {
    
    & dotnet test $slnx --nologo --logger 'console;verbosity=detailed' 2>&1 | ForEach-Object {
        $line = Remove-AnsiCodes "$_"
        if ($line -match '^\s*(Passed|Failed|Skipped)\s+(.+?)(?:\s+\[([^\]]+)\])?\s*$') {
            $outcome  = $Matches[1]
            $fqName   = $Matches[2]
            $durStr   = $Matches[3]
            $status = switch ($outcome) {
                'Passed'  { 'PASS' }
                'Failed'  { 'FAIL' }
                'Skipped' { 'SKIP' }
            }
            $beTotal++
            if ($status -eq 'PASS') { $bePass++ }
            elseif ($status -eq 'FAIL') { $beFail++ }
            else { $beSkip++ }

            $durationMs = $null
            if ($durStr) {
                if ($durStr -match '^([\d.,]+)\s*ms') {
                    $durationMs = [double]($Matches[1] -replace ',', '.')
                } elseif ($durStr -match '^([\d.,]+)\s*s') {
                    $durationMs = [double]($Matches[1] -replace ',', '.') * 1000
                } elseif ($durStr -match '<\s*([\d.,]+)\s*ms') {
                    $durationMs = [double]($Matches[1] -replace ',', '.')
                }
            }

            $cleanName  = ($fqName -split '\(')[0]
            $methodOnly = ($cleanName -split '\.')[-1]
            $purpose    = Convert-ToPurpose -Name $methodOnly
            Format-TestLine -Status $status -Name $cleanName -Purpose $purpose -DurationMs $durationMs
        }
        elseif ($line.Trim().Length -gt 0 -and $line -notmatch '^\s*(Starting test execution|Test run for|A total of)') {
            
            Write-Host $line -ForegroundColor DarkGray
        }
    }
    $dotnetExit = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $prevPref
}

Write-Host ''
Write-Info ('Backend totals: {0} passed, {1} failed, {2} skipped ({3} total, {4}s)' -f $bePass, $beFail, $beSkip, $beTotal, (Get-Elapsed -Since $stepStart))

if ($dotnetExit -ne 0 -or $beFail -gt 0) {
    Write-Fail 'Backend tests failed.'
    exit 1
}
Write-Ok 'Backend tests passed.'

Write-Banner -Step 2 -Total 2 -Title 'Frontend tests (Vitest + jsdom)'
$stepStart = Get-Date

$clientDir = Join-Path $projectRoot 'client'
if (-not (Test-Path (Join-Path $clientDir 'node_modules'))) {
    Write-Info 'node_modules missing - running npm install...'
    Push-Location $clientDir
    try {
        if (Test-Path 'package-lock.json') { npm ci } else { npm install }
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
    } finally { Pop-Location }
}

$feTotal = 0; $fePass = 0; $feFail = 0; $feSkip = 0
$feExit = 0
$prevPref = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
Push-Location $clientDir
try {
    $vitestCmd = Join-Path $clientDir 'node_modules\.bin\vitest.cmd'
    
    $glyphChars = [string]::Concat(
        [char]0x2713,  
        [char]0x2714,  
        'v',
        [char]0x00D7,  
        'xX',
        [char]0x2193   
    )
    $vitestPerTestPattern = '^\s*([' + [regex]::Escape($glyphChars) + '])\s+(.+?)(?:\s+(\d+)\s*ms)?\s*$'
    $passGlyphs = [char]0x2713, [char]0x2714, 'v'
    $failGlyphs = [char]0x00D7, 'x', 'X'
    $skipGlyphs = [char]0x2193

    & $vitestCmd run 2>&1 | ForEach-Object {
        $line = Remove-AnsiCodes "$_"
        if ($line -match $vitestPerTestPattern) {
            $glyph = $Matches[1]
            $title = $Matches[2]
            $durMs = $Matches[3]
            $status = if ($passGlyphs -contains $glyph) { 'PASS' }
                      elseif ($failGlyphs -contains $glyph) { 'FAIL' }
                      elseif ($skipGlyphs -contains $glyph) { 'SKIP' }
                      else { 'PASS' }
            $feTotal++
            if ($status -eq 'PASS') { $fePass++ }
            elseif ($status -eq 'FAIL') { $feFail++ }
            else { $feSkip++ }

            $segs = $title -split '\s*>\s*'
            $leaf = $segs[-1]
            $purpose = Convert-ToPurpose -Name $leaf

            $durationMs = $null
            if ($durMs) { $durationMs = [double]$durMs }

            Format-TestLine -Status $status -Name $title -Purpose $purpose -DurationMs $durationMs
        }
        elseif ($line.Trim().Length -gt 0) {
            Write-Host $line -ForegroundColor DarkGray
        }
    }
    $feExit = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $prevPref
    Pop-Location
}

Write-Host ''
Write-Info ('Frontend totals: {0} passed, {1} failed, {2} skipped ({3} total, {4}s)' -f $fePass, $feFail, $feSkip, $feTotal, (Get-Elapsed -Since $stepStart))

if ($feExit -ne 0 -or $feFail -gt 0) {
    Write-Fail 'Frontend tests failed.'
    exit 1
}
Write-Ok 'Frontend tests passed.'

$totalSeconds = Get-Elapsed -Since $scriptStart
$grandTotal   = $beTotal + $feTotal
$grandPass    = $bePass  + $fePass
$grandFail    = $beFail  + $feFail
$grandSkip    = $beSkip  + $feSkip

Write-Host ''
Write-Host '#############################################################' -ForegroundColor Cyan
Write-Host '#  Final summary                                            #' -ForegroundColor Cyan
Write-Host '#############################################################' -ForegroundColor Cyan
Write-Host ('  Backend  : {0} passed, {1} failed, {2} skipped' -f $bePass, $beFail, $beSkip) -ForegroundColor Gray
Write-Host ('  Frontend : {0} passed, {1} failed, {2} skipped' -f $fePass, $feFail, $feSkip) -ForegroundColor Gray
Write-Host ('  Combined : {0} passed, {1} failed, {2} skipped ({3} total)' -f $grandPass, $grandFail, $grandSkip, $grandTotal) -ForegroundColor Cyan
Write-Host ''
if ($grandFail -eq 0) {
    Write-Host ('All tests passed in {0}s.' -f $totalSeconds) -ForegroundColor Green
} else {
    Write-Host ('{0} tests failed (elapsed {1}s).' -f $grandFail, $totalSeconds) -ForegroundColor Red
    exit 1
}
Write-Host ''
