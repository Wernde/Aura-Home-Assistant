# AURA Home Build Roadmap

## Alpha 0.1 — Living visual and simulated home

- Animated holographic AURA face
- Wall-screen layout
- Touch interactions
- Voice and typed demo commands
- Simulated household state
- Local persistence

## Alpha 0.2 — Camera and voice hardware

- Camera permission and physical privacy controls
- Presence detection
- Basic gaze tracking
- Far-field microphone configuration
- Local wake-word prototype
- Improved viseme-driven speech animation

## Alpha 0.3 — Local intelligence and awareness

- Local command routing without paid APIs
- Household notes, reminders and recent local context
- Editable routines that run while AURA is open
- Browser speech input and spoken responses
- Optional on-device camera awareness with privacy mode
- Clear local-only privacy indicators
- Regression protection for the living face, wall layout and offline shell

## Alpha 0.4 — Real home connections

- Disabled-by-default local Home Assistant gateway
- Secret handling outside browser JavaScript and source control
- Entity discovery and room mapping
- Confirmed device-state lifecycle: sent, pending, confirmed, failed and timed out
- Low-risk light/media command path before security-critical actions
- Live, cached, simulated and unavailable data labels
- Real scenes and automations where Home Assistant is configured
- Windows wall-PC validation for touch, camera, microphone, kiosk and power recovery

See [`ALPHA_04_PLAN.md`](ALPHA_04_PLAN.md) for the working implementation plan.

## Alpha 0.5 — Wall appliance and local services

- Kiosk startup and protected administrator exit
- Local service supervision and health monitor
- Backup, restore and release rollback
- Settings migration and local data export/delete
- Weather and calendar integrations through approved local or gateway-backed services

## Beta 1 — Profiles and permissions

- Household administrator, adult, teen, child, guest and technician roles
- Consent and retention controls for household and personal memory
- Permission checks for integrations and high-risk actions
- Audit logs for security-relevant events

## Beta 2 — Advanced visual engine

- Production WebGL face with richer gaze, expressions and performance scaling
- Viseme-driven lip synchronisation
- Adaptive quality for the selected wall PC

## Beta 3 — Optional AI expansion

- Optional local language-model support
- Optional OpenAI Realtime voice connection when paid APIs are approved
- Optional Responses API tool layer when paid APIs are approved
- Specialist-agent routing behind explicit household consent
- Approval prompts for sensitive actions

## Release 1.0

- Stable household deployment with real devices
- Backup, updates and documented support
- Controlled autonomy levels
- Administrator console and optional mobile companion
