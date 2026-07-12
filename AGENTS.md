# AURA Codex Guidance

These rules apply every time Codex works in this repository.

## Product Boundary

- Keep AURA completely separate from Drovik. Do not merge product concepts, code, data, branding, workflows or assumptions between the two projects.
- AURA is a local-first household assistant for a Windows wall PC and touchscreen.
- Preserve local-first privacy. Camera frames, microphone input, household notes, routines, reminders and presence data must stay on the device unless a future change explicitly adds an approved opt-in integration.
- Do not add paid APIs yet. OpenAI, cloud AI, weather, calendar, smart-home cloud or other paid/external services may be documented as future optional integrations, but current implementation must keep working without API keys, subscriptions or cloud accounts.

## UX Direction

- Maintain the approved cinematic wall-display direction: dark holographic interface, visibly alive AURA face, breathing/idling motion, blinking, eye attention and clear assistant states.
- Keep the face visibly alive even when idle. Do not replace the living visual with a static logo, flat dashboard or text-first chat screen.
- Optimise for a Windows wall PC, Chrome/Edge, touch input, full-screen kiosk use and a built-in camera, microphone and speakers.
- Use Australian English, Celsius and Brisbane time (`Australia/Brisbane`) in user-facing copy and time-sensitive behaviour.

## Safety And Reliability

- Protect working features from regressions, especially the animated face, local command handling, privacy mode, camera awareness, service-worker offline shell, wall layout and touch controls.
- Sensitive real-world actions, once real integrations exist, must require explicit confirmation and confirmed device state. Never imply that a door, alarm, camera or lock has changed state unless AURA has confirmation.
- Test before claiming completion. At minimum, run the relevant static checks and a local smoke test for changed browser files. If hardware features are touched, note what still needs validation on the physical Windows wall PC.

## Workflow

- Use Codex Cloud with the GitHub repository for immediate code and documentation work.
- Use local Codex when validating the built-in camera, microphone, speakers, local permissions, full-screen kiosk behaviour or the physical wall computer.
