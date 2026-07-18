# Alpha 0.4 Milestone 3 — Confirmed Device State

## Status

Implemented on `feat/alpha-04-confirmed-device-state` for review.

## What changed

- Added exact Home Assistant entity allowlisting through `AURA_ENTITY_ALLOWLIST`.
- Added restricted browser origins through `AURA_ALLOWED_ORIGINS`.
- Added deterministic service allowlists for lights, switches, fans, media players and limited climate mode changes.
- Added command IDs and an in-memory command ledger.
- Added `GET /commands` and `GET /commands/:id`.
- Changed command submission to return `pending` and confirm state asynchronously.
- Added confirmed, failed and timed-out outcomes with observed-state evidence.
- Added live entity discovery and allowlisted device controls to the AURA gateway drawer.
- Prevented optimistic real-device UI changes.
- Kept security-critical domains blocked.

## Validation completed

- `node --check gateway/local-gateway.js`
- `node --check home-gateway.js`
- `node --test gateway/local-gateway.test.js`
- Local integration smoke test against a mock Home Assistant server:
  - health returned `live`
  - one allowlisted entity was discovered
  - command returned `pending`
  - Home Assistant state changed
  - command status became `confirmed`

## Still requires physical validation

- Real Home Assistant token and entity IDs.
- Chrome or Edge on the target Windows wall PC.
- Local network origin configuration.
- Touch controls in full-screen kiosk mode.
- Power recovery and automatic gateway startup.
- Camera, microphone and speaker regression check.
