'use strict';

process.env.AURA_ENTITY_ALLOWLIST = 'light.living_room,media_player.lounge';
process.env.AURA_ALLOWED_ORIGINS = 'http://localhost:8080';

const test = require('node:test');
const assert = require('node:assert/strict');
const gateway = require('./local-gateway');

test('normalises entities and exposes explicit allowlist state', () => {
  const entity = gateway.normaliseEntity({
    entity_id: 'light.living_room',
    state: 'on',
    attributes: { friendly_name: 'Living room light' },
    last_changed: '2026-07-19T01:00:00Z'
  });
  assert.equal(entity.allowed, true);
  assert.equal(entity.controllable, true);
  assert.equal(entity.risk, 'low');
});

test('blocks sensitive and non-allowlisted targets', () => {
  assert.match(gateway.commandBlockedReason('lock.front_door', 'lock', 'unlock'), /future confirmation/);
  assert.match(gateway.commandBlockedReason('light.bedroom', 'light', 'turn_on'), /AURA_ENTITY_ALLOWLIST/);
  assert.equal(gateway.commandBlockedReason('light.living_room', 'light', 'turn_on'), '');
});

test('derives deterministic target states', () => {
  assert.equal(gateway.expectedStateFor('light', 'turn_on'), 'on');
  assert.equal(gateway.expectedStateFor('light', 'toggle', {}, 'on'), 'off');
  assert.equal(gateway.expectedStateFor('media_player', 'media_pause'), 'paused');
  assert.equal(gateway.expectedStateFor('climate', 'set_hvac_mode', { hvac_mode: 'cool' }), 'cool');
});

test('accepts only configured browser origins', () => {
  assert.equal(gateway.isAllowedOrigin('http://localhost:8080'), true);
  assert.equal(gateway.isAllowedOrigin('https://untrusted.example'), false);
  assert.equal(gateway.isAllowedOrigin(undefined), true);
});
