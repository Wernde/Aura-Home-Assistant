# AURA Home Assistant

A standalone, cinematic wall-display prototype for a local-first household AI assistant. AURA is designed for a touchscreen PC with a built-in camera, microphones and speakers, and is completely separate from Drovik.

## Alpha 0.3 capabilities

### Living visual

- Live Brisbane date and time
- Animated holographic AURA face rendered in real time on Canvas
- Visible idle movement, breathing, blinking, eye tracking and mouth animation
- Assistant states: ready, aware, listening, local reasoning, speaking and alert
- Stronger visual wake response when local presence is detected

### Local intelligence

- No paid API or cloud AI required
- Typed and browser-voice commands
- Local command routing with fallback to the original demo engine
- Persistent household notes
- Local reminders
- Context for the most recent local request
- Editable scheduled routines that activate household scenes while AURA is running
- Voice commands for privacy mode, camera awareness, notes, reminders, scenes and shopping items
- Family Notes and Routines panels added to Quick Access

Example local commands:

- “Remember that the bins go out Thursday evening”
- “What do you remember?”
- “Remind us to check the school bags tomorrow”
- “Add lactose-free milk to the shopping list”
- “Open routines”
- “Activate Movie Night”
- “Enable camera awareness”
- “Turn on privacy mode”
- “What can you do?”

### Home interaction

- Simulated lighting, security, climate and music controls
- Good Morning, Movie Night, Dinner Time and Good Night scenes
- Editable family calendar and shopping list
- Home report panel
- Voice, volume, reduced-motion and household-name settings
- LocalStorage persistence

### Local awareness and privacy

- Optional browser camera access
- Local face-presence detection when the browser supports `FaceDetector`
- Local motion-presence fallback on other compatible browsers
- Attention tracking feeds detected position into AURA’s visual response
- No camera recording or cloud upload
- Clearly visible camera and presence indicators
- One-touch software privacy mode
- Designed to be paired with a physical camera shutter and microphone mute switch

### Wall-PC support

- Responsive wall, desktop and tablet layouts
- Installable Progressive Web App manifest
- Offline service-worker cache for the core interface
- Full-screen standalone display mode when installed

## Run locally

From the repository root:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` in Chrome or Edge. Camera and microphone access require `localhost` or HTTPS.

No installation, API key or build step is required.

## Development workflow

Use Codex Cloud with the GitHub repository for immediate code and documentation work. Use local Codex when validating the built-in camera, microphone, speakers, local browser permissions, full-screen kiosk mode or the physical Windows wall PC.

Permanent repository rules live in [`AGENTS.md`](AGENTS.md): keep AURA separate from Drovik, avoid paid APIs for now, preserve local-first privacy, keep the living face visibly alive, optimise for a Windows wall PC and touchscreen, use Australian English with Brisbane time, protect working features from regressions and test before claiming completion.

## Alpha 0.4 confirmed device-state milestone

AURA now includes a disabled-by-default Home Assistant gateway with a confirmed-state command lifecycle:

- Wall UI card and gateway drawer for local connection status
- No Home Assistant token field in the browser
- Local gateway URL stored only in browser settings
- `/health`, `/entities`, `/commands` and `/commands/:id` gateway endpoints
- Exact entity allowlisting through `AURA_ENTITY_ALLOWLIST`
- Restricted browser origins through `AURA_ALLOWED_ORIGINS`
- Live entity discovery with clear allowlisted and read-only states
- Sent, pending, confirmed, failed and timed-out command states
- No optimistic success copy before Home Assistant confirms the target state
- Blocked locks, alarms, covers and cameras

Run the local gateway only on a trusted machine:

```bash
node gateway/local-gateway.js
```

Set `HA_BASE_URL`, `HA_TOKEN`, `AURA_ENTITY_ALLOWLIST` and `AURA_ALLOWED_ORIGINS` in the local environment when you are ready to connect a Home Assistant test instance. See [`gateway/README.md`](gateway/README.md) and [`docs/ALPHA_04_MILESTONE_3.md`](docs/ALPHA_04_MILESTONE_3.md).

## Try local awareness

1. Open **Awareness** in the top bar.
2. Select **Enable camera awareness**.
3. Approve browser camera permission.
4. Move into or out of view and watch AURA’s presence status and visual intensity change.
5. Use **Privacy** to stop the camera immediately.

Camera frames stay inside the browser and are not stored.

## Project direction

The Word project specification is distilled into repo-tracked planning docs:

- [`docs/MASTER_SPEC.md`](docs/MASTER_SPEC.md)
- [`docs/ALPHA_04_PLAN.md`](docs/ALPHA_04_PLAN.md)

The next local-first phase is Alpha 0.4, focused on:

- Room and scene mapping between AURA and Home Assistant
- Improved routine scheduling and reminder delivery
- Kiosk startup and local service supervision
- Physical Windows wall-PC hardware testing
- Local user profiles and permissions
- Optional local language-model support
- Optional cloud AI only when the household explicitly chooses to enable it later

See:

- [`docs/MASTER_SPEC.md`](docs/MASTER_SPEC.md)
- [`docs/ALPHA_04_PLAN.md`](docs/ALPHA_04_PLAN.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/BUILD_ROADMAP.md`](docs/BUILD_ROADMAP.md)
- [`docs/MVP_ACCEPTANCE.md`](docs/MVP_ACCEPTANCE.md)

## Current limitations

This version uses local browser logic and sample household data. Real Home Assistant commands require local gateway configuration and exact entity allowlisting. Live calendars, weather providers, streaming services and identity recognition are not yet connected. Scheduled routines only execute while AURA is open in the browser. Physical wall-PC, camera, microphone, speaker and kiosk validation is still required.
