# AURA Home Alpha Acceptance Checklist

## Completed through Alpha 0.3

- [x] Standalone repository and codebase
- [x] Full-screen wall-display interface
- [x] AURA remains animated while idle
- [x] Visible blinking, breathing and pointer-based eye tracking
- [x] Listening, thinking, speaking and alert states
- [x] Typed natural-language demo commands
- [x] Browser voice input where supported
- [x] Browser voice output
- [x] Simulated lighting, security, climate and music controls
- [x] Good Morning, Movie Night, Dinner Time and Good Night scenes
- [x] Editable family calendar
- [x] Editable shopping list
- [x] Persistent household settings
- [x] Responsive layout and reduced-motion setting
- [x] Local household notes
- [x] Local reminders
- [x] Editable local routines
- [x] Local command routing for notes, reminders, routines, scenes, privacy and awareness
- [x] Optional browser camera presence detection where supported
- [x] Local motion-presence fallback on compatible browsers
- [x] Visible privacy mode and camera status
- [x] Offline service-worker shell
- [x] PWA manifest for wall-PC installation

## Still required for the real wall system

- [ ] Validate built-in camera presence detection on the physical Windows wall PC
- [ ] Real gaze tracking from the camera
- [ ] Local wake-word detection
- [ ] Home Assistant control
- [ ] Confirmed real-device states
- [ ] Household authentication and profiles
- [ ] Local household memory and administrator controls
- [ ] Kiosk launch and service watchdog on the wall PC
- [ ] Optional local language-model support
- [ ] Optional OpenAI Realtime speech conversation only after paid APIs are approved
- [ ] Optional Responses API reasoning and tool use only after paid APIs are approved

## Alpha 0.4 acceptance gates

- [ ] Fresh clone still runs without setup, keys, paid APIs or Home Assistant
- [ ] Home Assistant integration is disabled by default
- [ ] Home Assistant secrets are loaded outside browser JavaScript and are not committed
- [ ] Gateway health clearly reports configured, unconfigured and unavailable states
- [ ] Entity discovery returns normalised rooms/devices for a configured local Home Assistant instance
- [ ] UI distinguishes simulated, live, cached and unavailable data
- [ ] Real commands show sent, pending, confirmed, failed or timed-out state
- [ ] AURA does not claim real-device success until Home Assistant confirms target state
- [ ] Security-critical domains such as locks, alarms, doors and cameras remain blocked or confirmation-gated
- [ ] Existing Alpha 0.3 notes, reminders, routines, scenes, privacy mode, camera awareness and offline shell still work
- [ ] Camera, microphone, touch, full-screen/kiosk behaviour and power recovery are tested on the physical Windows wall PC before production acceptance
