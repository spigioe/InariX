# InariX telepito: a kicsomagolt mappabol a %LOCALAPPDATA%\Programs\InariX mappaba masol,
# parancsikonokat hoz letre es elinditja az appot. Rendszergazdai jog nem kell.
param(
  [string]$Target = (Join-Path $env:LOCALAPPDATA 'Programs\InariX'),
  [switch]$NoShortcuts,
  [switch]$NoStart
)
$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$dst = $Target
$srcExe = Join-Path $src 'InariX.exe'

if (-not (Test-Path $srcExe)) { Write-Host "Hiba: nem talalhato a InariX.exe itt: $src"; exit 1 }

Write-Host ''
Write-Host '  InariX telepitese'
Write-Host "  Cel: $dst"
Write-Host ''

# Futo peldany leallitasa (frissiteskor) - csak a celmappabol futo InariX
Get-Process InariX -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($dst, [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force
Start-Sleep -Seconds 1

if ((Resolve-Path $src).Path.TrimEnd('\') -ne $dst.TrimEnd('\')) {
  New-Item -ItemType Directory -Force $dst | Out-Null
  robocopy $src $dst /MIR /NFL /NDL /NJH /NJS /NP /R:2 /W:1 | Out-Null
  if ($LASTEXITCODE -ge 8) { Write-Host "Hiba a masolas kozben (robocopy: $LASTEXITCODE)"; exit 1 }
}

$exe = Join-Path $dst 'InariX.exe'
$ws = New-Object -ComObject WScript.Shell
$links = @(
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\InariX.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'InariX.lnk')
)
if ($NoShortcuts) { $links = @() }
foreach ($l in $links) {
  $s = $ws.CreateShortcut($l)
  $s.TargetPath = $exe
  $s.WorkingDirectory = $dst
  $s.IconLocation = "$exe,0"
  $s.Description = 'InariX konzol'
  $s.Save()
}

Write-Host '  Kesz! Parancsikon az asztalon es a Start menuben.'
Write-Host '  A InariX mostantol a Windows-zal egyutt indul a hatterben.'
Write-Host '  Eltavolitas: Eltavolitas.cmd a telepitesi mappaban.'
Write-Host ''
if (-not $NoStart) { Start-Process $exe }
