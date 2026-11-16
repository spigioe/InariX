# InariX eltavolito: visszaallitja a fedel beallitast, kiveszi az automatikus inditasbol,
# torli a parancsikonokat es az app mappajat. A beallitasok torlese opcionalis.
param([switch]$KeepSettings, [switch]$Quiet)
$dir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$exe = Join-Path $dir 'InariX.exe'

# Rendszergazdai mod: ha letezik a "InariX Host" utemezett feladat, emelt joggal futunk tovabb
# (kulonben a rendszergazdakent futo InariX-et le sem tudnank allitani)
schtasks /Query /TN "InariX Host" *> $null
$adminTask = ($LASTEXITCODE -eq 0)
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($adminTask -and -not $isAdmin) {
  Write-Host '  A rendszergazdai mod visszaallitasahoz jovahagyas kell (UAC)...'
  $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $MyInvocation.MyCommand.Path)
  if ($KeepSettings) { $argList += '-KeepSettings' }
  if ($Quiet) { $argList += '-Quiet' }
  try { Start-Process powershell -Verb RunAs -Wait -ArgumentList $argList } catch { Write-Host '  Jovahagyas nelkul nem folytathato.' }
  exit
}
if ($adminTask) {
  Unregister-ScheduledTask -TaskName 'InariX Host' -Confirm:$false -ErrorAction SilentlyContinue
  New-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name PromptOnSecureDesktop -Value 1 -PropertyType DWord -Force | Out-Null
  Write-Host '  Rendszergazdai mod visszaallitva (utemezett feladat torolve, UAC biztonsagi asztal vissza).'
}

Write-Host ''
Write-Host '  InariX eltavolitasa'
Write-Host ''

Get-Process InariX -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($dir, [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force
Start-Sleep -Seconds 1

# Takaritas az appal: eredeti fedel muvelet visszaallitasa, autostart es parancsikonok torlese
if (Test-Path $exe) { Start-Process $exe -ArgumentList '--cleanup' -Wait }

# Biztonsagi halo: minden InariX.exe-re mutato Run bejegyzes torlese
$run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$props = Get-ItemProperty $run -ErrorAction SilentlyContinue
if ($props) {
  foreach ($p in $props.PSObject.Properties) {
    if ("$($p.Value)" -like '*InariX.exe*') { Remove-ItemProperty $run -Name $p.Name -ErrorAction SilentlyContinue }
  }
}
foreach ($l in @((Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\InariX.lnk'), (Join-Path ([Environment]::GetFolderPath('Desktop')) 'InariX.lnk'))) {
  Remove-Item $l -ErrorAction SilentlyContinue
}

$answer = if ($KeepSettings -or $Quiet) { 'n' } else { Read-Host '  Torold a beallitasokat es a jatekstatisztikat is? (i/n)' }
if ($answer -match '^[iIyY]') {
  Remove-Item (Join-Path $env:APPDATA 'InariX') -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host '  Beallitasok torolve.'
}

Write-Host '  Megjegyzes: ha Host modban tuzfal szabalyt hoztal letre, azt a Windows Defender tuzfalban'
Write-Host '  "InariX Host" neven talalod (torleshez rendszergazdai jog kell).'

# Az app mappajanak torlese - csak ha tenyleg a InariX mappaja (exe + resources)
if ((Test-Path $exe) -and (Test-Path (Join-Path $dir 'resources\app'))) {
  Start-Process cmd.exe -ArgumentList "/c timeout /t 2 /nobreak >nul & rmdir /s /q `"$dir`"" -WindowStyle Hidden
  Write-Host "  App mappa torlese: $dir"
}
Write-Host '  Kesz.'
Write-Host ''
