param(
  [string]$InstallRoot = "$env:LOCALAPPDATA\AuraHome",
  [string]$Branch = "feat/light-first-command-centre",
  [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'
$repo = Join-Path $InstallRoot 'repo'
$update = Join-Path $repo 'deploy\windows\Update-AuraWall.ps1'
$logDir = Join-Path $InstallRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (Test-Path $update) {
  try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $update -InstallRoot $InstallRoot -Branch $Branch } catch {}
}

if (-not (Test-Path (Join-Path $repo 'index.html'))) {
  throw "AURA index.html was not found at $repo"
}

$python = Get-Command python -ErrorAction SilentlyContinue
$py = Get-Command py -ErrorAction SilentlyContinue
if ($python) {
  Start-Process -WindowStyle Hidden -FilePath $python.Source -ArgumentList '-m','http.server',"$Port",'--directory',"`"$repo`""
} elseif ($py) {
  Start-Process -WindowStyle Hidden -FilePath $py.Source -ArgumentList '-3','-m','http.server',"$Port",'--directory',"`"$repo`""
} else {
  throw 'Python is required to serve AURA locally. Install Python 3 or add a local web server.'
}

Start-Sleep -Seconds 2
$url = "http://127.0.0.1:$Port/"
$edge = Get-Command msedge.exe -ErrorAction SilentlyContinue
if (-not $edge) {
  $candidate = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
  if (Test-Path $candidate) { $edge = Get-Item $candidate }
}
if ($edge) {
  Start-Process -FilePath $edge.Source -ArgumentList '--kiosk', $url, '--edge-kiosk-type=fullscreen', '--no-first-run'
} else {
  Start-Process $url
}
