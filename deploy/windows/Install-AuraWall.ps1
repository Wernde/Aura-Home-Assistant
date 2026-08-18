param(
  [string]$InstallRoot = "$env:LOCALAPPDATA\AuraHome",
  [string]$Branch = "feat/light-first-command-centre",
  [string]$RepoUrl = "https://github.com/Wernde/Aura-Home-Assistant.git",
  [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'
$repo = Join-Path $InstallRoot 'repo'
$log = Join-Path $InstallRoot 'logs'
New-Item -ItemType Directory -Force -Path $InstallRoot,$log | Out-Null

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name is required but was not found in PATH."
  }
}

Require-Command git
Require-Command powershell

if (-not (Test-Path (Join-Path $repo '.git'))) {
  git clone --branch $Branch --single-branch $RepoUrl $repo
} else {
  Push-Location $repo
  git fetch origin $Branch
  git checkout $Branch
  git reset --hard "origin/$Branch"
  Pop-Location
}

$launcher = Join-Path $repo 'deploy\windows\Start-AuraWall.ps1'
$updater = Join-Path $repo 'deploy\windows\Update-AuraWall.ps1'

$taskName = 'AURA Home Wall Display'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`" -InstallRoot `"$InstallRoot`" -Branch `"$Branch`" -Port $Port"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Launch AURA Home Assistant wall display and refresh the selected Git branch.' -Force | Out-Null

Write-Host "AURA wall deployment installed."
Write-Host "Install root: $InstallRoot"
Write-Host "Branch: $Branch"
Write-Host "Scheduled task: $taskName"
Write-Host "Starting AURA now..."
Start-Process powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$launcher`"",'-InstallRoot',"`"$InstallRoot`"",'-Branch',"`"$Branch`"",'-Port',"$Port"
