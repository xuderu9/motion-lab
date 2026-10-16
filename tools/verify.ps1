# verify.ps1 — 验收门槛（跑不过就不算完成）
# 用法: pwsh -File tools/verify.ps1 [-SkipRender]
# 由 dsh（验收方）维护。结果写回 COLLAB.md 第 3 节。

param(
  [switch]$SkipRender
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$results = [ordered]@{}

function Gate($name, [scriptblock]$body) {
  Write-Host "`n=== $name ===" -ForegroundColor Cyan
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    & $body
    $ok = ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE)
    $results[$name] = if ($ok) { 'PASS' } else { "FAIL(exit=$LASTEXITCODE)" }
  } catch {
    $results[$name] = "FAIL($($_.Exception.Message))"
  }
  $sw.Stop()
  Write-Host ("-> {0}  ({1:n1}s)" -f $results[$name], $sw.Elapsed.TotalSeconds) `
    -ForegroundColor $(if ($results[$name] -eq 'PASS') { 'Green' } else { 'Red' })
}

# 1. 类型检查
Gate 'tsc --noEmit' { npx tsc --noEmit }

# 2. 单帧出图
Gate 'still frame=60' {
  npx remotion still DemoVideo out/verify-frame.png --frame=60 --log=error
}

# 3. 出片（默认跑，-SkipRender 跳过）
if (-not $SkipRender) {
  Gate 'render mp4' {
    npx remotion render DemoVideo out/verify.mp4 --log=error
  }
} else {
  $results['render mp4'] = 'SKIPPED'
}

# 4. 工作区干净
Gate 'git clean' {
  $dirty = git status --porcelain
  if ($dirty) { Write-Host $dirty; $global:LASTEXITCODE = 1 } else { $global:LASTEXITCODE = 0 }
}

# 汇总
Write-Host "`n================ 验收结果 ================" -ForegroundColor Yellow
$results.GetEnumerator() | ForEach-Object { "{0,-20} {1}" -f $_.Key, $_.Value }
$failed = @($results.GetEnumerator() | Where-Object { $_.Value -notin @('PASS', 'SKIPPED') }).Count
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host "结论: $(if ($failed -eq 0) { '可交付' } else { "不可交付（$failed 项未过）" })"
exit $failed
