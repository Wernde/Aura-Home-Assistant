# Home State 0.9a — Room-grouped live cards

Implement the first focused slice of Home State 0.9 in the existing wall interface.

## Outcome

Update `home-gateway.js` so allowlisted Home Assistant entity cards are grouped by the explicit `entity.room` value supplied by the local gateway. Entities without a non-empty room value must appear under `Unassigned`.

## Required behaviour

- Change only `home-gateway.js` unless a deterministic test requires a narrowly related change.
- Read `home-gateway.js` lines 130–235 before editing.
- Preserve the existing allowlist filtering, command buttons, confirmed-command lifecycle, refresh button and local-only gateway boundary.
- Render a clear room heading for every group.
- Sort named rooms alphabetically and place `Unassigned` last.
- Keep entities in their existing gateway order within each room.
- Show each card's current state and Brisbane-formatted last update using the existing `formatTime` helper.
- Treat `unavailable` and `unknown` entity states as read-only: do not render a command button for those cards.
- Do not create new modules, imports, dependencies or paid/cloud services.
- Do not change the living AURA face or replace the wall interface with a dashboard.

## Acceptance checks

- `node --check home-gateway.js` passes.
- Existing builder and gateway tests pass.
- Cards with explicit rooms are grouped under those exact room names.
- A card with no room is grouped under `Unassigned`.
- Unavailable or unknown cards have no action button.
- Existing safe light, switch, fan and conservative media-player actions remain unchanged for available entities.

## Blueprint status

This implements an existing Home State 0.9 requirement and does not change the approved product scope, architecture or visual direction. No Blueprint update is expected.
