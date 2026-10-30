# The upgrade lane: 4.10 (schema 112) -> 5.0 (schema 500).
#
# WHY THIS EXISTS
#
# A release has to pass twice: once installed from nothing (reset.ps1), and once
# applied over a database that ran the previous release and holds data. From 5.0
# on, the second path is not "run the new SQL files again" - the 5.0 baseline is
# not idempotent - but supabase/migrations/: a 4.x database is upgraded by
# 0500_from_4x.sql, in one transaction, and then verified.
#
# WHAT IT DOES
#
#   1. Installs the 4.10 snapshot (supabase/legacy-4.10, mounted at /baseline),
#      seeds it with the 4.x spelling of the seed (sql/seed-4x.sql) and verifies
#      it with the snapshot's own tools/verify-schema.sql, which must stamp 112.
#   2. Counts the rows of every table, keyed by oid (a rename keeps the oid).
#   3. Applies /blueplm/migrations/0500_from_4x.sql in ONE transaction, the way
#      the migration runner does.
#   4. Verifies with the release's tools/verify-schema.sql, which must stamp
#      schema_release_version().
#   5. Requires every table's row count to be unchanged (the tables 5.0 drops
#      must have been empty), no residue, every attack refused and the posture
#      checks passing - the same bar the fresh lane clears.
#
#   .\upgrade.ps1
#   .\upgrade.ps1 -Baseline ../supabase/legacy-4.10 -Release ../supabase
param(
  [string]$Baseline = '../supabase/legacy-4.10',
  # The release applied over the baseline. Defaults to the working tree.
  [string]$Release
)

$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

if (-not (Test-Path (Join-Path $PSScriptRoot "$Baseline/core.sql"))) {
  Write-Host ("ABORT: no 4.10 snapshot at {0}" -f $Baseline) -ForegroundColor Red
  exit 2
}

function Psql {
  param([string]$File, [string]$Sql, [switch]$OneTransaction)
  $args2 = @('-v', 'ON_ERROR_STOP=1', '--no-psqlrc', '-U', 'postgres', '-d', 'postgres', '-h', '127.0.0.1')
  if ($OneTransaction) { $args2 += '--single-transaction' }
  if ($File) { $args2 += @('-f', $File) } else { $args2 += @('-c', $Sql) }
  docker compose exec -T -e PGPASSWORD=postgres db psql @args2 2>&1 | Out-String
}

function Get-Scalar {
  param([string]$Sql)
  (docker compose exec -T -e PGPASSWORD=postgres db `
    psql -tAq --no-psqlrc -U postgres -d postgres -h 127.0.0.1 -c $Sql 2>$null | Out-String).Trim()
}

function Get-RowCounts {
  $lines = docker compose exec -T -e PGPASSWORD=postgres db `
    psql -tAq -F '|' --no-psqlrc -U postgres -d postgres -h 127.0.0.1 -f /sql/row-counts.sql 2>$null
  $map = @{}
  foreach ($l in $lines) {
    $p = "$l".Trim() -split '\|'
    if ($p.Count -eq 3) { $map[$p[0]] = @{ Name = $p[1]; Rows = [long]$p[2] } }
  }
  return $map
}

$script:Failures = @()

# ---------------------------------------------------------------------------
# 1. The 4.10 snapshot, seeded and verified at 112.
# ---------------------------------------------------------------------------
Write-Host "=== UPGRADE LANE: installing the 4.10 snapshot ($Baseline) ===" -ForegroundColor Yellow
$env:BASELINE_DIR = $Baseline
if ($Release) { $env:RELEASE_DIR = $Release }
else          { Remove-Item Env:\RELEASE_DIR -ErrorAction SilentlyContinue }

# reset.ps1 and install.ps1 report failure by throwing rather than by exit code:
# psql writes NOTICEs to stderr, so $LASTEXITCODE after them means nothing here.
try {
  & "$PSScriptRoot\reset.ps1" -Root /baseline -NoVerify
} catch {
  Write-Host ("ABORT: the 4.10 snapshot would not install: {0}" -f $_) -ForegroundColor Red
  exit 2
}
$v = Psql -File '/baseline/tools/verify-schema.sql'
$stamped = Get-Scalar 'SELECT version FROM schema_version WHERE id = 1'
if ($stamped -ne '112') {
  Write-Host ("ABORT: the 4.10 snapshot verifies to {0}, not 112; 0500 requires a verified 112 database." -f $stamped) -ForegroundColor Red
  Write-Host (($v -split "`n" | Select-String -Pattern 'WARNING|ERROR') -join "`n")
  exit 2
}
Write-Host "the 4.10 snapshot is seeded and stamped 112" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 2-3. Count, then upgrade in one transaction.
# ---------------------------------------------------------------------------
$before = Get-RowCounts
Write-Host ("rows before: {0} table(s), {1} row(s)" -f $before.Count, (($before.Values | ForEach-Object { $_.Rows }) | Measure-Object -Sum).Sum)

Write-Host "`n=== APPLYING migrations/0500_from_4x.sql (one transaction) ===" -ForegroundColor Yellow
$t = Get-Date
$mig = Psql -File '/blueplm/migrations/0500_from_4x.sql' -OneTransaction
$elapsed = ((Get-Date) - $t).TotalSeconds
if ($mig -cmatch 'ERROR:') {
  Write-Host "FAIL: 0500_from_4x.sql did not apply:" -ForegroundColor Red
  Write-Host (($mig -split "`n" | Select-String -Pattern 'ERROR|CONTEXT|LINE' | Select-Object -First 20) -join "`n")
  exit 1
}
Write-Host ("applied in {0:N1} s" -f $elapsed) -ForegroundColor Green
($mig -split "`n" | Select-String -Pattern '0500:' | Select-Object -First 20) | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

# PostgREST cached the 4.x schema at startup; every function name changed.
. "$PSScriptRoot\rest-ready.ps1"
Invoke-RestSchemaReload -ExpectRpc 'file_share_link_consume' | Out-Null

# ---------------------------------------------------------------------------
# 4. Verify and stamp.
# ---------------------------------------------------------------------------
Write-Host "`n=== VERIFICATION AFTER THE UPGRADE ===" -ForegroundColor Yellow
$verify = Psql -File '/blueplm/tools/verify-schema.sql'
Write-Host (($verify -split "`n" | Select-String -Pattern 'NOTICE|WARNING|ERROR') -join "`n")
$target = Get-Scalar 'SELECT schema_release_version()'
$stamped = Get-Scalar 'SELECT version FROM schema_version WHERE id = 1'
Write-Host ("release under test: {0}    stamped version: {1}" -f $target, $stamped)
if ($verify -match 'Schema verification failed') {
  $script:Failures += 'verification refused after the upgrade'
}
if ($stamped -ne $target) {
  $script:Failures += "stamped $stamped rather than $target"
}

# ---------------------------------------------------------------------------
# 5. Rows, residue, attacks, posture.
# ---------------------------------------------------------------------------
Write-Host "`n=== ROW COUNTS ACROSS THE UPGRADE (by oid) ===" -ForegroundColor Yellow
$after = Get-RowCounts
foreach ($oid in $before.Keys) {
  $b = $before[$oid]
  if (-not $after.ContainsKey($oid)) {
    if ($b.Rows -ne 0) { $script:Failures += ("{0} was dropped with {1} row(s)" -f $b.Name, $b.Rows) }
    else { Write-Host ("  dropped (empty): {0}" -f $b.Name) -ForegroundColor DarkGray }
    continue
  }
  $a = $after[$oid]
  if ($a.Rows -ne $b.Rows) {
    $script:Failures += ("{0} -> {1}: {2} row(s) before, {3} after" -f $b.Name, $a.Name, $b.Rows, $a.Rows)
  }
}
foreach ($oid in $after.Keys) {
  if (-not $before.ContainsKey($oid)) { Write-Host ("  new in 5.0: {0} ({1} row(s))" -f $after[$oid].Name, $after[$oid].Rows) -ForegroundColor DarkGray }
}

Write-Host "`n=== RESIDUE AFTER THE UPGRADE ===" -ForegroundColor Yellow
$residue = Psql -File '/sql/residue-report.sql'
Write-Host $residue
if ($residue -match 'RESIDUE PRESENT') { $script:Failures += 'residue present after the upgrade' }

Write-Host "`n=== ATTACKS AFTER THE UPGRADE ===" -ForegroundColor Yellow
& powershell -NoProfile -File "$PSScriptRoot\attack.ps1" -Expect fixed
if ($LASTEXITCODE -ne 0) { $script:Failures += 'attacks still succeed after the upgrade' }

Write-Host "`n=== POSTURE CHECKS AFTER THE UPGRADE ===" -ForegroundColor Yellow
$posture = Psql -File '/sql/posture-checks.sql'
if ($posture -match 'POSTURE CHECKS PASSED') {
  $flat = ($posture -replace '\s+', ' ')
  [regex]::Matches($flat, 'PASS - [^.]+\.') | ForEach-Object { Write-Host ("  " + $_.Value) -ForegroundColor Green }
} else {
  Write-Host $posture -ForegroundColor Red
  $script:Failures += 'posture checks failed after the upgrade'
}

Remove-Item Env:\BASELINE_DIR -ErrorAction SilentlyContinue
Remove-Item Env:\RELEASE_DIR -ErrorAction SilentlyContinue

Write-Host ""
if ($script:Failures.Count -gt 0) {
  Write-Host ("FAIL (upgrade lane 112 -> {0}): {1}" -f $target, ($script:Failures -join '; ')) -ForegroundColor Red
  exit 1
}
Write-Host ("OK (upgrade lane 112 -> {0}): 0500 applied in one transaction, every table kept its rows, verified, stamped {0}, and refused every attack." -f $target) -ForegroundColor Green
exit 0
