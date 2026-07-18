# AURA Local Gateway

This is the Alpha 0.4 local Home Assistant gateway. It keeps Home Assistant tokens out of browser JavaScript and source control, exposes read-only discovery by default, and only permits commands for explicitly allowlisted low-risk entities.

## Run

Command Prompt:

```bat
set HA_BASE_URL=http://homeassistant.local:8123
set HA_TOKEN=your-local-long-lived-token
set AURA_ENTITY_ALLOWLIST=light.living_room,media_player.lounge
set AURA_ALLOWED_ORIGINS=http://localhost:8080
node gateway/local-gateway.js
```

PowerShell:

```powershell
$env:HA_BASE_URL = "http://homeassistant.local:8123"
$env:HA_TOKEN = "your-local-long-lived-token"
$env:AURA_ENTITY_ALLOWLIST = "light.living_room,media_player.lounge"
$env:AURA_ALLOWED_ORIGINS = "http://localhost:8080"
node gateway/local-gateway.js
```

Then open AURA, choose **Configure gateway**, enter `http://localhost:8787`, enable the gateway and check health.

## Environment settings

- `HA_BASE_URL`: local Home Assistant URL.
- `HA_TOKEN`: Home Assistant long-lived access token. Never put this in browser storage or committed files.
- `AURA_ENTITY_ALLOWLIST`: comma-separated Home Assistant entity IDs that AURA may control. If omitted, the gateway remains live but read-only.
- `AURA_ALLOWED_ORIGINS`: comma-separated browser origins allowed to call the gateway. Defaults to `http://localhost:8080,http://127.0.0.1:8080`.
- `AURA_GATEWAY_PORT`: local gateway port. Defaults to `8787`.
- `AURA_GATEWAY_TIMEOUT_MS`: Home Assistant request timeout. Defaults to `7000`.
- `AURA_CONFIRM_TIMEOUT_MS`: maximum wait for confirmed device state. Defaults to `10000`.
- `AURA_CONFIRM_POLL_MS`: state confirmation polling interval. Defaults to `650`.

## Endpoints

- `GET /health`: reports Home Assistant reachability, entity counts, allowlisted counts and whether commands are enabled.
- `GET /entities`: returns normalised Home Assistant entities with risk, allowlist and controllable flags.
- `GET /commands`: returns recent in-memory command records.
- `POST /commands`: submits an allowlisted low-risk command and returns a command ID in `pending` state.
- `GET /commands/:id`: returns the latest command state and confirmation evidence.

## Command lifecycle

AURA uses these states:

- `blocked`: the entity, service or safety domain is not permitted.
- `sent`: the gateway created the command and is sending it.
- `pending`: Home Assistant accepted the service call, but the expected state is not confirmed yet.
- `confirmed`: Home Assistant reported the expected state.
- `failed`: the service call or status request failed.
- `timed_out`: the expected state was not confirmed before the configured deadline.

The browser does not optimistically update a real device. It waits for `GET /commands/:id` to report `confirmed`, then refreshes entity state.

## Safety boundaries

- Commands require both a low-risk domain/service and an exact entity ID in `AURA_ENTITY_ALLOWLIST`.
- Locks, alarms, covers and cameras remain blocked.
- Tokens never enter the frontend bundle or browser local storage.
- Browser origins are restricted to the configured local origins.
- AURA never reports success solely because a service call returned successfully.
- Commands are stored in memory only and are cleared when the gateway restarts.

## Tests

Run the built-in static tests:

```bash
node --test gateway/local-gateway.test.js
```

Physical Home Assistant, wall-PC, camera, microphone and kiosk behaviour still require local hardware validation.
