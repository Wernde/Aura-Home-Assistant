# AURA Home Master Specification

This document distils the project documentation in `AURA_Home_Assistant_Project_Specifications_and_Requirements.docx`, version 3.0, dated 12 July 2026. The Word document remains the full master source; this file is the repo-native working reference for development.

## Current Baseline

AURA is at Alpha 0.3: a dependency-free, local-only browser/PWA prototype in `Wernde/Aura-Home-Assistant`.

Implemented:

- Cinematic wall-display interface with a Canvas-rendered holographic face.
- Breathing, blinking, pointer-based eye tracking, mouth movement and state-based animation.
- Ready, aware, listening, thinking, speaking and alert states.
- Browser speech recognition and speech synthesis where supported.
- Typed local command processing.
- Simulated lighting, security, climate, media and four smart scenes.
- Editable family calendar and shopping list.
- Local notes, reminders, scheduled routines and recent command context.
- Optional local camera awareness with face or motion presence detection.
- One-touch privacy mode with visible camera and microphone state.
- PWA manifest and service-worker offline shell.
- Australian English, Celsius and `Australia/Brisbane` defaults.

Current limitations:

- No real smart-home devices are connected yet.
- Weather, energy and some household data are demonstration data.
- Speech recognition depends on browser support and may use browser vendor services.
- Camera behaviour still needs validation on the physical Windows wall PC.
- The Canvas face is a prototype, not the final production WebGL character.
- No paid AI model, production authentication, household profiles or biometric identity recognition exists yet.

## Product Principles

- Local first: privacy-sensitive, safety-critical and latency-sensitive features must run locally wherever practical.
- One intelligence, multiple surfaces: the wall display is primary; future phone, tablet, television or ChatGPT surfaces must still feel like the same AURA.
- Alive, not decorative: the face must communicate attention, state, action and system health.
- Useful before futuristic: every feature and visual effect must support a real household purpose.
- Human authority: AURA must remain explainable, permission-based and subject to household control.
- Graceful degradation: when cloud, camera, microphone or integrations fail, the remaining local system must continue safely.
- No false confirmations: AURA must never report an action as complete unless the target system confirms it.
- Calm intelligence: the experience should feel advanced and cinematic without becoming noisy, aggressive or distracting.

## Hard Boundaries

- AURA must remain separate from Drovik code, branches, databases, assets and deployment configuration.
- The current phase must not require OpenAI API keys, paid cloud AI, external accounts or subscriptions.
- API keys, Home Assistant tokens and private credentials must never be committed or exposed to browser JavaScript.
- Camera access must remain opt-in and visibly controllable.
- Camera frames must not be uploaded, recorded or stored by default.
- Wake word, microphone and camera capture must not run invisibly.
- Identity recognition and personal memory are future opt-in features only.
- Security-critical real-world actions require permission checks, confirmation and confirmed device state.

## Hardware Direction

Recommended wall unit:

- 24 to 43 inch capacitive touchscreen, 16:9 landscape.
- Minimum 1920 x 1080 resolution; 2560 x 1440 or 3840 x 2160 preferred.
- Readable primary information from approximately two to five metres.
- Modern six-core x64 processor minimum; eight-core with NPU or capable GPU preferred.
- 16 GB RAM minimum; 32 GB preferred.
- 512 GB SSD minimum; 1 TB preferred.
- Gigabit Ethernet, Wi-Fi 6 or later and Bluetooth 5 or later.
- Secure Boot and TPM or equivalent hardware-backed encryption.
- Automatic boot after power restoration and UPS support.

Camera, microphone and speaker expectations:

- 1080p camera with wide field of view and low-light performance.
- Physical camera shutter or cover.
- Far-field microphone array with beamforming, echo cancellation and noise reduction.
- Physical microphone mute and visible hardware indicator where possible.
- Speakers with clear speech, room-appropriate volume and quiet or night modes.

## Runtime Direction

AURA may run on Windows, Linux or a dedicated kiosk appliance. The initial wall PC should use a full-screen browser or installed PWA.

Runtime requirements:

- Automatic startup after login or power recovery.
- Kiosk mode that hides desktop, taskbar, browser chrome and unrelated notifications from normal household users.
- Protected administrator exit from kiosk mode.
- Service supervision and restart for critical local services.
- Update rollback if a release fails.
- Trusted-device administration for health inspection, restart and updates.

## Living Visual Requirements

The visual identity should remain clearly digital: particles, translucent geometry, neural paths and light fields. It must avoid photorealistic skin, mannequin stiffness, cartoon exaggeration and aggressive cyberpunk styling.

The face must support:

- Always-visible movement unless reduced-motion mode is enabled.
- Slow breathing rhythm.
- Natural irregular head turns, tilts and drift.
- Variable blink timing.
- Idle scanning and attention toward pointer or detected presence.
- Micro-movements in facial tension, glow and particles.
- Room-readable movement from several metres away.

State behaviour:

- Ambient: calm breathing, slow drift and minimal interface clutter.
- Presence detected: sharper face, increased brightness and attention toward the person.
- Listening: forward attention, brighter eyes, transcription and audio-reactive feedback.
- Thinking: neural activity and clear local-task indication.
- Acting: target system, progress and confirmed or failed outcome.
- Speaking: viseme or audio-driven mouth motion, captions and eye contact.
- Alert: focused amber or red visual with calm urgent messaging.
- Privacy: perception visibly disabled while the face remains alive.
- Sleep: low brightness and low-power motion while preserving urgent alerts.

## Interaction Requirements

Input modes:

- Wake phrase, such as "AURA" or "Hey AURA", in a future local wake-word phase.
- Touch-to-talk microphone control.
- Push-to-talk hardware button.
- Continuous conversation mode only when explicitly enabled.
- Typed command input.
- Touchscreen quick actions and panels.

Voice requirements:

- Default to Australian English (`en-AU`).
- Show unmistakable listening state whenever audio is captured.
- Allow interruption or stopping while AURA is speaking.
- Show spoken responses as text captions.
- Preserve typed and touch alternatives for essential commands.
- Support quiet hours, night volume and silent notifications.

## Local Intelligence And Memory

The no-API phase must keep improving deterministic local command handling. AURA should recognise common variations for:

- Home controls.
- Scenes.
- Notes.
- Reminders.
- Shopping lists.
- Routines.
- Privacy and camera awareness.
- Local status and reports.

Memory categories:

- Conversation context for short follow-up commands.
- Household memory for room names, routines, device labels, staples and shared preferences.
- Personal memory only after opt-in profile controls exist.
- Event memory for completed reminders, alerts, maintenance events and confirmed actions.

Memory controls:

- Users must be able to inspect, correct and delete stored memories and notes.
- Administrators must be able to configure retention by category.
- Passwords, payment details and sensitive security credentials must not enter general conversational memory.
- Current notes, routines and settings should persist locally across refresh and restart.

## Smart-Home Direction

Home Assistant is the preferred first integration because it can provide local device state, automations, scenes, MQTT and broad protocol support. AURA should act as the intelligence and presentation layer above Home Assistant rather than implementing every device protocol directly.

Supported direction:

- Home Assistant WebSocket and REST APIs.
- Matter and Thread.
- Zigbee.
- Z-Wave.
- MQTT.
- Wi-Fi smart devices.
- Philips Hue.
- Samsung SmartThings.
- Apple Home and Google Home where feasible.

Action lifecycle for real devices:

1. Resolve the user intent, target room, device and requested state.
2. Check user and action permissions.
3. Request confirmation for sensitive actions.
4. Send the command to Home Assistant or the device service.
5. Wait for confirmed target state or report timeout/failure.
6. Record security-relevant actions with user, time and outcome.

High-risk actions include unlocking doors, opening garages or gates, disarming alarms, disabling cameras, granting guest access, making purchases, sharing private data and switching off critical equipment.

## Data Requirements

Core entities:

- Household.
- User profile.
- Role and permission.
- Room.
- Device.
- Scene.
- Routine.
- Automation.
- Calendar event.
- Reminder.
- Shopping item.
- Household note.
- Conversation session.
- Memory record.
- Perception preference.
- Security event.
- Energy record.
- Integration configuration.
- Audit event.

Data rules:

- Scope all data to one household.
- Encrypt credentials, tokens and sensitive personal fields at rest.
- Use consistent timestamps and configured timezone.
- Distinguish live, cached, simulated and user-entered data.
- Support administrator export and deletion.
- Keep security logs append-oriented and protected from ordinary user editing.

## Accessibility And Performance

Interface requirements:

- Large touch targets of at least 44 x 44 px.
- Typography readable from several metres.
- Minimal permanent clutter.
- Contextual panels only when needed.
- Clear success, pending, failed and unavailable states.
- Australian terminology and spelling.
- No important meaning conveyed by colour alone.

Accessibility requirements:

- Captions for all spoken responses.
- Reduced motion for non-essential animation.
- High contrast on the dark interface.
- Keyboard-accessible essential controls.
- Meaningful accessible labels for controls and status indicators.
- Configurable text size, speech rate and volume where practical.

Performance targets:

- Target 60 fps animation on the selected wall PC.
- Immediate visible acknowledgement for touch or voice activation.
- Routine local commands begin processing in less than one second.
- Thinking, camera and device operations must not freeze the interface.
- Particle count and effects should reduce on weaker hardware.

## Testing Expectations

Required coverage:

- Unit tests for intent matching, memory rules, data validation and permission logic.
- Integration tests for Home Assistant commands, device-state confirmation, calendars and local services.
- Visual regression tests for approved layouts, spacing, states and responsive breakpoints.
- Animation tests for frame rate, blink timing, state transitions and reduced motion.
- Hardware tests on the real wall display, camera, microphone, speakers, touch, wake and power recovery.
- Privacy tests for camera/microphone indicators, privacy mode, permission revocation and unintended storage.
- Failure tests for internet loss, device timeout, camera denial, service crash and corrupted local state.
- Accessibility tests for keyboard, captions, contrast, focus order and screen-reader labels.

Completion evidence:

- Do not mark a feature complete until it has been exercised in the relevant environment.
- Supported browsers should have no major console, layout or runtime errors.
- Camera and presence behaviour must be tested on the actual wall PC before production acceptance.
- Door, lock and alarm outcomes must be verified against real integration state.
- New phases must preserve previously accepted functions.

## Recommended Next Decision

Adopt the Word document as the master specification for Alpha 0.4 planning. Continue without a paid AI API by prioritising the local Home Assistant gateway, confirmed device-state model, wall-PC kiosk operation and hardware testing.
