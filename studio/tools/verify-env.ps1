# verify-env.ps1 - post-update environment check for MotionLab
# Usage: powershell -ExecutionPolicy Bypass -File studio\tools\verify-env.ps1 [-Full]
#
# !! KEEP THIS FILE PURE ASCII !!
# Windows PowerShell 5.1 decodes BOM-less UTF-8 as ANSI and chokes on CJK literals.
# (same trap that killed verify.ps1 v1 - see studio/PLAYBOOK.md)

param([switch]$Full)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$results = [ordered]@{}
function Check($name, [scriptblock]$body) {
  try {
    $ok = [bool](& $body)
  } catch {
    $ok = $false
  }
  $results[$name] = if ($ok) { 'PASS' } else { 'FAIL' }
  $color = if ($ok) { 'Green' } else { 'Red' }
  Write-Host ("  {0,-34} {1}" -f $name, $results[$name]) -ForegroundColor $color
}

Write-Host "`n=== MotionLab environment ===" -ForegroundColor Cyan

Check 'git working tree clean' {
  -not (git status --porcelain)
}

Check 'local HEAD == origin/main' {
  $l = (git rev-parse HEAD).Trim()
  $r = (git ls-remote git@github.com:xuderu9/motion-lab.git refs/heads/main 2>$null | Select-Object -First 1)
  if (-not $r) { return $false }
  $r = ($r -split "`t")[0]
  $l -eq $r
}

Check 'handoff docs present' {
  (Test-Path 'HANDOFF.md') -and (Test-Path 'studio\M1-DESIGN.md') -and (Test-Path 'studio\PLAYBOOK.md')
}

Check 'node available' {
  $v = node -v 2>$null
  $v -and ($v -match '^v\d+')
}

Check 'remotion installed' {
  Test-Path 'node_modules\remotion\package.json'
}

Check 'production flags off' {
  $a = Select-String -Path 'studio\Composite.tsx' -Pattern 'const SHOW_QUAD = false' -Quiet
  $b = Select-String -Path 'studio\LiveUI.tsx' -Pattern 'const SOLID_DEBUG = false' -Quiet
  $a -and $b
}

Check 'deliverable exists' {
  Test-Path 'out\composite.mp4'
}

Check 'dreamina CLI responds' {
  $exe = Join-Path $env:USERPROFILE 'bin\dreamina.exe'
  if (-not (Test-Path $exe)) { return $false }
  (Test-Path $exe)
}

Check 'dreamina-canvas CLI responds' {
  Test-Path 'D:\jimeng-cli\dreamina-canvas.exe'
}

Check 'skills registered' {
  $a = Test-Path (Join-Path $env:USERPROFILE '.agents\skills\dreamina-cli\SKILL.md')
  $b = Test-Path (Join-Path $env:USERPROFILE '.agents\skills\dreamina-canvas-cli\SKILL.md')
  $a -and $b
}

Check 'plates present' {
  (Test-Path 'public\plates\desk-night.png') -and (Test-Path 'public\plates\desk-night-dark.png')
}

if ($Full) {
  Write-Host "`n=== Full check: render one still (may take ~40s) ===" -ForegroundColor Cyan
  if (Test-Path 'out\probe.png') { Remove-Item 'out\probe.png' -Force }
  cmd /c "npx remotion still studio/index.ts Composite out\probe.png --frame=120 --log=error > out\probe.log 2>&1"
  Check 'render still frame 120' {
    (Test-Path 'out\probe.png') -and ((Get-Item 'out\probe.png').Length -gt 0)
  }
}

$failed = @($results.Values | Where-Object { $_ -ne 'PASS' }).Count
Write-Host "`n---" -ForegroundColor Cyan
if ($failed -eq 0) {
  Write-Host "ENV OK - safe to continue" -ForegroundColor Green
} else {
  Write-Host ("ENV BROKEN - " + $failed + " check(s) failed") -ForegroundColor Red
}
exit $failed
