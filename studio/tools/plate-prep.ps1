# plate-prep.ps1 - one command to turn a generated image into a usable environment.
#
# Why this exists: the last time we solved the screen quad by hand it took ~10 rounds
# of "render a frame, look, nudge coordinates" (see PLAYBOOK rule 1). This wraps the
# whole chain into one command that prints numbers instead of opinions.
#
#   .\studio\tools\plate-prep.ps1 -Plate out\plates-work\plate-B3.png -Name window-day
#   .\studio\tools\plate-prep.ps1 -Plate ... -Name x -TargetArea 0.11   # auto-crop if too small
#   .\studio\tools\plate-prep.ps1 -Plate ... -Name x -Seed "900,420"     # when auto-detect fails
#   .\studio\tools\plate-prep.ps1 -Plate ... -Name x -Install            # copy into public/plates
#
# Acceptance窗口 (see out/plates-work/PLATE-SPEC.md, derived from measurement):
#   screen area  9% ~ 18%      below -> room can't be lifted enough; above -> dark frames fail
#   screen width >= 480 px     34px canvas font * (w/1600) >= 10px
#   outside luma  => exposure in 0.60 ~ 1.40   (further out burns highlights / flattens the room)
#   physical screen must be 4:3  (canvas is 1600x1200)
#
# ASCII only on purpose: PowerShell 5.1 decodes BOM-less UTF-8 scripts as ANSI.

param(
  [Parameter(Mandatory = $true)][string]$Plate,
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$WorkDir   = "out/plates-work",
  [double]$TargetArea = 0,
  [string]$Seed      = "",
  [switch]$Install
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

$PY = $null
# Resolution order matters: the Windows Store "python.exe" stub in WindowsApps is a
# zero-byte placeholder that silently does nothing (exit code 9009 / no output), which
# looks exactly like "detect failed". Prefer the DSH bundled interpreter.
$candidates = @(
  (Join-Path $env:DSH_HOME "dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"),
  "C:\Python312\python.exe",
  "C:\Python311\python.exe"
)
foreach ($c in $candidates) {
  if ($c -and (Test-Path $c)) { $PY = $c; break }
}
if (-not $PY) {
  $found = Get-ChildItem "$env:USERPROFILE\.dsh\dsh-runtimes" -Recurse -Filter "python.exe" -ErrorAction SilentlyContinue |
           Select-Object -First 1 -ExpandProperty FullName
  if ($found) { $PY = $found }
}
if (-not $PY) {
  $g = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($g -and $g.Source -notlike "*WindowsApps*") { $PY = $g.Source }
}
if (-not $PY) { Write-Host "python not found (set DSH_HOME or install python)" -ForegroundColor Red; exit 1 }
Write-Host "  python: $PY"

New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
$base = [System.IO.Path]::GetFileNameWithoutExtension($Plate)
$cur  = Join-Path $WorkDir $Plate
$env1 = Join-Path $WorkDir "env-$Name.json"

function Get-Metrics([string]$jsonPath) {
  if (-not (Test-Path $jsonPath)) { return $null }
  $j = Get-Content $jsonPath -Raw | ConvertFrom-Json
  return @{
    area    = [double]$j._metrics.area_pct
    width   = [double]$j._metrics.screen_w
    outside = [double]$j._metrics.outside_luma
    expo    = [double]$j.exposure
    quad    = $j.quad
  }
}

Write-Host ""
Write-Host "=== plate-prep: $Name ===" -ForegroundColor Cyan

# ---- 1. detect -------------------------------------------------------------
$detectArgs = @("studio/tools/detect-screen.py", $Plate, "--json", $env1, "--name", "$Name.png")
if ($Seed) { $detectArgs += @("--seed", $Seed) }
& $PY @detectArgs
if ($LASTEXITCODE -ne 0) { Write-Host "detect failed (try -Seed x,y)" -ForegroundColor Red; exit 2 }

$m = Get-Metrics $env1
if (-not $m) { Write-Host "no env json produced" -ForegroundColor Red; exit 3 }

# ---- 2. crop if the screen is too small ------------------------------------
$platePath = $Plate
if ($TargetArea -gt 0 -and ($m.area / 100.0) -lt 0.09) {
  $cropOut = Join-Path $WorkDir "$base-crop.png"
  & $PY studio/tools/crop-plate.py $Plate --env $env1 --target-area $TargetArea --out $cropOut
  if ($LASTEXITCODE -eq 0) {
    $platePath = $cropOut
    & $PY studio/tools/detect-screen.py $cropOut --json $env1 --name "$Name.png"
    $m = Get-Metrics $env1
    Write-Host "  (used cropped plate)" -ForegroundColor Yellow
  }
}

# ---- 3. verdict ------------------------------------------------------------
$okArea  = ($m.area -ge 9.0) -and ($m.area -le 18.0)
$okWidth = ($m.width -ge 480)
$okExpo  = ($m.expo -ge 0.60) -and ($m.expo -le 1.40)
$eff     = [math]::Round($m.width / 1600.0 * 34.0, 2)

Write-Host ""
Write-Host ("  area      {0,6:N2}%   {1}" -f $m.area,   $(if ($okArea)  { "PASS" } else { "FAIL (need 9-18%)" }))
Write-Host ("  width     {0,6:N1}px  {1}   -> 34px font = {2}px effective" -f $m.width, $(if ($okWidth) { "PASS" } else { "FAIL (need >=480)" }), $eff)
Write-Host ("  exposure  {0,6:N3}    {1}" -f $m.expo,   $(if ($okExpo)  { "PASS" } else { "FAIL (need 0.60-1.40)" }))
Write-Host ("  outside   {0,6:N1}    (room luma at exposure 1.0)" -f $m.outside)
$pass = $okArea -and $okWidth -and $okExpo

# ---- 4. install ------------------------------------------------------------
if ($pass -and $Install) {
  Copy-Item $platePath (Join-Path "public/plates" "$Name.png") -Force
  & $PY studio/tools/patch-plate.py (Join-Path "public/plates" "$Name.png")
  Write-Host ""
  Write-Host "  installed -> public/plates/$Name.png" -ForegroundColor Green
  Write-Host "  (patch-plate only reports; check the top-left crop before using --write)"
} elseif ($pass) {
  Write-Host ""
  Write-Host "  env json -> $env1   (pass -Install to copy into public/plates)"
} else {
  Write-Host ""
  Write-Host "  NOT USABLE - regenerate or adjust. env json kept at $env1" -ForegroundColor Red
}

Write-Host ""
if ($pass) { exit 0 } else { exit 4 }
