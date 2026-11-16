# Most szól (Windows médiavezérlő / SMTC): a Spotify munkamenet (ha nincs, a Windows aktuális lejátszója)
# Használat: nowplaying.ps1 [-Action info|toggle|play|pause|next|prev|shuffle] [-Art]
# Kimenet: egy sor JSON
param([string]$Action = 'info', [switch]$Art)
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  function Await($op, [Type]$t) { $task = $asTaskGeneric.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(4000) | Out-Null; $task.Result }
  [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
  $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  $s = $mgr.GetSessions() | Where-Object { $_.SourceAppUserModelId -match 'Spotify' } | Select-Object -First 1
  $isSpotify = $null -ne $s
  if (-not $s) { $s = $mgr.GetCurrentSession() }
  if (-not $s) { $s = $mgr.GetSessions() | Select-Object -First 1 }
  if (-not $s) { '{"session":false}'; exit 0 }
  switch ($Action) {
    'toggle' { Await ($s.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
    'play' { Await ($s.TryPlayAsync()) ([bool]) | Out-Null }
    'pause' { Await ($s.TryPauseAsync()) ([bool]) | Out-Null }
    'next' { Await ($s.TrySkipNextAsync()) ([bool]) | Out-Null }
    'prev' { Await ($s.TrySkipPreviousAsync()) ([bool]) | Out-Null }
    'shuffle' { $cur = $s.GetPlaybackInfo().IsShuffleActive; Await ($s.TryChangeShuffleActiveAsync(-not $cur)) ([bool]) | Out-Null }
  }
  if ($Action -ne 'info') { Start-Sleep -Milliseconds 450 }
  $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $pb = $s.GetPlaybackInfo()
  $tl = $s.GetTimelineProperties()
  $art = $null
  if ($Art -and $p.Thumbnail) {
    try {
      $st = Await ($p.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
      $ns = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($st)
      $ms = New-Object System.IO.MemoryStream
      $ns.CopyTo($ms)
      $art = 'data:image/jpeg;base64,' + [Convert]::ToBase64String($ms.ToArray())
    } catch { }
  }
  [pscustomobject]@{
    session = $true
    spotify = $isSpotify
    app = $s.SourceAppUserModelId
    title = $p.Title
    artist = $p.Artist
    album = $p.AlbumTitle
    playing = ($pb.PlaybackStatus -eq 'Playing')
    shuffle = [bool]$pb.IsShuffleActive
    pos = [int]$tl.Position.TotalSeconds
    len = [int]$tl.EndTime.TotalSeconds
    art = $art
  } | ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{ session = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
