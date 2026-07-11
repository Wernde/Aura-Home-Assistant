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

- OpenAI Realtime API for low-latency speech conversation
- OpenAI Responses API for reasoning and tool use
- OpenAI Agents SDK for specialist agents
- Private MCP server for AURA tools
- Home Assistant and MQTT for smart-home control
- PostgreSQL plus vector storage for approved memory
- WebSockets for real-time local events
- Three.js or React Three Fiber for the production visual engine

## Safety boundary

High-risk actions such as unlocking doors, opening a garage, disabling alarms or viewing private cameras must use permissions, identity checks and explicit confirmation. AURA must distinguish between a command being understood, sent and confirmed by the real device.
