# AURA Home Assistant

A standalone, cinematic wall-display prototype for a local-first household AI assistant. AURA is designed for a touchscreen PC with a built-in camera, microphones and speakers, and is completely separate from Drovik.

## Alpha 0.1 capabilities

- Live Brisbane date and time
- Animated holographic AURA face rendered in real time on Canvas
- Visible idle movement, breathing, blinking, pointer-based eye tracking and mouth animation
- Assistant states: ready, listening, thinking, speaking and alert
- Browser speech recognition when supported
- Browser text-to-speech responses
- Typed natural-language demo commands
- Simulated lighting, security, climate and music controls
- Good Morning, Movie Night, Dinner Time and Good Night scenes
- Editable family calendar and shopping list
- Spoken and on-screen home report
- Voice volume, reduced-motion and household-name settings
- LocalStorage persistence
- Responsive wall, desktop and tablet layouts
- Dependency-free static build

## Run locally

From the repository root:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` in Chrome or Edge. Microphone access generally requires `localhost` or HTTPS.

No installation, API key or build step is required for this alpha.

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

The production system will add OpenAI Realtime voice, Responses API reasoning, specialist agents, local household memory, camera-based presence and gaze detection, and Home Assistant control with confirmed device states.

See:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/BUILD_ROADMAP.md`](docs/BUILD_ROADMAP.md)
- [`docs/MVP_ACCEPTANCE.md`](docs/MVP_ACCEPTANCE.md)

## Current limitations

This version uses a local demo command engine and sample household data. It does not yet connect to real smart-home devices, live calendars, weather providers, streaming services, camera recognition or a cloud AI model.
