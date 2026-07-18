#!/usr/bin/env node
'use strict';

const http = require('node:http');
const { randomUUID } = require('node:crypto');

const PORT = Number(process.env.AURA_GATEWAY_PORT || 8787);
const HA_BASE_URL = String(process.env.HA_BASE_URL || '').replace(/\/+$/, '');
const HA_TOKEN = String(process.env.HA_TOKEN || '');
const REQUEST_TIMEOUT_MS = Number(process.env.AURA_GATEWAY_TIMEOUT_MS || 7000);
const CONFIRM_TIMEOUT_MS = Number(process.env.AURA_CONFIRM_TIMEOUT_MS || 10000);
const CONFIRM_POLL_MS = Number(process.env.AURA_CONFIRM_POLL_MS || 650);

function parseCsv(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:8080', 'http://127.0.0.1:8080'];
const ALLOWED_ORIGINS = new Set(parseCsv(process.env.AURA_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(',')));
const ENTITY_ALLOWLIST = new Set(parseCsv(process.env.AURA_ENTITY_ALLOWLIST));
const SAFE_SERVICES = {
  light: new Set(['turn_on', 'turn_off', 'toggle']),
  switch: new Set(['turn_on', 'turn_off', 'toggle']),
  fan: new Set(['turn_on', 'turn_off', 'toggle']),
  media_player: new Set(['media_play', 'media_pause', 'media_stop']),
  climate: new Set(['set_hvac_mode'])
};
const SAFE_DOMAINS = new Set(Object.keys(SAFE_SERVICES));
const BLOCKED_DOMAINS = new Set(['lock', 'alarm_control_panel', 'cover', 'camera']);
const FINAL_COMMAND_STATES = new Set(['confirmed', 'failed', 'timed_out', 'blocked']);

let cachedEntities = [];
let lastEntityRefresh = '';
const commands = new Map();

function isAllowedOrigin(origin) {
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function responseHeaders(req) {
  const origin = req.headers.origin;
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    Vary: 'Origin'
  };
  if (origin && isAllowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(req, res, status, payload) {
  res.writeHead(status, responseHeaders(req));
  res.end(JSON.stringify(payload));
}

function notFound(req, res) {
  json(req, res, 404, { ok: false, error: 'Not found' });
}

function configured() {
  return Boolean(HA_BASE_URL && HA_TOKEN);
}

function commandsEnabled() {
  return configured() && ENTITY_ALLOWLIST.size > 0;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function haFetch(path, options = {}) {
  if (!configured()) throw new Error('Home Assistant is not configured');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${HA_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('Home Assistant returned malformed JSON');
      }
    }
    if (!response.ok) throw new Error(`Home Assistant returned ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function normaliseEntity(entity) {
  const entityId = String(entity.entity_id || '');
  const [domain] = entityId.split('.');
  const allowed = ENTITY_ALLOWLIST.has(entityId);
  return {
    entityId,
    domain,
    state: String(entity.state ?? 'unknown'),
    name: entity.attributes?.friendly_name || entityId,
    room: entity.attributes?.area_id || '',
    supportedFeatures: Number(entity.attributes?.supported_features || 0),
    risk: BLOCKED_DOMAINS.has(domain) ? 'high' : SAFE_DOMAINS.has(domain) ? 'low' : 'unknown',
    allowed,
    controllable: allowed && SAFE_DOMAINS.has(domain),
    updatedAt: entity.last_changed || entity.last_updated || ''
  };
}

async function refreshEntities() {
  const states = await haFetch('/api/states');
  if (!Array.isArray(states)) throw new Error('Home Assistant entity response was not an array');
  cachedEntities = states.map(normaliseEntity).filter((entity) => entity.entityId);
  lastEntityRefresh = new Date().toISOString();
  return cachedEntities;
}

function expectedStateFor(domain, service, serviceData = {}, currentState = '') {
  if (service === 'turn_on') return 'on';
  if (service === 'turn_off') return 'off';
  if (service === 'toggle') return currentState === 'on' ? 'off' : 'on';
  if (domain === 'media_player' && service === 'media_play') return 'playing';
  if (domain === 'media_player' && service === 'media_pause') return 'paused';
  if (domain === 'media_player' && service === 'media_stop') return 'idle';
  if (domain === 'climate' && service === 'set_hvac_mode') return String(serviceData.hvac_mode || '');
  return '';
}

function commandBlockedReason(entityId, domain, service) {
  if (!entityId) return 'entityId is required';
  if (!domain) return 'domain is required';
  if (BLOCKED_DOMAINS.has(domain)) return `${domain} requires a future confirmation and permission policy`;
  if (!SAFE_DOMAINS.has(domain)) return `${domain} is not enabled in the Alpha 0.4 safety allowlist`;
  if (!ENTITY_ALLOWLIST.has(entityId)) return `${entityId} is not present in AURA_ENTITY_ALLOWLIST`;
  if (!service) return 'service is required';
  if (!SAFE_SERVICES[domain]?.has(service)) return `${domain}.${service} is not enabled in the Alpha 0.4 service allowlist`;
  return '';
}

function commandView(command) {
  return {
    id: command.id,
    label: command.label,
    entityId: command.entityId,
    domain: command.domain,
    service: command.service,
    expectedState: command.expectedState,
    observedState: command.observedState,
    status: command.status,
    detail: command.detail,
    createdAt: command.createdAt,
    updatedAt: command.updatedAt,
    confirmedAt: command.confirmedAt || '',
    evidence: command.evidence || null
  };
}

function updateCommand(id, patch) {
  const command = commands.get(id);
  if (!command) return null;
  Object.assign(command, patch, { updatedAt: new Date().toISOString() });
  commands.set(id, command);
  return command;
}

function pruneCommands() {
  const ordered = [...commands.values()].sort((a, b) => b.createdMs - a.createdMs);
  for (const command of ordered.slice(50)) commands.delete(command.id);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function confirmCommand(id) {
  const initial = commands.get(id);
  if (!initial || !initial.expectedState) return;
  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  let lastError = '';

  while (Date.now() < deadline) {
    const current = commands.get(id);
    if (!current || FINAL_COMMAND_STATES.has(current.status)) return;
    try {
      const state = await haFetch(`/api/states/${encodeURIComponent(current.entityId)}`);
      const normalised = normaliseEntity(state);
      updateCommand(id, {
        observedState: normalised.state,
        evidence: { state: normalised.state, observedAt: new Date().toISOString() }
      });
      if (normalised.state === current.expectedState) {
        updateCommand(id, {
          status: 'confirmed',
          detail: `Home Assistant confirmed ${current.entityId} is ${normalised.state}.`,
          confirmedAt: new Date().toISOString()
        });
        await refreshEntities().catch(() => undefined);
        return;
      }
      lastError = '';
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'State confirmation failed';
    }
    await delay(CONFIRM_POLL_MS);
  }

  const current = commands.get(id);
  if (!current || FINAL_COMMAND_STATES.has(current.status)) return;
  updateCommand(id, {
    status: 'timed_out',
    detail: lastError
      ? `Confirmation timed out. Last check failed: ${lastError}`
      : `Confirmation timed out. Last observed state was ${current.observedState || 'unknown'}.`
  });
}

async function handleHealth(req, res) {
  if (!configured()) {
    json(req, res, 200, {
      ok: true,
      configured: false,
      commandsEnabled: false,
      status: 'unconfigured',
      entityCount: 0,
      allowlistedEntityCount: 0,
      message: 'Set HA_BASE_URL and HA_TOKEN locally to enable Home Assistant.'
    });
    return;
  }

  try {
    const entities = await refreshEntities();
    json(req, res, 200, {
      ok: true,
      configured: true,
      commandsEnabled: commandsEnabled(),
      status: 'live',
      entityCount: entities.length,
      allowlistedEntityCount: entities.filter((entity) => entity.controllable).length,
      lastEntityRefresh,
      message: ENTITY_ALLOWLIST.size
        ? 'Home Assistant is live. Only explicitly allowlisted entities can receive commands.'
        : 'Home Assistant is live in read-only mode. Set AURA_ENTITY_ALLOWLIST to enable commands.'
    });
  } catch (error) {
    json(req, res, 503, {
      ok: false,
      configured: true,
      commandsEnabled: false,
      status: 'unavailable',
      error: error instanceof Error ? error.message : 'Home Assistant unavailable'
    });
  }
}

async function handleEntities(req, res) {
  if (!configured()) {
    json(req, res, 200, { ok: true, configured: false, entities: [], lastEntityRefresh: '' });
    return;
  }
  try {
    const entities = await refreshEntities();
    json(req, res, 200, {
      ok: true,
      configured: true,
      entities,
      entityCount: entities.length,
      allowlistedEntityCount: entities.filter((entity) => entity.controllable).length,
      lastEntityRefresh
    });
  } catch (error) {
    json(req, res, 503, { ok: false, error: error instanceof Error ? error.message : 'Entity discovery failed' });
  }
}

async function handleCommand(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    json(req, res, 400, { ok: false, status: 'blocked', detail: 'Request body must be valid JSON.' });
    return;
  }

  const entityId = String(body.entityId || '');
  const [domain] = entityId.split('.');
  const service = String(body.service || '');
  const serviceData = body.serviceData && typeof body.serviceData === 'object' ? body.serviceData : {};
  const blocked = commandBlockedReason(entityId, domain, service);
  if (blocked) {
    json(req, res, 200, { ok: false, status: 'blocked', detail: blocked });
    return;
  }

  try {
    const currentState = await haFetch(`/api/states/${encodeURIComponent(entityId)}`);
    const expectedState = String(body.expectedState || expectedStateFor(domain, service, serviceData, String(currentState.state || '')));
    if (!expectedState) {
      json(req, res, 200, {
        ok: false,
        status: 'blocked',
        detail: 'A deterministic expected state is required before AURA can send this command.'
      });
      return;
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const command = {
      id,
      label: String(body.label || `${domain}.${service}`),
      entityId,
      domain,
      service,
      serviceData,
      expectedState,
      observedState: String(currentState.state || 'unknown'),
      status: 'sent',
      detail: 'Command created and ready to send.',
      createdAt: now,
      updatedAt: now,
      createdMs: Date.now(),
      confirmedAt: '',
      evidence: null
    };
    commands.set(id, command);
    pruneCommands();

    await haFetch(`/api/services/${domain}/${service}`, {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId, ...serviceData })
    });
    updateCommand(id, {
      status: 'pending',
      detail: `Command sent. Waiting for ${entityId} to report ${expectedState}.`
    });
    void confirmCommand(id);
    json(req, res, 202, { ok: true, command: commandView(commands.get(id)) });
  } catch (error) {
    json(req, res, 502, {
      ok: false,
      status: 'failed',
      detail: error instanceof Error ? error.message : 'Command failed'
    });
  }
}

function handleCommandStatus(req, res, id) {
  const command = commands.get(id);
  if (!command) {
    json(req, res, 404, { ok: false, error: 'Command not found' });
    return;
  }
  json(req, res, 200, { ok: true, command: commandView(command) });
}

function handleCommandList(req, res) {
  const items = [...commands.values()]
    .sort((a, b) => b.createdMs - a.createdMs)
    .slice(0, 20)
    .map(commandView);
  json(req, res, 200, { ok: true, commands: items });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    json(req, res, 403, { ok: false, error: 'Origin is not allowed by AURA_ALLOWED_ORIGINS' });
    return;
  }
  if (req.method === 'OPTIONS') {
    json(req, res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') return handleHealth(req, res);
    if (req.method === 'GET' && url.pathname === '/entities') return handleEntities(req, res);
    if (req.method === 'GET' && url.pathname === '/commands') return handleCommandList(req, res);
    if (req.method === 'POST' && url.pathname === '/commands') return handleCommand(req, res);
    if (req.method === 'GET' && url.pathname.startsWith('/commands/')) {
      return handleCommandStatus(req, res, decodeURIComponent(url.pathname.slice('/commands/'.length)));
    }
    return notFound(req, res);
  } catch (error) {
    json(req, res, 500, { ok: false, error: error instanceof Error ? error.message : 'Gateway error' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`AURA local gateway listening on http://localhost:${PORT}`);
    console.log(configured() ? 'Home Assistant configuration detected.' : 'Home Assistant is not configured. Set HA_BASE_URL and HA_TOKEN locally.');
    console.log(ENTITY_ALLOWLIST.size ? `${ENTITY_ALLOWLIST.size} entity IDs are allowlisted.` : 'No entities are allowlisted. Gateway is read-only.');
  });
}

module.exports = {
  server,
  normaliseEntity,
  expectedStateFor,
  commandBlockedReason,
  isAllowedOrigin,
  commandsEnabled
};
