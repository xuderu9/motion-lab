# render-batch.ps1 - render N shots from ONE JSON file with ONE command.
#
# M1 acceptance criterion #6: 3 shots must render from a single command.
#
#   .\studio\tools\render-batch.ps1                       # 6 stills from demo.json
#   .\studio\tools\render-batch.ps1 -Mode video           # 6 videos
#   .\studio\tools\render-batch.ps1 -WithSolid            # + magenta probe stills
#
# ASCII-only on purpose: PowerShell 5.1 decodes BOM-less UTF-8 scripts as ANSI and
# mangles any non-ASCII byte (see studio/PLAYBOOK.md, trap #5).
#
# Output layout:
#   <OutDir>/props/<shotId>.json     props passed to the Shot composition
#   <OutDir>/stills/<shotId>.png     one still per shot
#   <OutDir>/solid/<shotId>.png      magenta probe still (for overflow count)
#   <OutDir>/video/<shotId>.mp4      rendered video
#   <OutDir>/manifest.json           machine-readable index for check-shot.py

param(
  [string]$ShotsJson   = "studio/shots/demo.json",
  [string]$OutDir      = "out/m1",
  [ValidateSet("stills", "video", "both")]
  [string]$Mode        = "stills",
  [int]$Concurrency    = 8,
  [int]$StillFrame     = 72,
  [switch]$WithSolid,
  [switch]$SkipExisting,
  [switch]$SkipTypecheck
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $repoRoot "package.json"))) { $repoRoot = (Get-Location).Path }
Set-Location $repoRoot

foreach ($p in @("props", "stills", "solid", "video", "logs")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $OutDir $p) | Out-Null
}

# Typecheck first: a missing import otherwise burns a full bundle+render cycle
# and only shows up as a runtime ReferenceError deep in the canvas code.
if (-not $SkipTypecheck) {
  cmd /c "npx tsc -p tsconfig.studio.json --noEmit > `"$OutDir\logs\typecheck.log`" 2>&1"
  if ($LASTEXITCODE -ne 0) {
    Write-Host "TYPECHECK FAILED - see $OutDir/logs/typecheck.log" -ForegroundColor Red
    Get-Content "$OutDir\logs\typecheck.log" -TotalCount 40
    exit 1
  }
}

function Write-Utf8NoBom([string]$Path, [string]$Text) {
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

# Remotion output must never be piped into the PowerShell pipeline:
# Select-Object closes the pipe early and node throws a bogus "write EOF".
function Invoke-Remotion([string]$ArgLine, [string]$LogPath) {
  $dir = Split-Path -Parent $LogPath
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  cmd /c "$ArgLine > `"$LogPath`" 2>&1"
  return $LASTEXITCODE
}

# --- load shots -------------------------------------------------------------
$jsonText = [System.IO.File]::ReadAllText((Join-Path $repoRoot $ShotsJson), [System.Text.Encoding]::UTF8)
$doc = $jsonText | ConvertFrom-Json
$shots = @($doc.shots)
if ($shots.Count -eq 0) { throw "no shots in $ShotsJson" }

foreach ($p in @("props", "stills", "solid", "video", "logs")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $OutDir $p) | Out-Null
}

$manifest = @()
$fail = 0
$sw = [System.Diagnostics.Stopwatch]::StartNew()

foreach ($shot in $shots) {
  $id = [string]$shot.id
  $propsPath = Join-Path $OutDir "props/$id.json"
  Write-Utf8NoBom $propsPath (@{ spec = $shot } | ConvertTo-Json -Depth 40)

  $entry = [ordered]@{
    id                = $id
    layout            = [string]$shot.layout
    variant           = [int]$shot.variant
    theme             = [string]$shot.theme
    durationInFrames  = [int]$shot.durationInFrames
    fps               = [int]$shot.fps
    stillFrame        = $StillFrame
    still             = $null
    solid             = $null
    video             = $null
    status            = "ok"
  }

  if ($Mode -eq "stills" -or $Mode -eq "both") {
    $png = Join-Path $OutDir "stills/$id.png"
    if ($SkipExisting -and (Test-Path $png)) {
      $entry.still = $png
    } else {
      $code = Invoke-Remotion "npx remotion still studio/index.ts Shot `"$png`" --frame=$StillFrame --props=`"$propsPath`"" (Join-Path $OutDir "logs/$id.still.log")
      if ($code -ne 0) { $entry.status = "still-failed"; $fail++; }
      else { $entry.still = $png }
    }
  }

  if ($WithSolid) {
    $shotSolid = $shot | Select-Object -Property *
    $shotSolid | Add-Member -NotePropertyName debug -NotePropertyValue "solid" -Force
    $solidProps = Join-Path $OutDir "props/$id.solid.json"
    Write-Utf8NoBom $solidProps (@{ spec = $shotSolid } | ConvertTo-Json -Depth 40)
    $png = Join-Path $OutDir "solid/$id.png"
    $code = Invoke-Remotion "npx remotion still studio/index.ts Shot `"$png`" --frame=$StillFrame --props=`"$solidProps`"" (Join-Path $OutDir "logs/$id.solid.log")
    if ($code -ne 0) { $entry.status = "solid-failed"; $fail++ }
    else { $entry.solid = $png }
  }

  if ($Mode -eq "video" -or $Mode -eq "both") {
    $mp4 = Join-Path $OutDir "video/$id.mp4"
    $code = Invoke-Remotion "npx remotion render studio/index.ts Shot `"$mp4`" --props=`"$propsPath`" --concurrency=$Concurrency" (Join-Path $OutDir "logs/$id.video.log")
    if ($code -ne 0) { $entry.status = "video-failed"; $fail++ }
    else { $entry.video = $mp4 }
  }

  Write-Host ("  {0,-22} {1,-6} v{2}  {3,-10} {4}" -f $id, $entry.layout, $entry.variant, $entry.theme, $entry.status)
  $manifest += $entry
}

$sw.Stop()

$manifestDoc = [ordered]@{
  shotsJson  = $ShotsJson
  outDir     = $OutDir
  mode       = $Mode
  stillFrame = $StillFrame
  elapsedSec = [math]::Round($sw.Elapsed.TotalSeconds, 1)
  failures   = $fail
  shots      = $manifest
}
Write-Utf8NoBom (Join-Path $OutDir "manifest.json") ($manifestDoc | ConvertTo-Json -Depth 12)

Write-Host ""
if ($fail -gt 0) {
  Write-Host "BATCH FAILED - $fail step(s) failed, see $OutDir/logs/" -ForegroundColor Red
  exit 1
}
Write-Host ("BATCH OK - {0} shot(s) in {1}s -> {2}" -f $shots.Count, $manifestDoc.elapsedSec, $OutDir) -ForegroundColor Green
