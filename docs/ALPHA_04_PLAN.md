# Alpha 0.4 Plan: Local Home Gateway

Alpha 0.4 connects AURA to a local Home Assistant test instance through a disabled-by-default configuration layer. The goal is real device discovery, room mapping, command status and confirmed state without adding a paid AI API.

## Goals

- Preserve all Alpha 0.3 local-only behaviour.
- Add a local Home Assistant configuration layer that is off by default.
- Discover and display real entities from a configured Home Assistant instance.
- Map entities to AURA rooms, controls and scenes.
- Implement a confirmed state lifecycle: sent, pending, confirmed, failed and timed out.
- Keep secrets out of browser JavaScript and source control.
- Provide clear simulated, cached, live and unavailable labels.
- Document setup, privacy, known limitations and rollback.

## Non-Goals

- No paid AI API or cloud AI requirement.
- No unrestricted autonomous control of security-critical devices.
- No browser-embedded Home Assistant long-lived tokens.
- No identity recognition or biometric profile system.
- No production purchasing, banking, medical, legal or unrestricted security automation.
- No claim that a real device changed state until Home Assistant confirms it.

## Architecture Direction

Alpha 0.4 should introduce a local gateway boundary instead of connecting the browser directly to private tokens.

Recommended shape:

1. Wall UI keeps the current PWA experience and shows Home Assistant status when configured.
2. Local gateway service stores Home Assistant connection details outside the frontend bundle.
3. Gateway exposes a narrow local API for rooms, entities, scenes, commands and confirmed state.
4. AURA command handling routes supported home intents to the gateway only when integration is enabled.
5. The UI falls back to simulated controls if the gateway is disabled or unavailable.

Initial local API concepts:

- `GET /health`
- `GET /rooms`
- `GET /entities`
- `GET /scenes`
- `POST /commands`
- `GET /commands/:id`

Command status model:

- `draft`: AURA has resolved an intent but has not sent it.
- `blocked`: Permission or safety policy prevents sending.
- `sent`: Command was submitted to the gateway.
- `pending`: Gateway is waiting for Home Assistant state confirmation.
- `confirmed`: Target state was verified.
- `failed`: Home Assistant rejected the command or returned an error.
- `timed_out`: Confirmation did not arrive within the expected window.

## Milestones

### 1. Configuration And Safety Shell

- Add a disabled-by-default Home Assistant integration setting.
- Document required local URL, token handling and network assumptions.
- Add `.env.example` or local config documentation without real secrets.
- Add UI labels for simulated, live, cached and unavailable data.
- Add clear failure text when Home Assistant is not configured.

Acceptance:

- A fresh clone still runs without setup, keys or Home Assistant.
- No token or credential appears in committed source.
- Simulated controls still work exactly as before.

### 2. Gateway Prototype

- Create a minimal local gateway service.
- Load Home Assistant connection details from local environment/config only.
- Implement health check and entity discovery.
- Normalise Home Assistant entities into AURA device records.
- Add timeout and error handling.

Acceptance:

- Gateway can report configured/unconfigured status.
- Entity discovery returns deterministic, typed records.
- Network failure and bad credentials produce safe, visible errors.

### 3. Confirmed Device State

- Implement command submission for low-risk devices first, such as lights and media.
- Poll or subscribe until the target state is confirmed.
- Surface sent, pending, confirmed, failed and timed-out states in the UI.
- Keep security-sensitive domains blocked until explicit policy exists.

Acceptance:

- AURA does not say a real action is complete until confirmation arrives.
- Timeout/failure is visible and does not silently revert to success copy.
- Security, lock, alarm and camera actions remain blocked or simulated.

### 4. Room And Scene Mapping

- Let the household map Home Assistant entities to AURA rooms and cards.
- Map existing scenes to Home Assistant scenes or scripts where configured.
- Preserve Good Morning, Movie Night, Dinner Time and Good Night as starter scenes.
- Keep editable local routines working while allowing later real-scene targets.

Acceptance:

- AURA can show which controls are live versus simulated.
- Scene execution clearly reports whether each target was confirmed or failed.
- Existing local routines and notes are not regressed.

### 5. Wall-PC And Hardware Validation

- Run the app on the target Windows wall PC.
- Validate touch behaviour, full-screen display, camera awareness and microphone behaviour.
- Check power recovery, startup flow and browser/PWA kiosk behaviour.
- Record limitations and any hardware-specific setup steps.

Acceptance:

- Camera and presence behaviour is tested on the actual wall PC.
- Kiosk mode can be launched and exited by an administrator.
- The app remains usable when internet access is removed.

## Data Model Additions

Initial records can remain simple until the production refactor:

- Integration config: provider, enabled flag, local gateway URL, status and last check.
- Room mapping: AURA room ID, display name and linked Home Assistant area/entity IDs.
- Device mapping: entity ID, domain, supported features, display label and risk level.
- Command event: command ID, target, requested state, status, created time, updated time, error and confirmation evidence.
- Audit event: user/context, action, target, time, status and safety classification.

Timestamps should use the configured household timezone, defaulting to `Australia/Brisbane`.

## Testing Checklist

- Fresh clone loads without Home Assistant.
- Existing Alpha 0.3 commands still work.
- Offline shell still serves the core interface after caching.
- Gateway disabled state is clear and non-breaking.
- Gateway health failure is visible and non-blocking.
- Entity discovery handles empty, malformed and unavailable responses.
- Light command shows pending before confirmation.
- Confirmed state uses Home Assistant state, not optimistic UI alone.
- Timeout path is visible and does not claim success.
- Sensitive domains are blocked pending permissions.
- No secrets are committed or exposed in frontend code.
- Camera/privacy indicators still work after integration changes.
- Chrome/Edge smoke test passes on Windows.

## Documentation Updates Required Before Alpha 0.4 Acceptance

- README setup section for Home Assistant local gateway.
- Architecture notes for the gateway boundary and secret handling.
- Acceptance checklist entries for confirmed state and no false confirmations.
- Known limitations covering browser speech, wall-PC hardware validation and unsupported device domains.
- Manual test evidence for the target Windows wall PC.
