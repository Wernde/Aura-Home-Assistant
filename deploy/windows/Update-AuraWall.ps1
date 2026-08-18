param(
  [string]$InstallRoot = "$env:LOCALAPPDATA\AuraHome",
  [string]$Branch = "feat/light-first-command-centre"
)

$ErrorActionPreference = 'Stop'
$repo = Join-Path $InstallRoot 'repo'
$logDir = Join-Path $InstallRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir 'update.log'

function Log($message) {
  $line = "$(Get-Date -Format s) $message"
  Add-Content -Path $logFile -Value $line
  Write-Host $line
}

if (-not (Test-Path (Join-Path $repo '.git'))) {
  throw "AURA repository is not installed at $repo. Run Install-AuraWall.ps1 first."
}

Push-Location $repo
try {
  Log "Fetching origin/$Branch"
  git fetch origin $Branch 2>&1 | ForEach-Object { Log $_ }
  git checkout $Branch 2>&1 | ForEach-Object { Log $_ }
  git reset --hard "origin/$Branch" 2>&1 | ForEach-Object { Log $_ }
  $sha = git rev-parse HEAD
  Set-Content -Path (Join-Path $InstallRoot 'current-build.txt') -Value $sha
  Log "Updated AURA to $sha"
} finally {
  Pop-Location
}
