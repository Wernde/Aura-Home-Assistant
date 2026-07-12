#!/usr/bin/env node
'use strict';

const http = require('node:http');

const PORT = Number(process.env.AURA_GATEWAY_PORT || 8787);
const HA_BASE_URL = String(process.env.HA_BASE_URL || '').replace(/\/+$/, '');
const HA_TOKEN = String(process.env.HA_TOKEN || '');
const REQUEST_TIMEOUT_MS = Number(process.env.AURA_GATEWAY_TIMEOUT_MS || 7000);

const SAFE_DOMAINS = new Set(['light', 'media_player', 'switch', 'fan', 'climate']);
const BLOCKED_DOMAINS = new Set(['lock', 'alarm_control_panel', 'cover', 'camera']);

let cachedEntities = [];
let lastEntityRefresh = '';

function json(res, status, payload) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  });
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  json(res, 404, { ok: false, error: 'Not found' });
}

function configured() {
  return Boolean(HA_BASE_URL && HA_TOKEN);
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
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(`Home Assistant returned ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function normaliseEntity(entity) {
  const [domain] = String(entity.entity_id || '').split('.');
  return {
    entityId: entity.entity_id,
    domain,
    state: entity.state,
    name: entity.attributes?.friendly_name || entity.entity_id,
    room: entity.attributes?.area_id || '',
    supportedFeatures: entity.attributes?.supported_features || 0,
    risk: BLOCKED_DOMAINS.has(domain) ? 'high' : SAFE_DOMAINS.has(domain) ? 'low' : 'unknown',
    updatedAt: entity.last_changed || entity.last_updated || ''
  };
}

async function refreshEntities() {
  const states = await haFetch('/api/states');
  cachedEntities = states.map(normaliseEntity).filter((entity) => entity.entityId);
  lastEntityRefresh = new Date().toISOString();
  return cachedEntities;
}

function commandBlockedReason(entityId, domain) {
  if (!entityId) return 'entityId is required';
  if (!domain) return 'domain is required';
  if (BLOCKED_DOMAINS.has(domain)) return `${domain} requires a future confirmation and permission policy`;
  if (!SAFE_DOMAINS.has(domain)) return `${domain} is not enabled in the Alpha 0.4 safety allowlist`;
  return '';
}

async function handleHealth(res) {
  if (!configured()) {
    json(res, 200, {
      ok: true,
      configured: false,
      status: 'unconfigured',
      entityCount: 0,
      message: 'Set HA_BASE_URL and HA_TOKEN locally to enable Home Assistant.'
    });
    return;
  }

  try {
    const entities = await refreshEntities();
    json(res, 200, {
      ok: true,
      configured: true,
      status: 'live',
      entityCount: entities.length,
      lastEntityRefresh
    });
  } catch (error) {
    json(res, 503, {
      ok: false,
      configured: true,
      status: 'unavailable',
      error: error instanceof Error ? error.message : 'Home Assistant unavailable'
    });
  }
}

async function handleEntities(res) {
  if (!configured()) {
    json(res, 200, { ok: true, configured: false, entities: [] });
    return;
  }
  try {
    const entities = await refreshEntities();
    json(res, 200, { ok: true, configured: true, entities, lastEntityRefresh });
  } catch (error) {
    json(res, 503, { ok: false, error: error instanceof Error ? error.message : 'Entity discovery failed' });
  }
}

async function handleCommand(req, res) {
  const body = await readBody(req);
  const entityId = String(body.entityId || '');
  const [derivedDomain] = entityId.split('.');
  const domain = String(body.domain || derivedDomain || '');
  const service = String(body.service || '');
  const serviceData = body.serviceData && typeof body.serviceData === 'object' ? body.serviceData : {};
  const expectedState = body.expectedState ? String(body.expectedState) : '';
  const blocked = commandBlockedReason(entityId, domain);

  if (blocked) {
    json(res, 200, { ok: false, status: 'blocked', detail: blocked });
    return;
  }
  if (!service) {
    json(res, 200, { ok: false, status: 'blocked', detail: 'service is required' });
    return;
  }

  try {
    await haFetch(`/api/services/${domain}/${service}`, {
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId, ...serviceData })
    });
    if (!expectedState) {
      json(res, 202, { ok: true, status: 'pending', detail: 'Command sent. No expected state was supplied for confirmation.' });
      return;
    }
    const state = await haFetch(`/api/states/${entityId}`);
    const confirmed = String(state.state) === expectedState;
    json(res, 200, {
      ok: confirmed,
      status: confirmed ? 'confirmed' : 'pending',
      detail: confirmed ? 'Home Assistant confirmed the target state.' : `Current state is ${state.state}.`,
      state: normaliseEntity(state)
    });
  } catch (error) {
    json(res, 502, {
      ok: false,
      status: 'failed',
      detail: error instanceof Error ? error.message : 'Command failed'
    });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') return handleHealth(res);
    if (req.method === 'GET' && url.pathname === '/entities') return handleEntities(res);
    if (req.method === 'POST' && url.pathname === '/commands') return handleCommand(req, res);
    return notFound(res);
  } catch (error) {
    json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Gateway error' });
  }
});

server.listen(PORT, () => {
  console.log(`AURA local gateway listening on http://localhost:${PORT}`);
  console.log(configured() ? 'Home Assistant configuration detected.' : 'Home Assistant is not configured. Set HA_BASE_URL and HA_TOKEN locally.');
});
