# AURA Home Assistant

A standalone, cinematic wall-display prototype for a local-first household AI assistant. AURA is designed for a touchscreen PC with a built-in camera, microphones and speakers, and is completely separate from Drovik.

## Alpha 0.2 capabilities

### Living visual

- Live Brisbane date and time
- Animated holographic AURA face rendered in real time on Canvas
- Visible idle movement, breathing, blinking, eye tracking and mouth animation
- Assistant states: ready, aware, listening, thinking, speaking and alert
- Stronger visual wake response when local presence is detected

### Interaction

- Browser speech recognition when supported
- Browser text-to-speech responses
- Typed natural-language demo commands
- Simulated lighting, security, climate and music controls
- Good Morning, Movie Night, Dinner Time and Good Night scenes
- Editable family calendar and shopping list
- Home report panel
- Voice, volume, time format, reduced-motion and household-name settings
- LocalStorage persistence

### Local awareness and privacy

- Optional browser camera access
- Local face-presence detection when the browser supports `FaceDetector`
- Local motion-presence fallback on other compatible browsers
- Attention tracking feeds the detected face position into AURA’s eye movement
- No camera recording or cloud upload in Alpha 0.2
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

No installation, API key or build step is required for this alpha.

## Try local awareness

1. Open **Awareness** in the top bar.
2. Select **Enable camera awareness**.
3. Approve browser camera permission.
4. Move into or out of view and watch AURA’s presence status and visual intensity change.
5. Use **Privacy** to stop the camera immediately.

Camera frames stay inside the browser and are not stored by this alpha.

## Example commands

- “Turn the living-room lights off”
- “Set the temperature to 21 degrees”
- “Activate Movie Night”
- “What’s on today?”
- “Show my shopping list”
- “Give me a home report”
- “Play music”
- “Good night”

## Project direction

The production system will add:

- OpenAI Realtime voice interaction
- Responses API reasoning and tool use
- Specialist household agents
- Local household memory
- Improved camera-based presence, identity and gaze detection
- Home Assistant integration with confirmed device states
- Kiosk startup and local service supervision

See:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/BUILD_ROADMAP.md`](docs/BUILD_ROADMAP.md)
- [`docs/MVP_ACCEPTANCE.md`](docs/MVP_ACCEPTANCE.md)

## Current limitations

This version uses a local demo command engine and sample household data. It does not yet connect to real smart-home devices, live calendars, weather providers, streaming services, identity recognition or a cloud AI model.
