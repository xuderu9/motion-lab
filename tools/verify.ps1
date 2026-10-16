# verify.ps1 - acceptance gates for motion-lab
# Usage: powershell -ExecutionPolicy Bypass -File tools\verify.ps1 [-SkipRender]
#
# !! THIS FILE MUST STAY PURE ASCII !!
# Windows PowerShell 5.1 decodes BOM-less UTF-8 scripts as ANSI (GBK). A Chinese
# string literal gets mangled into mojibake, the parser loses a quote, and the
# whole script dies with "unexpected token }". That killed v1 of this file.
# Codex runs powershell.exe 5.1 too, so keep it ASCII for both of us.
#
# v3: every external command goes through cmd.exe with file redirection.
# Reason: piping npx/node stdout into a PowerShell pipeline can be closed early
# (background job, Select-Object -First, detached console) and node dies with
# "Error: write EOF", which looks exactly like a render failure. v2 reported a
# bogus FAIL on a render that had actually worked in 10.8 s. Logs land in out/.

param([switch]$SkipRender)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$script:results = [ordered]@{}
$script:notes = [ordered]@{}

function Invoke-Logged {
  param([string]$Cmd, [string]$Log)
  if (Test-Path $Log) { Remove-Item $Log -Force }
  cmd /c "$Cmd > `"$Log`" 2>&1"
  return $LASTEXITCODE
}

function Gate {
  param([string]$Name, [scriptblock]$Body)
  Write-Host ""
  Write-Host "=== $Name ===" -ForegroundColor Cyan
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $ok = $false
  try { $ok = [bool](& $Body) } catch {
    Write-Host ("EXCEPTION: " + $_.Exception.Message) -ForegroundColor Red
    $ok = $false
  }
  $sw.Stop()
  $secs = [math]::Round($sw.Elapsed.TotalSeconds, 1)
  $script:results[$Name] = $(if ($ok) { 'PASS' } else { 'FAIL' })
  $script:notes[$Name] = "$secs s"
  $color = $(if ($ok) { 'Green' } else { 'Red' })
  Write-Host ("-> " + $script:results[$Name] + "  (" + $secs + "s)") -ForegroundColor $color
}

# 1. typecheck
Gate 'tsc --noEmit' {
  $code = Invoke-Logged 'npx tsc --noEmit' 'out/verify-tsc.log'
  if ($code -ne 0) { Get-Content 'out/verify-tsc.log' -Tail 20 }
  return ($code -eq 0)
}

# 2. single frame comes out
Gate 'still frame=60' {
  if (Test-Path 'out/verify-frame.png') { Remove-Item 'out/verify-frame.png' -Force }
  $code = Invoke-Logged 'npx remotion still DemoVideo out/verify-frame.png --frame=60 --log=error' 'out/verify-still.log'
  $made = (Test-Path 'out/verify-frame.png') -and ((Get-Item 'out/verify-frame.png').Length -gt 0)
  if (-not $made) { Get-Content 'out/verify-still.log' -Tail 20 }
  return ($made -and ($code -eq 0))
}

# 3. full render + the project's own red line: 1080p render under 300 s
if ($SkipRender) {
  $script:results['render mp4 (<300s)'] = 'SKIPPED'
  $script:notes['render mp4 (<300s)'] = '-'
} else {
  Gate 'render mp4 (<300s)' {
    if (Test-Path 'out/verify.mp4') { Remove-Item 'out/verify.mp4' -Force }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $code = Invoke-Logged 'npx remotion render DemoVideo out/verify.mp4 --log=error' 'out/verify-render.log'
    $sw.Stop()
    $secs = $sw.Elapsed.TotalSeconds
    Write-Host ("render wall time: " + [math]::Round($secs, 1) + " s  (red line: 300 s)")
    if ($secs -gt 120) {
      Write-Host "SLOW: >120 s. Likely the software rasterizer (SwiftShader) fallback, not ANGLE/hardware." -ForegroundColor Yellow
    }
    $made = (Test-Path 'out/verify.mp4') -and ((Get-Item 'out/verify.mp4').Length -gt 0)
    if (-not $made) { Get-Content 'out/verify-render.log' -Tail 20 }
    return ($made -and ($code -eq 0) -and ($secs -lt 300))
  }
}

# 4. working tree clean (out/ is gitignored, so rendered artifacts do not count)
Gate 'git clean' {
  $dirty = @(git status --porcelain)
  if ($dirty.Count -gt 0) { $dirty | ForEach-Object { Write-Host $_ }; return $false }
  return $true
}

Write-Host ""
Write-Host "================ RESULT ================" -ForegroundColor Yellow
$failed = 0
foreach ($k in $script:results.Keys) {
  $v = $script:results[$k]
  if ($v -ne 'PASS' -and $v -ne 'SKIPPED') { $failed++ }
  Write-Host ("{0,-22} {1,-8} {2}" -f $k, $v, $script:notes[$k])
}
Write-Host "========================================" -ForegroundColor Yellow
if ($failed -eq 0) { Write-Host "VERDICT: SHIPPABLE" -ForegroundColor Green }
else { Write-Host ("VERDICT: NOT SHIPPABLE (" + $failed + " gate(s) failed)") -ForegroundColor Red }
exit $failed
