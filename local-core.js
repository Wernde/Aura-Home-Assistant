(() => {
  'use strict';

  const KEY = 'aura-local-core-03';
  const defaults = {
    notes: [
      { id: crypto.randomUUID?.() || 'note-1', text: 'Put the bins out on Thursday evening', pinned: true },
      { id: crypto.randomUUID?.() || 'note-2', text: 'Check school bags before leaving', pinned: false }
    ],
    reminders: [],
    routines: [
      { id: 'morning', name: 'Weekday Morning', time: '06:30', enabled: false, scene: 'Good Morning' },
      { id: 'night', name: 'House Sleep', time: '22:00', enabled: false, scene: 'Good Night' }
    ],
    context: { lastTopic: '', lastAction: '', lastEntity: '' },
    greetedPresence: false,
    lastRoutineMinute: ''
  };

  const load = () => {
    try {
      return { ...structuredClone(defaults), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch {
      return structuredClone(defaults);
    }
  };
  const data = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(data));
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const response = $('#response');
  const input = $('#input');

  function setState(state, label) {
    window.AURA?.setState?.(state, label);
  }

  function answer(text, options = {}) {
    response.textContent = text;
    setState('speaking');
    const speak = options.speak !== false;
    const localState = window.AURA?.state?.() || {};
    if (speak && localState.voice !== false && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-AU';
      utterance.rate = 0.96;
      utterance.pitch = 0.94;
      utterance.volume = Number(localState.volume ?? 0.78);
      utterance.onend = () => setState('idle');
      utterance.onerror = () => setState('idle');
      speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setState('idle'), 1500);
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

  function renderNotesPanel() {
    const notes = data.notes.map((note) => `
      <div class="list-item">
        <div><strong>${note.pinned ? '📌 ' : ''}${esc(note.text)}</strong><small>${note.pinned ? 'Pinned household note' : 'Household note'}</small></div>
        <button data-delete-note="${esc(note.id)}" aria-label="Delete note">×</button>
      </div>`).join('') || '<p class="empty-state">No household notes yet.</p>';
    openPanel('Local household memory', 'Family notes', `
      <div id="localNotes">${notes}</div>
      <form class="add-form" id="localNoteForm"><input id="localNoteInput" maxlength="120" placeholder="Add a household note…"><button>Add</button></form>`);
    $('#localNoteForm').onsubmit = (event) => {
      event.preventDefault();
      const text = $('#localNoteInput').value.trim();
      if (!text) return;
      data.notes.unshift({ id: crypto.randomUUID?.() || String(Date.now()), text, pinned: false });
      save();
      renderNotesPanel();
    };
    document.querySelectorAll('[data-delete-note]').forEach((button) => {
      button.onclick = () => {
        data.notes = data.notes.filter((note) => note.id !== button.dataset.deleteNote);
        save();
        renderNotesPanel();
      };
    });
  }

  function renderRoutinesPanel() {
    const routines = data.routines.map((routine) => `
      <div class="list-item routine-item">
        <input type="checkbox" data-routine-toggle="${esc(routine.id)}" ${routine.enabled ? 'checked' : ''}>
        <div><strong>${esc(routine.name)}</strong><small>${esc(routine.time)} · ${esc(routine.scene)}</small></div>
        <button data-run-routine="${esc(routine.id)}">Run</button>
      </div>`).join('');
    openPanel('Local automation', 'Household routines', `
      <p class="panel-copy">These routines run in this browser only while AURA is open.</p>
      ${routines}
      <form class="settings" id="routineForm">
        <label><b>Routine name</b><input name="name" type="text" maxlength="40" required></label>
        <label><b>Time</b><input name="time" type="time" required></label>
        <label><b>Scene</b><select name="scene"><option>Good Morning</option><option>Movie Night</option><option>Dinner Time</option><option>Good Night</option></select></label>
        <button class="primary">Add routine</button>
      </form>`);
    document.querySelectorAll('[data-routine-toggle]').forEach((box) => {
      box.onchange = () => {
        const routine = data.routines.find((item) => item.id === box.dataset.routineToggle);
        if (routine) routine.enabled = box.checked;
        save();
      };
    });
    document.querySelectorAll('[data-run-routine]').forEach((button) => {
      button.onclick = () => {
        const routine = data.routines.find((item) => item.id === button.dataset.runRoutine);
        if (routine) activateScene(routine.scene, `${routine.name} routine`);
      };
    });
    $('#routineForm').onsubmit = (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      data.routines.push({
        id: crypto.randomUUID?.() || String(Date.now()),
        name: String(form.get('name')).trim(),
        time: String(form.get('time')),
        scene: String(form.get('scene')),
        enabled: true
      });
      save();
      renderRoutinesPanel();
    };
  }

  function activateScene(scene, source = 'local command') {
    const button = [...document.querySelectorAll('[data-scene]')].find((item) => item.dataset.scene === scene);
    if (button) button.click();
    data.context = { lastTopic: 'scene', lastAction: 'activate', lastEntity: scene };
    save();
    setTimeout(() => { response.textContent = `${source} activated ${scene}.`; }, 50);
  }

  function addReminder(text, whenText = '') {
    const reminder = {
      id: crypto.randomUUID?.() || String(Date.now()),
      text,
      whenText,
      createdAt: new Date().toISOString(),
      completed: false
    };
    data.reminders.push(reminder);
    save();
    return reminder;
  }

  function listMemory() {
    const noteText = data.notes.length ? data.notes.slice(0, 4).map((note) => note.text).join('; ') : 'no household notes';
    const reminderText = data.reminders.filter((item) => !item.completed).length;
    return `I have ${data.notes.length} household notes and ${reminderText} open reminders. Current notes include: ${noteText}.`;
  }

  function processLocalCommand(raw) {
    const command = raw.trim();
    if (!command) return false;
    const lower = command.toLowerCase();
    setState('thinking', 'Local reasoning');
    response.textContent = `Understanding locally: “${command}”`;

    setTimeout(() => {
      let message = '';
      let handled = true;

      const rememberMatch = command.match(/^(?:aura[, ]+)?(?:remember|note|make a note)(?: that)?\s+(.+)$/i);
      const remindMatch = command.match(/^(?:aura[, ]+)?remind (?:me|us|the family)?\s*(?:to)?\s+(.+?)(?:\s+(tomorrow|tonight|this evening|in the morning|at \d{1,2}(?::\d{2})?\s*(?:am|pm)?))?$/i);
      const addShopping = command.match(/^(?:aura[, ]+)?add\s+(.+?)\s+to (?:the )?shopping list$/i);

      if (rememberMatch) {
        data.notes.unshift({ id: crypto.randomUUID?.() || String(Date.now()), text: rememberMatch[1].trim(), pinned: false });
        data.context = { lastTopic: 'notes', lastAction: 'create', lastEntity: rememberMatch[1].trim() };
        message = `I’ve saved that as a household note: ${rememberMatch[1].trim()}.`;
      } else if (remindMatch) {
        const reminder = addReminder(remindMatch[1].trim(), remindMatch[2] || '');
        data.context = { lastTopic: 'reminders', lastAction: 'create', lastEntity: reminder.text };
        message = `I’ve created a local reminder to ${reminder.text}${reminder.whenText ? ` ${reminder.whenText}` : ''}.`;
      } else if (addShopping) {
        const current = window.AURA?.state?.();
        if (current?.shopping) current.shopping.push({ text: addShopping[1].trim(), done: false });
        message = `I’ve added ${addShopping[1].trim()} to the shopping list.`;
        data.context = { lastTopic: 'shopping', lastAction: 'add', lastEntity: addShopping[1].trim() };
      } else if (/show|open/.test(lower) && /note|memory/.test(lower)) {
        renderNotesPanel();
        message = listMemory();
      } else if (/show|open/.test(lower) && /routine|automation/.test(lower)) {
        renderRoutinesPanel();
        message = `You have ${data.routines.length} local routines. ${data.routines.filter((item) => item.enabled).length} are enabled.`;
      } else if (/what do you remember|household memory|what have you remembered/.test(lower)) {
        message = listMemory();
      } else if (/what did i just ask|what was my last request/.test(lower)) {
        message = data.context.lastEntity ? `Your last local request involved ${data.context.lastEntity}.` : 'I do not have a previous local request in memory yet.';
      } else if (/privacy mode/.test(lower)) {
        window.AURA_AWARENESS?.privacy?.();
        message = 'Privacy mode has been toggled. The camera and microphone status is shown on screen.';
      } else if (/camera|presence detection|awareness/.test(lower) && /enable|turn on|start/.test(lower)) {
        window.AURA_AWARENESS?.enable?.();
        message = 'I’m requesting camera permission for local presence detection.';
      } else if (/camera|presence detection|awareness/.test(lower) && /disable|turn off|stop/.test(lower)) {
        window.AURA_AWARENESS?.disable?.();
        message = 'Local camera awareness is now off.';
      } else if (/run|activate/.test(lower) && /morning/.test(lower)) {
        activateScene('Good Morning');
        message = 'Good Morning is active.';
      } else if (/run|activate/.test(lower) && /movie/.test(lower)) {
        activateScene('Movie Night');
        message = 'Movie Night is active.';
      } else if (/run|activate/.test(lower) && /dinner/.test(lower)) {
        activateScene('Dinner Time');
        message = 'Dinner Time is active.';
      } else if (/run|activate/.test(lower) && /(night|sleep)/.test(lower)) {
        activateScene('Good Night');
        message = 'Good Night is active.';
      } else if (/help|what can you do/.test(lower)) {
        message = 'Without cloud AI, I can still control local demo systems, run scenes, manage shopping and calendar items, store household notes, create local reminders, run scheduled routines, use browser speech, and react to local camera presence.';
      } else {
        handled = false;
      }

      if (handled) {
        save();
        answer(message);
      } else {
        window.AURA?.run?.(command);
      }
    }, 320);
    return true;
  }

  function installUI() {
    const quickGrid = document.querySelector('.quick-grid');
    if (quickGrid && !$('#localNotesButton')) {
      const notesButton = document.createElement('button');
      notesButton.className = 'quick';
      notesButton.id = 'localNotesButton';
      notesButton.innerHTML = '<strong>Family notes</strong><small>Local household memory</small>';
      notesButton.onclick = renderNotesPanel;
      quickGrid.appendChild(notesButton);

      const routinesButton = document.createElement('button');
      routinesButton.className = 'quick';
      routinesButton.id = 'localRoutinesButton';
      routinesButton.innerHTML = '<strong>Routines</strong><small>Local automations</small>';
      routinesButton.onclick = renderRoutinesPanel;
      quickGrid.appendChild(routinesButton);
    }

    const footer = document.querySelector('.footer');
    if (footer && !$('#localCoreStatus')) {
      const status = document.createElement('span');
      status.id = 'localCoreStatus';
      status.innerHTML = '<i></i>Local intelligence active';
      footer.appendChild(status);
    }
  }

  function checkRoutines() {
    const now = new Date();
    const minute = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (data.lastRoutineMinute === minute) return;
    data.lastRoutineMinute = minute;
    data.routines.filter((routine) => routine.enabled && routine.time === minute).forEach((routine) => activateScene(routine.scene, routine.name));
    save();
  }

  function presenceBridge() {
    const awareness = window.AURA_AWARENESS?.state?.();
    if (!awareness) return;
    if (awareness.presence && !data.greetedPresence && !awareness.privacyMode) {
      data.greetedPresence = true;
      save();
      setState('listening', 'Presence detected');
      response.textContent = 'I can see that someone has approached. AURA is attentive.';
      setTimeout(() => setState('idle'), 1700);
    }
    if (!awareness.presence && data.greetedPresence) {
      data.greetedPresence = false;
      save();
    }
  }

  const form = $('#command');
  form?.addEventListener('submit', (event) => {
    const value = input?.value?.trim();
    if (!value) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = '';
    processLocalCommand(value);
  }, true);

  installUI();
  setInterval(checkRoutines, 15000);
  setInterval(presenceBridge, 700);
  window.AURA_LOCAL = { process: processLocalCommand, notes: renderNotesPanel, routines: renderRoutinesPanel, state: () => structuredClone(data) };
})();