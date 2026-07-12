# AURA Local Gateway

This is the Alpha 0.4 local Home Assistant gateway foundation. It keeps Home Assistant tokens out of browser JavaScript and source control.

## Run

```bash
set HA_BASE_URL=http://homeassistant.local:8123
set HA_TOKEN=your-local-long-lived-token
node gateway/local-gateway.js
```

PowerShell:

```powershell
$env:HA_BASE_URL = "http://homeassistant.local:8123"
$env:HA_TOKEN = "your-local-long-lived-token"
node gateway/local-gateway.js
```

Then open AURA, choose **Configure gateway**, enter `http://localhost:8787`, enable the gateway and check health.

## Endpoints

- `GET /health`
- `GET /entities`
- `POST /commands`

The command endpoint only allows low-risk domains in this first slice: `light`, `media_player`, `switch`, `fan` and `climate`. Locks, alarms, covers and cameras are blocked until AURA has household permissions, confirmation policy and stronger audit controls.

## Safety

- Do not commit `HA_TOKEN`.
- Do not put Home Assistant tokens in the browser.
- Do not claim a real device changed state unless Home Assistant confirms it.
