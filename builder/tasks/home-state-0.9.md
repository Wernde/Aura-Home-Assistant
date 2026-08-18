# Home State 0.9

Continue AURA from the current confirmed-command Home Assistant milestone.

## Goal

Turn verified Home Assistant entities into a live, room-oriented home-state experience while preserving the living AURA presence and local-first safety model.

## Required behaviour

- Read current allowlisted entity state through the local gateway.
- Show current state, availability and last-updated freshness on device cards.
- Group entities into rooms using explicit local room mappings. Do not invent rooms from names when a mapping is unavailable; use an Unassigned section.
- Add brightness control for allowlisted `light.*` entities only when Home Assistant reports brightness capability.
- Add percentage/speed control for allowlisted `fan.*` entities only when supported.
- Keep simple on/off controls for low-risk lights and switches.
- Keep media-player control conservative: power/play-pause only when capability is confirmed.
- Keep scene activation one-way only.
- Locks, alarms, covers/garage doors, cameras and other higher-risk domains remain read-only or blocked.
- Every command must retain sent → pending → confirmed/failed/timed-out semantics and must confirm observed state before success copy.
- Add explicit Refresh home state control and a reasonable local polling interval with visible freshness.
- Gracefully show gateway unavailable, Home Assistant unavailable, entity unavailable and stale-cache states.
- Preserve camera privacy, offline shell, touch layout, voice/local command routing, notes, reminders, routines and the living AURA visual.

## Acceptance checks

- Existing JavaScript static checks pass.
- No Home Assistant token appears in browser code, browser storage UI or committed config.
- Unknown/high-risk entities cannot be controlled.
- Room grouping works with an explicit mapping and has Unassigned fallback.
- Device cards distinguish live, cached/stale and unavailable state.
- Commands only report confirmed after gateway/Home Assistant readback.
- The wall layout remains usable at 1280×800 and touch controls remain comfortably sized.

## Repository starting points

- `home-gateway.js` renders the Home Assistant status, entity cards, refresh action and command lifecycle in the wall interface.
- `home-gateway.css` styles the Home Assistant drawer and touch controls.
- `gateway/local-gateway.js` normalises Home Assistant entities, enforces the allowlist and confirms command state by readback.
- `gateway/local-gateway.test.js` contains deterministic gateway safety tests.
- Read these exact files before editing. The task title `Home State 0.9` is not a filename.

## Non-goals

- Do not add paid cloud APIs.
- Do not add automatic lock/alarm/garage control.
- Do not add speculative AI autonomy.
- Do not replace the living AURA visual with a dashboard-only interface.
