# AURA Windows wall-PC deployment

This deployment keeps a dedicated Windows PC synced to a selected GitHub branch and launches AURA locally in Microsoft Edge kiosk mode.

## Requirements

- Windows 10/11
- Git in PATH
- Python 3 in PATH (used only as a local static web server)
- Microsoft Edge recommended
- Internet access when checking GitHub for updates
- Local network access to the AURA Home Assistant gateway when configured

## Development branch installation

Open PowerShell and run the installer from a local copy of this repository:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\windows\Install-AuraWall.ps1 -Branch feat/light-first-command-centre
```

The installer:

1. Creates `%LOCALAPPDATA%\AuraHome`.
2. Clones or refreshes the selected branch.
3. Registers the `AURA Home Wall Display` scheduled task at Windows logon.
4. Updates the local checkout before each launch.
5. Serves the app only on `127.0.0.1:8765`.
6. Launches Microsoft Edge in full-screen kiosk mode.

## Updating

The launcher automatically runs `Update-AuraWall.ps1` before starting Aura. The current Git commit is written to:

`%LOCALAPPDATA%\AuraHome\current-build.txt`

Update logs are written under:

`%LOCALAPPDATA%\AuraHome\logs`

## Production switch

During active development the wall PC may track `feat/light-first-command-centre`. After the release is validated and merged, reinstall or change the scheduled task to use `main` so the display receives only approved releases.

## Safety

The deployment scripts do not contain or request a Home Assistant token. Home Assistant credentials remain in the separate local gateway environment. The browser continues to talk only to the configured local gateway.
