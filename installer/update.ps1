# InariX frissito: a forras gep (update-server) IP-je alapjan letolti, ellenorzi es telepiti a legfrissebb csomagot.
# Hasznalat:  Frissites.cmd [IP] [-Pin 123456] [-Force]
# A PIN-t a InariX beallitasaibol veszi (a hozzaadott gep PIN-je), vagy megkerdezi. Az IP-t megjegyzi.
param(
  [Parameter(Position = 0)][string]$Server,
  [int]$Port = 47810,
  [string]$Pin,
  [string]$Target,
  [switch]$Force,
  [switch]$NoStart,
  [switch]$NoPause
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # gyorsabb letoltes (a progress bar nagyon lassitja)

function Done([int]$code) {
  if (-not $NoPause) { Write-Host ''; Read-Host '  Nyomj Entert a bezarashoz' | Out-Null }
  exit $code
}
function Fail([string]$msg) { Write-Host "  HIBA: $msg" -ForegroundColor Red; Done 1 }

if (-not $Target) { $Target = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path) }
$exe = Join-Path $Target 'InariX.exe'
# Biztonsag: csak tenyleges InariX mappat irunk felul
if (-not ((Test-Path $exe) -and (Test-Path (Join-Path $Target 'resources\app')))) { Fail "Ez nem InariX telepitesi mappa: $Target" }

Write-Host ''
Write-Host '  InariX frissites'
Write-Host ''

# --- Forras gep es PIN ---
$stateDir = Join-Path $env:APPDATA 'InariX'
$stateFile = Join-Path $stateDir 'update-source.json'
$saved = $null
if (Test-Path $stateFile) { try { $saved = Get-Content $stateFile -Raw | ConvertFrom-Json } catch { $saved = $null } }
if (-not $Server -and $saved) { $Server = $saved.server; if (-not $PSBoundParameters.ContainsKey('Port') -and $saved.port) { $Port = [int]$saved.port } }
if (-not $Server) { $Server = (Read-Host '  A forras gep IP-cime (pl. 192.168.1.20)').Trim() }
if (-not $Server) { Fail 'Nincs megadva IP-cim' }

if (-not $Pin) {
  # a InariX-ben mar hozzaadott gep PIN-je
  $cfgFile = Join-Path $stateDir 'config.json'
  if (Test-Path $cfgFile) {
    try {
      $cfg = Get-Content $cfgFile -Raw -Encoding UTF8 | ConvertFrom-Json
      $h = @($cfg.hosts) | Where-Object { $_.address -eq $Server -or $_.streamHost -eq $Server } | Select-Object -First 1
      if ($h -and $h.token) { $Pin = [string]$h.token }
    } catch { }
  }
}
if (-not $Pin -and $saved -and $saved.server -eq $Server) { $Pin = [string]$saved.pin }
if (-not $Pin) { $Pin = (Read-Host '  PIN (a forras gepen az update-server kiirja)').Trim() }

$base = "http://$($Server):$Port"
$headers = @{ 'X-InariX-Token' = $Pin }

# --- Manifest ---
try {
  $m = Invoke-RestMethod -Uri "$base/manifest" -Headers $headers -TimeoutSec 8 -UseBasicParsing
} catch {
  $status = $null
  try { $status = [int]$_.Exception.Response.StatusCode } catch { }
  if ($status -eq 401) { Fail 'Hibas PIN' }
  if ($status -eq 404) { Fail 'A forras gepen nincs csomag (futtasd ott: npm run package)' }
  Fail "A forras gep nem erheto el: $base (fut rajta az npm run update-server? tuzfal?)"
}

New-Item -ItemType Directory -Force $stateDir | Out-Null
@{ server = $Server; port = $Port; pin = $Pin } | ConvertTo-Json | Set-Content $stateFile -Encoding UTF8

$cur = $null
$curFile = Join-Path $Target 'build.json'
if (Test-Path $curFile) { try { $cur = Get-Content $curFile -Raw | ConvertFrom-Json } catch { } }
$curBuild = if ($cur) { [string]$cur.build } else { 'ismeretlen' }
Write-Host "  Telepitett : $curBuild$(if ($cur) { " ($($cur.commit))" })"
Write-Host "  Elerheto   : $($m.build) ($($m.commit)) - $([math]::Round($m.size / 1MB)) MB"

if (-not $Force -and $cur -and ([string]::CompareOrdinal([string]$cur.build, [string]$m.build) -ge 0)) {
  Write-Host ''
  Write-Host '  Mar a legfrissebb verzio van telepitve. (Ujratelepites: -Force)' -ForegroundColor Green
  Done 0
}

# --- Letoltes es ellenorzes ---
$tmp = Join-Path $env:TEMP "InariX-update-$($m.build)"
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Force $tmp | Out-Null
$zip = Join-Path $tmp 'package.zip'
Write-Host ''
Write-Host '  Letoltes...'
try {
  Invoke-WebRequest -Uri "$base/package" -Headers $headers -OutFile $zip -UseBasicParsing -TimeoutSec 900
} catch { Fail "Letoltesi hiba: $($_.Exception.Message)" }
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
if ($hash -ne ([string]$m.sha256).ToLower()) { Remove-Item $tmp -Recurse -Force; Fail 'A letoltott fajl serult (hash elteres), probald ujra' }
Write-Host '  Ellenorzes: OK (SHA-256)'

Write-Host '  Kicsomagolas...'
$x = Join-Path $tmp 'x'
Expand-Archive -Path $zip -DestinationPath $x -Force
if (-not (Test-Path (Join-Path $x 'InariX.exe'))) { Fail 'A csomagban nincs InariX.exe' }

# --- Csere ---
Write-Host '  InariX leallitasa...'
$procs = Get-Process InariX -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($Target, [StringComparison]::OrdinalIgnoreCase) }
$wasRunning = [bool]$procs
if ($procs) { $procs | Stop-Process -Force; $procs | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800

Write-Host '  Fajlok frissitese...'
robocopy $x $Target /MIR /NFL /NDL /NJH /NJS /NP /R:3 /W:1 | Out-Null
$rc = $LASTEXITCODE
if ($rc -ge 8) {
  if ($wasRunning -and -not $NoStart) { Start-Process $exe }
  Fail "Fajlmasolasi hiba (robocopy: $rc). Fut meg valahol a InariX?"
}
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host "  Kesz! Frissitve: $($m.build) ($($m.commit))" -ForegroundColor Green
if (-not $NoStart) { Start-Process $exe }
Done 0
