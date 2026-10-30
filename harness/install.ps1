# Install a BluePLM release into the harness the way the migration runner does a
# fresh database: as `postgres`, core.sql then every module in file-name order,
# in ONE psql session and ONE transaction, then tools/verify-schema.sql.
#
#   .\install.ps1                    the release under test (/blueplm)
#   .\install.ps1 -Root /baseline    the release mounted at /baseline
#   .\install.ps1 -NoVerify          skip the verification (the upgrade lane
#                                    verifies the 4.10 snapshot itself)
#
# 5.0: the baseline is one ordered set, not core plus optional modules, and it is
# not idempotent - a file applied twice fails on its first CREATE TABLE. So there
# is no -CoreOnly or module subset any more, and nothing re-runs a file over an
# installed database: an upgrade is supabase/migrations/ (see upgrade.ps1), and a
# negative control repairs only the objects it broke (see make-repairs.ps1).
param(
  [string]$Root = '/blueplm',
  [switch]$NoVerify
)

# psql writes NOTICEs to stderr, which PowerShell would otherwise turn into
# terminating errors before the exit code is ever consulted.
$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot

$modules = (docker compose exec -T db sh -c "ls $Root/modules/*.sql" 2>$null) |
  ForEach-Object { $_.Trim() } | Where-Object { $_ -like '*.sql' } | Sort-Object
if (-not $modules -or $modules.Count -eq 0) { throw "no modules found under $Root/modules" }

$fileArgs = @('-f', "$Root/core.sql")
foreach ($m in $modules) { $fileArgs += @('-f', $m) }

Write-Host ("--- postgres : {0}/core.sql + {1} module(s), one transaction" -f $Root, $modules.Count) -ForegroundColor Cyan
$out = docker compose exec -T -e PGPASSWORD=postgres db `
  psql -v ON_ERROR_STOP=1 --single-transaction --no-psqlrc -U postgres -d postgres -h 127.0.0.1 @fileArgs 2>&1
$code = $LASTEXITCODE
$out | Select-String -Pattern 'ERROR|FATAL' | Select-Object -First 25 | ForEach-Object { Write-Host $_ -ForegroundColor Red }
if ($code -ne 0) { throw "FAILED: install of $Root (exit $code)" }

if (-not $NoVerify) {
  Write-Host "--- postgres : $Root/tools/verify-schema.sql" -ForegroundColor Cyan
  $v = docker compose exec -T -e PGPASSWORD=postgres db `
    psql -v ON_ERROR_STOP=1 --no-psqlrc -U postgres -d postgres -h 127.0.0.1 -f "$Root/tools/verify-schema.sql" 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0 -or $v -match 'Schema verification failed') {
    ($v -split "`n" | Select-String -Pattern 'WARNING|ERROR' | Select-Object -First 25) | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    throw "FAILED: $Root does not verify after a fresh install"
  }
}
Write-Host "install complete" -ForegroundColor Green
