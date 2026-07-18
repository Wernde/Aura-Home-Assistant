(() => {
  'use strict';

  const KEY = 'aura-home-gateway-04';
  const COMMAND_LIMIT = 8;
  const FINAL_STATES = new Set(['confirmed', 'failed', 'timed_out', 'blocked']);
  const defaults = {
    enabled: false,
    gatewayUrl: '',
    status: 'simulated',
    lastHealth: '',
    lastError: '',
    entityCount: 0,
    allowlistedEntityCount: 0,
    entities: [],
    commandLog: []
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function load() {
    try {
      return { ...clone(defaults), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch {
      return clone(defaults);
    }
  }

  const data = load();
  if (!Array.isArray(data.entities)) data.entities = [];
  if (!Array.isArray(data.commandLog)) data.commandLog = [];

  const elements = {
    card: $('.gateway-card'),
    title: $('#gatewayTitle'),
    pill: $('#gatewayPill'),
    connection: $('#gatewayConnection'),
    state: $('#gatewayState'),
    command: $('#gatewayCommand'),
    open: $('#gatewayOpen'),
    response: $('#response')
  };

  function save() {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function setAuraState(state, label) {
    window.AURA?.setState?.(state, label);
  }

  function setResponse(text) {
    if (elements.response) elements.response.textContent = text;
  }

  function isLocalHost(hostname) {
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return true;
    if (hostname.endsWith('.local')) return true;
    const parts = hostname.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return false;
    return parts[0] === 10
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168);
  }

  function normaliseUrl(value) {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    try {
      const url = new URL(trimmed);
      if (!['http:', 'https:'].includes(url.protocol) || !isLocalHost(url.hostname)) return '';
      return url.toString().replace(/\/+$/, '');
    } catch {
      return '';
    }
  }

  function displayMode() {
    if (!data.enabled) return 'simulated';
    if (data.status === 'live') return 'live';
    return 'unavailable';
  }

  function renderSummary() {
    const mode = displayMode();
    elements.card?.setAttribute('data-gateway', mode);
    if (elements.title) elements.title.textContent = mode === 'live' ? 'Gateway live' : mode === 'unavailable' ? 'Gateway unavailable' : 'Gateway offline';
    if (elements.pill) elements.pill.textContent = mode === 'live' ? 'Live' : mode === 'unavailable' ? 'Unavailable' : 'Simulated';
    if (elements.connection) {
      elements.connection.textContent = !data.enabled ? 'Not configured' : data.status === 'live' ? 'Connected locally' : 'Needs local gateway';
    }
    if (elements.state) {
      elements.state.textContent = data.status === 'live'
        ? `${data.allowlistedEntityCount} live · ${data.entityCount} discovered`
        : data.enabled ? 'Awaiting health check' : 'Demo only';
    }
    if (elements.command) {
      const last = data.commandLog[0];
      elements.command.textContent = last ? `${last.status}: ${last.label}` : 'None';
    }
  }

  function openPanel(eyebrow, title, html) {
    $('#drawerEye').textContent = eyebrow;
    $('#drawerTitle').textContent = title;
    $('#drawerContent').innerHTML = html;
    $('#backdrop').classList.remove('hidden');
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
  }

  function statusText() {
    if (!data.enabled) return 'Disabled by default';
    if (data.status === 'live') return data.allowlistedEntityCount ? 'Live with confirmed controls' : 'Live read-only';
    if (data.lastError) return data.lastError;
    return 'Waiting for gateway health';
  }

  function formatTime(value) {
    if (!value) return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Brisbane', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Brisbane', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function renderCommandLog() {
    const items = data.commandLog.map((item) => `
      <div class="command-log-item" data-status="${esc(item.status)}">
        <span>${esc(formatTime(item.updatedAt || item.createdAt))}</span>
        <b>${esc(item.status)} - ${esc(item.label)}</b>
        <small>${esc(item.detail)}</small>
        ${item.observedState ? `<small>Observed state: ${esc(item.observedState)}</small>` : ''}
      </div>`).join('');
    return items || '<p class="empty-state">No gateway commands have been sent.</p>';
  }

  function actionFor(entity) {
    if (!entity?.controllable) return null;
    if (['light', 'switch', 'fan'].includes(entity.domain)) {
      const turningOff = entity.state === 'on';
      return { service: turningOff ? 'turn_off' : 'turn_on', expectedState: turningOff ? 'off' : 'on', label: `${turningOff ? 'Turn off' : 'Turn on'} ${entity.name}` };
    }
    if (entity.domain === 'media_player') {
      const pausing = entity.state === 'playing';
      return { service: pausing ? 'media_pause' : 'media_play', expectedState: pausing ? 'paused' : 'playing', label: `${pausing ? 'Pause' : 'Play'} ${entity.name}` };
    }
    return null;
  }

  function renderEntities() {
    if (data.status !== 'live') return '<p class="empty-state">Connect the local gateway to discover Home Assistant entities.</p>';
    const controllable = data.entities.filter((entity) => entity.controllable);
    if (!controllable.length) {
      return '<div class="gateway-warning"><strong>Read-only mode.</strong> Home Assistant is connected, but no entities are explicitly allowlisted. Set <code>AURA_ENTITY_ALLOWLIST</code> in the gateway environment.</div>';
    }
    return controllable.map((entity) => {
      const action = actionFor(entity);
      return `
        <div class="gateway-entity" data-entity-state="${esc(entity.state)}">
          <div class="gateway-entity-copy">
            <span>${esc(entity.domain.replace('_', ' '))} · allowlisted</span>
            <b>${esc(entity.name)}</b>
            <small>${esc(entity.entityId)} · ${esc(entity.state)}</small>
          </div>
          ${action ? `<button class="secondary gateway-entity-action" type="button" data-entity-id="${esc(entity.entityId)}" data-service="${esc(action.service)}" data-expected-state="${esc(action.expectedState)}" data-label="${esc(action.label)}">${esc(action.label.replace(` ${entity.name}`, ''))}</button>` : '<span class="gateway-read-only">Read only</span>'}
        </div>`;
    }).join('');
  }

  function bindPanelActions() {
    const form = $('#gatewayForm');
    if (form) {
      form.onsubmit = (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        data.enabled = Boolean(event.target.enabled.checked);
        data.gatewayUrl = normaliseUrl(formData.get('gatewayUrl'));
        if (data.enabled && !data.gatewayUrl) {
          data.enabled = false;
          data.status = 'simulated';
          data.lastError = 'Use a valid localhost, .local or private-network gateway URL.';
        }
        save();
        renderSummary();
        renderPanel();
      };
    }
    const health = $('#gatewayHealth');
    if (health) health.onclick = checkHealth;
    const refresh = $('#gatewayRefreshEntities');
    if (refresh) refresh.onclick = () => loadEntities();
    $$('.gateway-entity-action').forEach((button) => {
      button.onclick = () => sendEntityCommand({
        entityId: button.dataset.entityId,
        service: button.dataset.service,
        expectedState: button.dataset.expectedState,
        label: button.dataset.label
      });
    });
  }

  function renderPanel() {
    openPanel('Local home gateway', 'Home Assistant gateway', `
      <p class="gateway-copy">AURA connects through a local gateway service. Home Assistant tokens remain in the gateway environment and never enter this browser or repository.</p>
      <div class="gateway-warning"><strong>Confirmed state only.</strong> AURA does not call a real action complete until Home Assistant reports the expected state.</div>
      <div class="gateway-status-grid">
        <div><span>Status</span><b>${esc(statusText())}</b></div>
        <div><span>Mode</span><b>${esc(displayMode())}</b></div>
        <div><span>Gateway URL</span><b>${data.gatewayUrl ? esc(data.gatewayUrl) : 'Not set'}</b></div>
        <div><span>Entities</span><b>${data.allowlistedEntityCount} live · ${data.entityCount} discovered</b></div>
      </div>
      <form class="gateway-form" id="gatewayForm">
        <label><b>Local gateway URL</b><input name="gatewayUrl" inputmode="url" placeholder="http://localhost:8787" value="${esc(data.gatewayUrl)}"></label>
        <label class="check"><span><b>Enable local gateway</b><small>Use only when a trusted local service is running.</small></span><input type="checkbox" name="enabled" ${data.enabled ? 'checked' : ''}></label>
        <div class="gateway-actions">
          <button class="primary" type="submit">Save gateway</button>
          <button class="secondary" id="gatewayHealth" type="button">Check health</button>
        </div>
      </form>
      <div class="gateway-section-head"><div><p class="eyebrow">Confirmed controls</p><h3>Allowlisted devices</h3></div><button class="icon-btn" id="gatewayRefreshEntities" type="button" aria-label="Refresh Home Assistant entities">↻</button></div>
      <div class="gateway-entities">${renderEntities()}</div>
      <h3>Command lifecycle</h3>
      <div class="command-log">${renderCommandLog()}</div>`);
    bindPanelActions();
  }

  async function loadEntities(options = {}) {
    if (!data.enabled || !data.gatewayUrl || data.status !== 'live') return [];
    if (!options.silent) {
      setAuraState('thinking', 'Refreshing devices');
      setResponse('Refreshing allowlisted Home Assistant device states.');
    }
    try {
      const response = await fetch(`${data.gatewayUrl}/entities`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Entity discovery returned ${response.status}`);
      const payload = await response.json();
      data.entities = Array.isArray(payload.entities) ? payload.entities : [];
      data.entityCount = Number(payload.entityCount ?? data.entities.length);
      data.allowlistedEntityCount = Number(payload.allowlistedEntityCount ?? data.entities.filter((entity) => entity.controllable).length);
      data.lastError = '';
      save();
      renderSummary();
      if (!options.silent) {
        setAuraState('idle', 'Ready');
        setResponse(`Home Assistant reported ${data.allowlistedEntityCount} allowlisted controls from ${data.entityCount} discovered entities.`);
        renderPanel();
      }
      return data.entities;
    } catch (error) {
      data.status = 'unavailable';
      data.lastError = error instanceof Error ? error.message : 'Entity discovery failed';
      save();
      renderSummary();
      setAuraState('alert', 'Gateway unavailable');
      setResponse('Entity discovery failed. AURA has not changed any real device.');
      setTimeout(() => setAuraState('idle'), 2200);
      if (!options.silent) renderPanel();
      return [];
    }
  }

  async function checkHealth() {
    if (!data.enabled || !data.gatewayUrl) {
      data.status = 'simulated';
      data.lastError = data.enabled ? 'A valid local-network gateway URL is required.' : '';
      save();
      renderSummary();
      renderPanel();
      setResponse('The Home Assistant gateway is disabled. AURA is staying in local demo mode.');
      return;
    }

    setAuraState('thinking', 'Checking gateway');
    setResponse('Checking the local Home Assistant gateway.');
    try {
      const health = await fetch(`${data.gatewayUrl}/health`, { cache: 'no-store' });
      const payload = await health.json().catch(() => ({}));
      if (!health.ok) throw new Error(payload.error || `Health check returned ${health.status}`);
      data.status = payload.status === 'live' ? 'live' : 'unavailable';
      data.lastHealth = new Date().toISOString();
      data.lastError = data.status === 'live' ? '' : payload.message || 'Home Assistant is not configured in the local gateway.';
      data.entityCount = Number(payload.entityCount ?? 0);
      data.allowlistedEntityCount = Number(payload.allowlistedEntityCount ?? 0);
      if (data.status === 'live') {
        await loadEntities({ silent: true });
        setAuraState('idle', 'Ready');
        setResponse(payload.commandsEnabled
          ? 'Home Assistant is live. Only explicitly allowlisted devices can receive confirmed commands.'
          : 'Home Assistant is live in read-only mode. Add an entity allowlist before enabling commands.');
      } else {
        setAuraState('alert', 'Gateway unconfigured');
        setResponse('The local gateway is reachable, but Home Assistant has not been configured.');
        setTimeout(() => setAuraState('idle'), 2200);
      }
    } catch (error) {
      data.status = 'unavailable';
      data.lastError = error instanceof Error ? error.message : 'Gateway unavailable';
      setAuraState('alert', 'Gateway unavailable');
      setResponse('I could not reach the local Home Assistant gateway. Simulated controls remain available.');
      setTimeout(() => setAuraState('idle'), 2200);
    }
    save();
    renderSummary();
    renderPanel();
  }

  function upsertCommand(command) {
    const record = {
      id: command.id || (crypto.randomUUID?.() || String(Date.now())),
      label: command.label || command.entityId || 'Home Assistant command',
      status: command.status || 'pending',
      detail: command.detail || 'Waiting for gateway update.',
      entityId: command.entityId || '',
      expectedState: command.expectedState || '',
      observedState: command.observedState || '',
      createdAt: command.createdAt || new Date().toISOString(),
      updatedAt: command.updatedAt || new Date().toISOString()
    };
    const existingIndex = data.commandLog.findIndex((item) => item.id === record.id);
    if (existingIndex >= 0) data.commandLog.splice(existingIndex, 1);
    data.commandLog.unshift(record);
    data.commandLog = data.commandLog.slice(0, COMMAND_LIMIT);
    save();
    renderSummary();
    return record;
  }

  function addCommand(label, status, detail) {
    return upsertCommand({ label, status, detail });
  }

  async function pollCommand(commandId) {
    const deadline = Date.now() + 16000;
    while (Date.now() < deadline) {
      await sleep(650);
      try {
        const response = await fetch(`${data.gatewayUrl}/commands/${encodeURIComponent(commandId)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Command status returned ${response.status}`);
        const payload = await response.json();
        const command = upsertCommand(payload.command || {});
        if (FINAL_STATES.has(command.status)) {
          if (command.status === 'confirmed') {
            await loadEntities({ silent: true });
            setAuraState('idle', 'Confirmed');
            setResponse(command.detail || 'Home Assistant confirmed the device state.');
          } else {
            setAuraState('alert', command.status === 'timed_out' ? 'Confirmation timed out' : 'Command failed');
            setResponse(command.detail || 'The device state was not confirmed.');
            setTimeout(() => setAuraState('idle'), 2400);
          }
          renderPanel();
          return command;
        }
      } catch (error) {
        upsertCommand({ id: commandId, status: 'failed', detail: error instanceof Error ? error.message : 'Command status failed' });
        setAuraState('alert', 'Command status failed');
        setResponse('I could not verify the command. I have not claimed the device changed state.');
        setTimeout(() => setAuraState('idle'), 2400);
        renderPanel();
        return null;
      }
    }
    upsertCommand({ id: commandId, status: 'timed_out', detail: 'The browser stopped waiting before a confirmed state arrived.' });
    setAuraState('alert', 'Confirmation timed out');
    setResponse('The command was not confirmed in time. I have not reported it as complete.');
    setTimeout(() => setAuraState('idle'), 2400);
    renderPanel();
    return null;
  }

  async function sendEntityCommand({ entityId, service, expectedState, label }) {
    if (!data.enabled || data.status !== 'live') {
      addCommand(label || 'Home Assistant action', 'blocked', 'Gateway is disabled or unavailable. AURA kept the action in demo mode.');
      setAuraState('alert', 'Blocked');
      setResponse('I did not send that to a real device because the local gateway is not live.');
      setTimeout(() => setAuraState('idle'), 1800);
      renderPanel();
      return true;
    }
    if (!entityId || !service || !expectedState) {
      addCommand(label || 'Home Assistant action', 'blocked', 'A specific allowlisted device and expected state are required.');
      setResponse('Choose a specific allowlisted device before I send a real command.');
      renderPanel();
      return true;
    }

    setAuraState('thinking', 'Sending command');
    setResponse(`Sending ${label} through the local gateway. I will wait for confirmed state.`);
    try {
      const response = await fetch(`${data.gatewayUrl}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, service, expectedState, label, source: 'aura-wall-display' })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `Command returned ${response.status}`);
      if (!payload.ok || !payload.command) {
        addCommand(label, payload.status || 'blocked', payload.detail || 'Gateway blocked the command.');
        setAuraState('alert', 'Command blocked');
        setResponse(payload.detail || 'The gateway blocked that command.');
        setTimeout(() => setAuraState('idle'), 2200);
        renderPanel();
        return true;
      }
      const command = upsertCommand(payload.command);
      setAuraState('thinking', 'Pending confirmation');
      setResponse(command.detail || 'Command sent. Waiting for confirmed device state.');
      renderPanel();
      await pollCommand(command.id);
    } catch (error) {
      addCommand(label, 'failed', error instanceof Error ? error.message : 'Command failed');
      setAuraState('alert', 'Command failed');
      setResponse('The gateway command failed. I have not claimed the device changed state.');
      setTimeout(() => setAuraState('idle'), 2200);
      renderPanel();
    }
    return true;
  }

  async function sendDemoCommand(label) {
    const candidates = data.entities.filter((entity) => entity.controllable && actionFor(entity));
    if (candidates.length !== 1) {
      addCommand(label, 'blocked', candidates.length ? 'Choose a specific allowlisted device.' : 'No allowlisted controllable entity is available.');
      setAuraState('alert', 'Needs a device');
      setResponse(candidates.length
        ? 'I need you to choose a specific allowlisted device before sending a real command.'
        : 'No allowlisted Home Assistant device is available for that command.');
      setTimeout(() => setAuraState('idle'), 2000);
      renderPanel();
      return true;
    }
    const entity = candidates[0];
    return sendEntityCommand({ entityId: entity.entityId, ...actionFor(entity) });
  }

  function handleLocalCommand(raw) {
    const command = String(raw || '').trim();
    const lower = command.toLowerCase();
    if (!command) return false;
    if (/home assistant|gateway|real device|live device/.test(lower) && /status|health|check|configure|open|devices/.test(lower)) {
      renderPanel();
      if (/status|health|check/.test(lower)) checkHealth();
      if (/devices/.test(lower)) loadEntities();
      return true;
    }
    if (/send|run|activate|turn|play|pause/.test(lower) && /real|home assistant|gateway/.test(lower)) {
      sendDemoCommand(command);
      return true;
    }
    return false;
  }

  const form = $('#command');
  const input = $('#input');
  form?.addEventListener('submit', (event) => {
    const value = input?.value?.trim();
    if (!value || !handleLocalCommand(value)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = '';
  }, true);

  elements.open?.addEventListener('click', renderPanel);
  renderSummary();
  window.AURA_GATEWAY = {
    state: () => clone(data),
    open: renderPanel,
    checkHealth,
    loadEntities,
    sendEntityCommand,
    sendDemoCommand
  };
})();
