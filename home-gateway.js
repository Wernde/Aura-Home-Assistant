(() => {
  'use strict';

  const KEY = 'aura-home-gateway-04';
  const COMMAND_LIMIT = 5;
  const defaults = {
    enabled: false,
    gatewayUrl: '',
    status: 'simulated',
    lastHealth: '',
    lastError: '',
    entityCount: 0,
    commandLog: []
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

  function load() {
    try {
      return { ...clone(defaults), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch {
      return clone(defaults);
    }
  }

  const data = load();
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

  function normaliseUrl(value) {
    const trimmed = String(value || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    try {
      const url = new URL(trimmed);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
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
      elements.state.textContent = data.status === 'live' ? `${data.entityCount} entities` : data.enabled ? 'Awaiting health check' : 'Demo only';
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
    if (data.status === 'live') return 'Live local gateway';
    if (data.lastError) return data.lastError;
    return 'Waiting for gateway health';
  }

  function renderCommandLog() {
    const items = data.commandLog.map((item) => `
      <div class="command-log-item" data-status="${esc(item.status)}">
        <span>${esc(item.createdAt)}</span>
        <b>${esc(item.status)} - ${esc(item.label)}</b>
        <small>${esc(item.detail)}</small>
      </div>`).join('');
    return items || '<p class="empty-state">No gateway commands have been sent.</p>';
  }

  function renderPanel() {
    openPanel('Local home gateway', 'Home Assistant gateway', `
      <p class="gateway-copy">Alpha 0.4 connects AURA to Home Assistant through a local gateway service. Keep Home Assistant tokens in that service, not in this browser or the repository.</p>
      <div class="gateway-warning"><strong>No paid API required.</strong> A fresh clone remains fully usable with this gateway disabled.</div>
      <div class="gateway-status-grid">
        <div><span>Status</span><b>${esc(statusText())}</b></div>
        <div><span>Mode</span><b>${esc(displayMode())}</b></div>
        <div><span>Gateway URL</span><b>${data.gatewayUrl ? esc(data.gatewayUrl) : 'Not set'}</b></div>
        <div><span>Entities</span><b>${data.entityCount}</b></div>
      </div>
      <form class="gateway-form" id="gatewayForm">
        <label><b>Local gateway URL</b><input name="gatewayUrl" inputmode="url" placeholder="http://localhost:8787" value="${esc(data.gatewayUrl)}"></label>
        <label class="check"><span><b>Enable local gateway</b><small>Use only when a trusted local service is running.</small></span><input type="checkbox" name="enabled" ${data.enabled ? 'checked' : ''}></label>
        <div class="gateway-actions">
          <button class="primary" type="submit">Save gateway</button>
          <button class="secondary" id="gatewayHealth" type="button">Check health</button>
        </div>
      </form>
      <h3>Command lifecycle</h3>
      <div class="command-log">${renderCommandLog()}</div>`);

    $('#gatewayForm').onsubmit = (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      data.enabled = Boolean(event.target.enabled.checked);
      data.gatewayUrl = normaliseUrl(form.get('gatewayUrl'));
      if (data.enabled && !data.gatewayUrl) {
        data.enabled = false;
        data.status = 'simulated';
        data.lastError = 'A valid local gateway URL is required.';
      }
      save();
      renderSummary();
      renderPanel();
    };
    $('#gatewayHealth').onclick = checkHealth;
  }

  async function checkHealth() {
    if (!data.enabled || !data.gatewayUrl) {
      data.status = 'simulated';
      data.lastError = data.enabled ? 'A valid local gateway URL is required.' : '';
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
      if (!health.ok) throw new Error(`Health check returned ${health.status}`);
      const payload = await health.json().catch(() => ({}));
      data.status = 'live';
      data.lastHealth = new Date().toISOString();
      data.lastError = '';
      data.entityCount = Number(payload.entityCount ?? payload.entities ?? data.entityCount ?? 0);
      setAuraState('idle', 'Ready');
      setResponse('The local Home Assistant gateway is reachable. Real commands still require confirmed device state.');
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

  function addCommand(label, status, detail) {
    data.commandLog.unshift({
      id: crypto.randomUUID?.() || String(Date.now()),
      label,
      status,
      detail,
      createdAt: new Intl.DateTimeFormat('en-AU', {
        timeZone: 'Australia/Brisbane',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date())
    });
    data.commandLog = data.commandLog.slice(0, COMMAND_LIMIT);
    save();
    renderSummary();
  }

  async function sendDemoCommand(label) {
    if (!data.enabled || data.status !== 'live') {
      addCommand(label, 'blocked', 'Gateway is disabled or unavailable. AURA kept the action in demo mode.');
      setAuraState('alert', 'Blocked');
      setResponse('I did not send that to a real device because the local gateway is not live.');
      setTimeout(() => setAuraState('idle'), 1800);
      return true;
    }
    addCommand(label, 'sent', 'Command submitted to local gateway. Waiting for confirmed state.');
    setAuraState('thinking', 'Pending confirmation');
    setResponse('Command sent to the local gateway. I will only call it complete after confirmed state.');
    try {
      const res = await fetch(`${data.gatewayUrl}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, source: 'aura-wall-display' })
      });
      if (!res.ok) throw new Error(`Command returned ${res.status}`);
      const payload = await res.json().catch(() => ({}));
      addCommand(label, payload.status || 'pending', payload.detail || 'Gateway accepted the command.');
    } catch (error) {
      addCommand(label, 'failed', error instanceof Error ? error.message : 'Command failed');
      setAuraState('alert', 'Command failed');
      setResponse('The gateway command failed. I have not claimed the device changed state.');
      setTimeout(() => setAuraState('idle'), 2200);
    }
    return true;
  }

  function handleLocalCommand(raw) {
    const command = String(raw || '').trim();
    const lower = command.toLowerCase();
    if (!command) return false;
    if (/home assistant|gateway|real device|live device/.test(lower) && /status|health|check|configure|open/.test(lower)) {
      renderPanel();
      if (/status|health|check/.test(lower)) checkHealth();
      return true;
    }
    if (/send|run|activate|turn/.test(lower) && /real|home assistant|gateway/.test(lower)) {
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
    sendDemoCommand
  };
})();
