(() => {
  'use strict';

  const STORAGE_KEY = 'aura-awareness-02';
  const defaults = { cameraEnabled: false, privacyMode: false, presenceWake: true };
  const state = load();

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    awarenessButton: $('#awarenessButton'),
    awarenessOpen: $('#awarenessOpen'),
    awarenessLabel: $('#awarenessLabel'),
    privacyButton: $('#privacyButton'),
    privacyStatus: $('#privacyStatus'),
    presenceState: $('#presenceState'),
    presenceMetric: $('#presenceMetric'),
    trackingMetric: $('#trackingMetric'),
    processingMetric: $('#processingMetric'),
    perceptionTitle: $('#perceptionTitle'),
    panel: $('#awarenessPanel'),
    backdrop: $('#awarenessBackdrop'),
    close: $('#awarenessClose'),
    video: $('#cameraFeed'),
    motionCanvas: $('#motionCanvas'),
    placeholder: $('#cameraPlaceholder'),
    cameraStage: $('.camera-stage'),
    cameraToggle: $('#cameraToggle'),
    panelPrivacyToggle: $('#panelPrivacyToggle'),
    cameraIndicatorText: $('#cameraIndicatorText'),
    detectionMethod: $('#detectionMethod'),
    lastPresence: $('#lastPresence'),
    secureContext: $('#secureContext'),
    installStatus: $('#installStatus'),
    installButton: $('#installButton'),
    response: $('#response')
  };

  let stream = null;
  let detector = null;
  let frameHandle = null;
  let previousFrame = null;
  let lastDetectedAt = 0;
  let presence = false;
  let greetedAt = 0;
  let installPrompt = null;
  let detectorBusy = false;

  function load() {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch {
      return { ...defaults };
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Brisbane',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(timestamp));
  }

  function setPresence(next, source = 'Local sensor') {
    if (state.privacyMode) next = false;
    const changed = presence !== next;
    presence = next;
    document.body.dataset.presence = state.privacyMode ? 'private' : next ? 'detected' : state.cameraEnabled ? 'searching' : 'unknown';

    elements.presenceMetric.textContent = next ? 'Detected' : state.cameraEnabled ? 'Scanning' : 'Unknown';
    elements.trackingMetric.textContent = next ? 'Following attention' : state.cameraEnabled ? 'Ready' : 'Inactive';
    elements.perceptionTitle.textContent = state.privacyMode ? 'Privacy mode active' : state.cameraEnabled ? next ? 'Person nearby' : 'Watching locally' : 'Camera disabled';
    elements.presenceState.innerHTML = `<span></span><b>${next ? `Presence detected · ${source}` : state.privacyMode ? 'Local perception paused' : state.cameraEnabled ? 'Scanning for presence' : 'No local presence signal'}</b>`;
    elements.awarenessLabel.textContent = state.privacyMode ? 'Privacy active' : state.cameraEnabled ? next ? 'Presence detected' : 'Awareness active' : 'Awareness off';

    if (next) {
      lastDetectedAt = Date.now();
      elements.lastPresence.textContent = formatTime(lastDetectedAt);
      if (changed && Date.now() - greetedAt > 30000) {
        greetedAt = Date.now();
        if (window.AURA?.setState) window.AURA.setState('idle', 'Aware');
        if (elements.response) elements.response.textContent = 'I noticed someone approach. AURA is awake and ready.';
        window.setTimeout(() => window.AURA?.setState?.('idle', 'Ready'), 3200);
      }
    }
  }

  function updatePrivacyUI() {
    document.body.dataset.privacy = String(state.privacyMode);
    elements.privacyButton.setAttribute('aria-pressed', String(state.privacyMode));
    elements.privacyButton.textContent = state.privacyMode ? 'Privacy active' : 'Privacy';
    elements.panelPrivacyToggle.textContent = state.privacyMode ? 'Leave privacy mode' : 'Enter privacy mode';
    elements.privacyStatus.textContent = state.privacyMode
      ? 'Privacy mode active · Camera and local perception disabled'
      : state.cameraEnabled
        ? 'Camera active · Local processing only · Nothing is recorded'
        : 'Camera off · Microphone activates only when requested';
    elements.processingMetric.textContent = state.privacyMode ? 'Paused' : 'On this device';
    if (state.privacyMode) setPresence(false);
    save();
  }

  function openPanel() {
    elements.panel.hidden = false;
    elements.backdrop.hidden = false;
    requestAnimationFrame(() => elements.close.focus());
  }

  function closePanel() {
    elements.panel.hidden = true;
    elements.backdrop.hidden = true;
  }

  function updateCameraUI() {
    const active = Boolean(stream) && !state.privacyMode;
    elements.cameraStage.classList.toggle('active', active);
    elements.cameraToggle.textContent = active ? 'Disable camera awareness' : 'Enable camera awareness';
    elements.cameraIndicatorText.textContent = active ? 'Live locally · not recorded' : 'Not recording';
    elements.video.hidden = !active;
    elements.placeholder.hidden = active;
    elements.secureContext.textContent = window.isSecureContext ? 'Yes' : 'No — use HTTPS or localhost';
    if (!active && !state.privacyMode) setPresence(false);
  }

  async function enableCamera() {
    if (state.privacyMode) {
      state.privacyMode = false;
      updatePrivacyUI();
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      elements.detectionMethod.textContent = 'Camera API unavailable';
      elements.cameraIndicatorText.textContent = 'Unsupported browser';
      window.AURA?.setState?.('alert', 'Camera unavailable');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 15, max: 24 }
        },
        audio: false
      });
      elements.video.srcObject = stream;
      await elements.video.play();
      state.cameraEnabled = true;
      save();
      setupDetector();
      updateCameraUI();
      updatePrivacyUI();
      startDetection();
      document.body.dataset.presence = 'searching';
      if (elements.response) elements.response.textContent = 'Local awareness is active. Camera frames remain on this wall PC.';
    } catch (error) {
      state.cameraEnabled = false;
      save();
      elements.detectionMethod.textContent = error?.name === 'NotAllowedError' ? 'Permission denied' : 'Camera start failed';
      elements.cameraIndicatorText.textContent = 'Camera unavailable';
      elements.perceptionTitle.textContent = 'Camera permission required';
      window.AURA?.setState?.('alert', 'Camera permission required');
      if (elements.response) elements.response.textContent = 'Camera access was not granted. AURA will continue without visual awareness.';
      updateCameraUI();
    }
  }

  function disableCamera() {
    cancelAnimationFrame(frameHandle);
    frameHandle = null;
    previousFrame = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    elements.video.srcObject = null;
    state.cameraEnabled = false;
    save();
    elements.detectionMethod.textContent = 'Disabled';
    updateCameraUI();
    updatePrivacyUI();
  }

  function setupDetector() {
    if ('FaceDetector' in window) {
      try {
        detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
        elements.detectionMethod.textContent = 'Local face presence';
        return;
      } catch {
        detector = null;
      }
    }
    elements.detectionMethod.textContent = 'Local motion presence';
  }

  async function detectFace() {
    if (!detector || detectorBusy || elements.video.readyState < 2) return false;
    detectorBusy = true;
    try {
      const faces = await detector.detect(elements.video);
      if (!faces.length) return false;
      const face = faces[0].boundingBox;
      const x = 1 - ((face.x + face.width / 2) / elements.video.videoWidth);
      const y = (face.y + face.height / 2) / elements.video.videoHeight;
      window.dispatchEvent(new PointerEvent('pointermove', {
        clientX: x * window.innerWidth,
        clientY: y * window.innerHeight
      }));
      return true;
    } catch {
      detector = null;
      elements.detectionMethod.textContent = 'Local motion presence';
      return false;
    } finally {
      detectorBusy = false;
    }
  }

  function detectMotion() {
    if (elements.video.readyState < 2) return false;
    const canvas = elements.motionCanvas;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(elements.video, 0, 0, canvas.width, canvas.height);
    const current = context.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!previousFrame) {
      previousFrame = new Uint8ClampedArray(current);
      return false;
    }
    let changed = 0;
    const samples = current.length / 16;
    for (let index = 0; index < current.length; index += 16) {
      const currentLuma = current[index] * 0.299 + current[index + 1] * 0.587 + current[index + 2] * 0.114;
      const previousLuma = previousFrame[index] * 0.299 + previousFrame[index + 1] * 0.587 + previousFrame[index + 2] * 0.114;
      if (Math.abs(currentLuma - previousLuma) > 24) changed += 1;
    }
    previousFrame.set(current);
    return changed / samples > 0.035;
  }

  async function detectionLoop() {
    if (!stream || state.privacyMode) return;
    const faceFound = await detectFace();
    const motionFound = detector ? false : detectMotion();
    const found = faceFound || motionFound;
    if (found) {
      setPresence(true, faceFound ? 'Face in view' : 'Motion nearby');
    } else if (presence && Date.now() - lastDetectedAt > 6500) {
      setPresence(false);
    }
    frameHandle = requestAnimationFrame(() => window.setTimeout(detectionLoop, detector ? 260 : 360));
  }

  function startDetection() {
    cancelAnimationFrame(frameHandle);
    frameHandle = requestAnimationFrame(detectionLoop);
  }

  function togglePrivacy() {
    state.privacyMode = !state.privacyMode;
    if (state.privacyMode) disableCamera();
    updatePrivacyUI();
    updateCameraUI();
    if (elements.response) {
      elements.response.textContent = state.privacyMode
        ? 'Privacy mode is active. Camera awareness is disabled.'
        : 'Privacy mode is off. Camera awareness remains disabled until you enable it.';
    }
  }

  async function toggleCamera() {
    if (stream) disableCamera(); else await enableCamera();
  }

  function registerPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPrompt = event;
      elements.installButton.hidden = false;
      elements.installStatus.textContent = 'Ready to install';
    });
    window.addEventListener('appinstalled', () => {
      installPrompt = null;
      elements.installButton.hidden = true;
      elements.installStatus.textContent = 'Installed';
    });
  }

  async function installApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    elements.installStatus.textContent = result.outcome === 'accepted' ? 'Installing…' : 'Install dismissed';
    installPrompt = null;
    elements.installButton.hidden = true;
  }

  elements.awarenessButton.addEventListener('click', openPanel);
  elements.awarenessOpen.addEventListener('click', openPanel);
  elements.close.addEventListener('click', closePanel);
  elements.backdrop.addEventListener('click', closePanel);
  elements.cameraToggle.addEventListener('click', toggleCamera);
  elements.privacyButton.addEventListener('click', togglePrivacy);
  elements.panelPrivacyToggle.addEventListener('click', togglePrivacy);
  elements.installButton.addEventListener('click', installApp);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.panel.hidden) closePanel();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && stream) setPresence(false);
  });

  updatePrivacyUI();
  updateCameraUI();
  elements.detectionMethod.textContent = state.cameraEnabled ? 'Enable again after refresh' : 'Awaiting permission';
  registerPWA();

  window.AURA_AWARENESS = {
    enable: enableCamera,
    disable: disableCamera,
    privacy: togglePrivacy,
    state: () => ({ ...state, presence, lastDetectedAt })
  };
})();
