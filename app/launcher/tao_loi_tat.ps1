param([string]$Root = 'C:\ShotBuilder')
# Tao loi tat Shot Builder tren Desktop va Start Menu.
$ws = New-Object -ComObject WScript.Shell
$desk = [Environment]::GetFolderPath('Desktop')
$ico = Join-Path $Root 'shotbuilder.ico'
$exe = Join-Path $Root 'Shot Builder.exe'
if (Test-Path $exe) { $target = $exe } else { $target = Join-Path $Root 'Mo Shot Builder.bat' }
function Make($path, $tgt) {
  $s = $ws.CreateShortcut($path)
  $s.TargetPath = $tgt
  $s.WorkingDirectory = $Root
  if (Test-Path $ico) { $s.IconLocation = "$ico,0" }
  $s.Description = 'Shot Builder - lam phim What If'
  $s.Save()
}
Make (Join-Path $desk 'Shot Builder.lnk') $target
Make (Join-Path $desk 'Shot Builder - Chay hang loat.lnk') (Join-Path $Root 'Chay hang loat (keo file vao day).bat')
Make (Join-Path ([Environment]::GetFolderPath('Programs')) 'Shot Builder.lnk') $target
Write-Output ("Loi tat da tao tren Desktop: " + $desk)
