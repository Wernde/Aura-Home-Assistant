# AURA Home Target Architecture

## Wall application

The wall PC runs a full-screen kiosk application containing the living visual engine, touch interface, audio controls and local household status views.

## Local services

1. **Visual Engine** — AURA face, particles, expressions, lip synchronisation and UI states.
2. **Voice Engine** — wake word, microphone stream, speech recognition and speech output.
3. **Perception Engine** — camera presence, face detection, gaze and gestures.
4. **AI Orchestrator** — intent understanding, planning and specialist-agent routing.
5. **Memory Service** — conversation, household and personal memories with user controls.
6. **Home Controller** — Home Assistant, Matter, MQTT and confirmed device state.
7. **Automation Engine** — routines, triggers and controlled autonomy.
8. **Integration Gateway** — calendar, weather, traffic, messages, music and documents.
9. **Security Service** — roles, confirmations, audit logs and sensitive actions.
10. **Health Monitor** — service health, recovery and offline status.

## Recommended integration stack

- Local browser storage for notes, reminders, routines, household settings and privacy state
- Local browser speech recognition and speech synthesis where supported
- Browser camera APIs for on-device presence and attention signals
- Home Assistant and MQTT for smart-home control when real devices are added
- WebSockets for real-time local events between the wall interface and local services
- Optional local language model runtime for offline intent expansion
- Optional OpenAI Realtime API, Responses API and Agents SDK only in a later opt-in paid/cloud phase
- Private MCP server for AURA tools
- Optional local PostgreSQL plus vector storage for approved household memory
- Three.js or React Three Fiber for the production visual engine

## Current implementation boundary

Alpha 0.3 must run without paid APIs, cloud AI, external accounts or API keys. The current app uses local browser logic, LocalStorage, browser speech, an offline service worker and optional on-device camera awareness. Any future cloud capability must be optional, visibly controlled by the household and keep local-first behaviour as the default.

## Alpha 0.4 gateway boundary

The next integration layer should connect to Home Assistant through a disabled-by-default local gateway, not by embedding long-lived Home Assistant tokens in browser JavaScript. The gateway should expose only the narrow local API AURA needs for health, rooms, entities, scenes, commands and confirmed command status.

Real device commands must use a status lifecycle: draft, blocked, sent, pending, confirmed, failed and timed out. AURA may show optimistic UI progress, but user-facing completion language requires confirmed state from Home Assistant or the trusted device service.

## Safety boundary

High-risk actions such as unlocking doors, opening a garage, disabling alarms or viewing private cameras must use permissions, identity checks and explicit confirmation. AURA must distinguish between a command being understood, sent and confirmed by the real device.
