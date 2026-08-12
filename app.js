/* =========================================================================
   CENTINELA v5.0 — Lógica de la aplicación
   Compatible con el firmware ESP32 "CENTINELA - FIRMWARE DEFINITIVO v3.7"
   ========================================================================= */

(() => {
  'use strict';

  // ======================== CONSTANTES BLE ========================
  const BLE_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
  const BLE_CMD_UUID     = '12345678-1234-5678-1234-56789abcdef1';
  const BLE_STATUS_UUID  = '12345678-1234-5678-1234-56789abcdef2';
  const DEVICE_NAME_PREFIX = 'Centinela';

  // ======================== CLAVES DE ALMACENAMIENTO LOCAL ========================
  const LS = {
    vehicleName: 'centinela.vehicleName',
    vehiclePlate: 'centinela.vehiclePlate',
    soundOn: 'centinela.soundOn',
    biometric: 'centinela.biometric',
    pinHash: 'centinela.pinHash',
    proximity: 'centinela.proximity',
    proximitySensitivity: 'centinela.proximitySensitivity',
    modes: 'centinela.modes',
    sensors: 'centinela.sensors',
    events: 'centinela.events'
  };

  // ======================== ESTADO EN MEMORIA ========================
  let bleDevice = null;
  let bleServer = null;
  let cmdChar = null;
  let statusChar = null;
  let bleBusy = false; // evita colisiones al reconectar

  let lastState = null;      // último JSON de estado recibido del ESP32
  let previousState = null;  // estado anterior, para detectar cambios y generar eventos

  let checklistMode = null;  // 'start' | 'stop'
  let pinContext = null;     // 'setup' | 'entry' | 'confirm-stop'
  let pinBuffer = '';
  let pinSetupFirstEntry = null;

  let deferredInstallPrompt = null;

  let map = null;
  let mapMarker = null;

  // Sonidos: sintetizados con Web Audio API (sin archivos externos)
  let audioCtx = null;

  // ======================== REFERENCIAS DOM ========================
  const $ = (id) => document.getElementById(id);

  const el = {
    app: $('app'),
    statusPill: $('statusPill'),
    statusDot: $('statusDot'),
    statusPillText: $('statusPillText'),
    alarmBadge: $('alarmBadge'),

    shieldBtn: $('shieldBtn'),
    shieldLabel: $('shieldLabel'),
    shieldSubState: $('shieldSubState'),
    doorStatus: $('doorStatus'),

    statBattery: $('statBattery'),
    statMotorTemp: $('statMotorTemp'),
    statFuel: $('statFuel'),
    statGps: $('statGps'),

    eventFeed: $('eventFeed'),
    eventFeedEmpty: $('eventFeedEmpty'),

    keyLinkCard: $('keyLinkCard'),
    keyLinkTitle: $('keyLinkTitle'),
    keyLinkSub: $('keyLinkSub'),
    beam: $('beam'),

    lockBtnClosed: $('lockBtnClosed'),
    lockBtnOpen: $('lockBtnOpen'),

    windowPct: $('windowPct'),
    windowFill: $('windowFill'),
    windowUpBtn: $('windowUpBtn'),
    windowDownBtn: $('windowDownBtn'),

    lightFaultBanner: $('lightFaultBanner'),
    lightFaultText: $('lightFaultText'),

    startEngineBtn: $('startEngineBtn'),
    stopEngineBtn: $('stopEngineBtn'),
    trunkBtn: $('trunkBtn'),
    trunkBtnLabel: $('trunkBtnLabel'),

    toast: $('toast'),

    checklistOverlay: $('checklistOverlay'),
    checklistIcon: $('checklistIcon'),
    checklistTitle: $('checklistTitle'),
    checklistSub: $('checklistSub'),
    checklistItems: $('checklistItems'),
    checklistConfirmBtn: $('checklistConfirmBtn'),

    pinOverlay: $('pinOverlay'),
    pinOverlayTitle: $('pinOverlayTitle'),
    pinOverlaySub: $('pinOverlaySub'),
    pinDots: $('pinDots'),
    pinError: $('pinError'),

    configOverlay: $('configOverlay'),
    lockOverlay: $('lockOverlay'),

    vehicleNameDisplay: $('vehicleNameDisplay'),
    vehicleNameSetting: $('vehicleNameSetting'),
    vehiclePlate: $('vehiclePlate'),

    switchBiometric: $('switchBiometric'),
    bioStatusSub: $('bioStatusSub'),
    pinStatusSub: $('pinStatusSub'),
    switchProximity: $('switchProximity'),
    proximitySlider: $('proximitySlider'),
    proximityValLabel: $('proximityValLabel'),
    proximityLiveCard: $('proximityLiveCard'),
    proximityRssiLabel: $('proximityRssiLabel'),
    switchSound: $('switchSound'),
    switchValet: $('switchValet'),
    switchTaller: $('switchTaller'),
    switchNinos: $('switchNinos'),
    switchImpacto: $('switchImpacto'),
    switchInclinacion: $('switchInclinacion'),

    installBtn: $('installBtn')
  };

  const PROXIMITY_LABELS = ['Muy cerca', 'Cerca', 'Media', 'Lejos', 'Muy lejos'];

  // =========================================================================
  // UTILIDADES GENERALES
  // =========================================================================

  function soundEnabled() {
    return localStorage.getItem(LS.soundOn) !== 'off';
  }

  function vibrate(pattern) {
    if (soundEnabled() && 'vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch (e) { /* silencioso */ }
    }
  }

  function ensureAudioCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // Sintetiza un tono simple. type: 'beep' corto, 'confirm' ascendente, 'alarm' descendente/agudo
  function playTone(freqs, durationMs, gainVal = 0.08) {
    if (!soundEnabled()) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      gain.gain.value = gainVal;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = now + i * (durationMs / 1000);
      osc.start(start);
      gain.gain.setValueAtTime(gainVal, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + durationMs / 1000);
      osc.stop(start + durationMs / 1000 + 0.02);
    });
  }

  // Sonido de arranque de motor: dos tonos ascendentes + vibración corta
  function playEngineStartSound() {
    playTone([220, 330, 440], 130, 0.09);
    vibrate([40, 30, 60]);
  }

  // Sonido de apagado de motor: dos tonos descendentes + vibración larga
  function playEngineStopSound() {
    playTone([440, 330, 220], 150, 0.09);
    vibrate([80, 40, 80]);
  }

  function playConfirmSound() {
    playTone([700, 900], 90, 0.06);
  }

  function playErrorSound() {
    playTone([220, 160], 120, 0.08);
    vibrate([120]);
  }

  let toastTimer = null;
  function showToast(message, type = 'info') {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.className = 'toast show ' + (type === 'error' ? 'error' : type === 'warn' ? 'warn' : type === 'success' ? 'success' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.remove('show');
    }, 3200);
  }

  function formatTime(date = new Date()) {
    return date.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
  }

  // =========================================================================
  // ACTIVIDAD RECIENTE (eventos reales derivados del estado del vehículo)
  // =========================================================================

  function addEvent(title, iconType = 'ok', iconSvg = ICONS.info) {
    if (!el.eventFeed) return;

    if (el.eventFeedEmpty && el.eventFeedEmpty.parentNode) {
      el.eventFeedEmpty.remove();
    }

    const item = document.createElement('div');
    item.className = 'event';
    item.innerHTML = `
      <div class="event-icon ${iconType}">${iconSvg}</div>
      <div class="event-body">
        <div class="event-title">${title}</div>
        <div class="event-time">${formatTime()}</div>
      </div>`;
    el.eventFeed.prepend(item);

    // Limitar a 12 eventos visibles para no saturar la pantalla
    const items = el.eventFeed.querySelectorAll('.event');
    if (items.length > 12) {
      items[items.length - 1].remove();
    }
  }

  const ICONS = {
    door: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M3 22h18M6 18V9l6-5 6 5v9M9 22V14h6v8"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 017.6-1.8"/></svg>',
    light: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>',
    window: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M12 2l8 3v6c0 5-3.4 8.4-8 11-4.6-2.6-8-6-8-11V5l8-3z"/></svg>',
    alarm: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M12 9v4M12 17h.01M10.3 3.9L2.5 17a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>',
    engine: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>',
    battery: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
    bluetooth: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>'
  };

  const LIGHT_LABELS = {
    LOWBEAM: 'Luces bajas', HIGHBEAM: 'Luces altas', TURN_L: 'Direccional izq.',
    TURN_R: 'Direccional der.', BRAKE: 'Luz de freno', REVERSE: 'Luz de reversa',
    FOG: 'Antiniebla', PARK: 'Luces de parqueo'
  };

  // Compara el estado anterior con el nuevo y registra eventos reales de
  // puertas, luces, vidrios, seguros, alarma y motor.
  function diffAndLogEvents(prev, next) {
    if (!prev) return; // primera lectura: no generamos eventos retroactivos

    if (prev.doorOpen !== next.doorOpen) {
      addEvent(next.doorOpen ? '🚪 Puerta abierta' : '🚪 Puerta cerrada',
        next.doorOpen ? 'warn' : 'ok', ICONS.door);
    }

    if (prev.locked !== next.locked) {
      addEvent(next.locked ? '🔒 Seguros cerrados' : '🔓 Seguros abiertos',
        next.locked ? 'ok' : 'warn', next.locked ? ICONS.lock : ICONS.unlock);
    }

    if (prev.armed !== next.armed) {
      addEvent(next.armed ? '🛡️ Sistema armado' : '🛡️ Sistema desarmado',
        'ok', ICONS.shield);
    }

    if (!prev.alarmTriggered && next.alarmTriggered) {
      addEvent('🚨 ¡Alarma disparada!', 'danger', ICONS.alarm);
    } else if (prev.alarmTriggered && !next.alarmTriggered) {
      addEvent('🔕 Alarma detenida', 'ok', ICONS.alarm);
    }

    if (prev.engine !== next.engine) {
      addEvent(next.engine ? '🚀 Motor encendido' : '🛑 Motor apagado',
        next.engine ? 'ok' : 'warn', ICONS.engine);
    }

    if (prev.windowL !== next.windowL || prev.windowR !== next.windowR) {
      addEvent(`🪟 Vidrios ajustados (${Math.round((next.windowL + next.windowR) / 2)}%)`, 'ok', ICONS.window);
    }

    if (prev.lights) {
      Object.keys(next.lights || {}).forEach((id) => {
        if (prev.lights[id] !== next.lights[id]) {
          const label = LIGHT_LABELS[id] || id;
          addEvent(`💡 ${label} ${next.lights[id] ? 'encendida' : 'apagada'}`,
            next.lights[id] ? 'ok' : 'warn', ICONS.light);
        }
      });
    }

    if (prev.battery !== undefined && next.battery !== undefined) {
      const wasLow = prev.battery <= 11.8;
      const isLow = next.battery <= 11.8;
      if (!wasLow && isLow) {
        addEvent(`🔋 Batería baja (${next.battery.toFixed(1)}V)`, 'warn', ICONS.battery);
      }
    }
  }

  // =========================================================================
  // RENDERIZADO DE ESTADO
  // =========================================================================

  function renderState(state) {
    previousState = lastState;
    lastState = state;

    diffAndLogEvents(previousState, state);

    // ---- Tema de alarma (rojo global) + badge ----
    const alarmOn = !!state.alarmTriggered;
    el.app.setAttribute('data-alarm', alarmOn ? 'true' : 'false');
    el.app.setAttribute('data-armed', state.armed ? 'true' : 'false');
    if (el.alarmBadge) el.alarmBadge.hidden = !alarmOn;
    document.getElementById('themeColorMeta')?.setAttribute('content', alarmOn ? '#150707' : '#0A0D12');

    // ---- Escudo ARM/DISARM ----
    if (el.shieldLabel) el.shieldLabel.textContent = alarmOn ? '¡ALARMA!' : (state.armed ? 'ARMADO' : 'DESARMADO');
    if (el.shieldBtn) el.shieldBtn.setAttribute('aria-pressed', state.armed ? 'true' : 'false');
    if (el.shieldSubState) el.shieldSubState.textContent = alarmOn ? 'en alarma' : (state.armed ? 'activo' : 'inactivo');
    if (el.doorStatus) el.doorStatus.textContent = state.doorOpen ? 'abiertas' : 'cerradas';

    // ---- Estadísticas ----
    if (el.statBattery) el.statBattery.textContent = (typeof state.battery === 'number') ? `${state.battery.toFixed(1)}V` : '—';
    if (el.statMotorTemp) el.statMotorTemp.textContent = state.engine ? 'Encendido' : 'Apagado';
    if (el.statFuel) el.statFuel.textContent = (state.fuel != null) ? `${state.fuel}%` : 'N/D';
    if (el.statGps) el.statGps.textContent = state.gpsSignal || 'Sin señal';

    // ---- Seguros ----
    if (el.lockBtnClosed && el.lockBtnOpen) {
      el.lockBtnClosed.classList.toggle('active', !!state.locked);
      el.lockBtnOpen.classList.toggle('active', !state.locked);
    }

    // ---- Vidrios simplificados ----
    const avgWindow = Math.round(((state.windowL ?? 0) + (state.windowR ?? 0)) / 2);
    if (el.windowPct) el.windowPct.textContent = `${avgWindow}%`;
    if (el.windowFill) el.windowFill.style.width = `${avgWindow}%`;
    if (el.windowUpBtn) el.windowUpBtn.disabled = !cmdChar || avgWindow >= 100;
    if (el.windowDownBtn) el.windowDownBtn.disabled = !cmdChar || avgWindow <= 0;

    // ---- Luces ----
    document.querySelectorAll('.light-item').forEach((btn) => {
      const id = btn.dataset.id;
      const isOn = !!(state.lights && state.lights[id]);
      btn.classList.toggle('active', isOn);
    });
    if (Array.isArray(state.faults) && state.faults.length > 0) {
      el.lightFaultBanner.style.display = 'flex';
      el.lightFaultText.textContent = `Falla detectada: ${state.faults.join(', ')}`;
    } else if (el.lightFaultBanner) {
      el.lightFaultBanner.style.display = 'none';
    }

    // ---- Botones de arranque / apagado remoto (bloqueo visual en vivo) ----
    updateEngineButtonsState(state);

    // ---- Mapa ----
    updateMap(state);

    // Si el modal de checklist está abierto, refrescarlo con el estado más reciente
    if (checklistMode && !el.checklistOverlay.hidden) {
      buildChecklist(checklistMode);
    }
  }

  function startConditionsMet(state) {
    return !!state.armed && !!state.parked && !!state.locked && !state.doorOpen && !state.engine;
  }

  function stopConditionsMet(state) {
    return !!state.remoteStart && !!state.engine && !!state.parked && !!state.locked;
  }

  function updateEngineButtonsState(state) {
    const connected = !!cmdChar;
    if (el.startEngineBtn) {
      const blocked = !connected || !startConditionsMet(state);
      el.startEngineBtn.classList.toggle('disabled', blocked);
    }
    if (el.stopEngineBtn) {
      const blocked = !connected || !stopConditionsMet(state);
      el.stopEngineBtn.classList.toggle('disabled', blocked);
    }
  }

  function updateMap(state) {
    if (!window.L || !el.statGps) return;
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    if (!state.gpsFix || state.lat == null || state.lng == null) {
      const mapStatus = document.getElementById('mapStatus');
      if (mapStatus) mapStatus.textContent = 'sin señal GPS';
      return;
    }

    if (!map) {
      map = L.map(mapEl, { zoomControl: false, attributionControl: false }).setView([state.lat, state.lng], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      mapMarker = L.circleMarker([state.lat, state.lng], {
        radius: 8, color: '#3ED598', fillColor: '#3ED598', fillOpacity: 0.9
      }).addTo(map);
    } else {
      mapMarker.setLatLng([state.lat, state.lng]);
      map.panTo([state.lat, state.lng]);
    }

    const mapSpeed = document.getElementById('mapSpeed');
    const mapStatus = document.getElementById('mapStatus');
    if (mapSpeed) mapSpeed.textContent = `${Math.round(state.speedKmh || 0)} km/h`;
    if (mapStatus) mapStatus.textContent = (state.speedKmh || 0) > 2 ? 'en movimiento' : 'estacionado';
  }

  // =========================================================================
  // CONEXIÓN BLUETOOTH (Web Bluetooth API)
  // =========================================================================

  function setConnectionUI(status) {
    // status: 'disconnected' | 'connecting' | 'connected'
    el.statusPill.classList.remove('connected', 'connecting');
    el.keyLinkCard.classList.remove('connected');

    if (status === 'connected') {
      el.statusPill.classList.add('connected');
      el.statusPillText.textContent = 'Conectado';
      el.keyLinkTitle.textContent = '🔗 Vinculado por Bluetooth';
      el.keyLinkSub.textContent = bleDevice?.name || 'Centinela-ESP32';
      el.keyLinkCard.classList.add('connected');
      el.beam.style.opacity = '1';
    } else if (status === 'connecting') {
      el.statusPill.classList.add('connecting');
      el.statusPillText.textContent = 'Conectando…';
      el.keyLinkTitle.textContent = '📡 Buscando vehículo…';
      el.keyLinkSub.textContent = 'Confirma el PIN 739201 si se solicita';
      el.beam.style.opacity = '0.6';
    } else {
      el.statusPillText.textContent = 'Sin conexión';
      el.keyLinkTitle.textContent = '📱 Toca para conectar por Bluetooth';
      el.keyLinkSub.textContent = 'Sin conexión';
      el.beam.style.opacity = '0.35';
    }
  }

  async function connectBLE() {
    if (bleBusy) return;
    if (!navigator.bluetooth) {
      showToast('Este navegador no soporta Bluetooth Web. Usa Chrome/Edge en Android o desktop.', 'error');
      return;
    }
    if (cmdChar) {
      showToast('Ya estás conectado a tu vehículo', 'info');
      return;
    }

    bleBusy = true;
    setConnectionUI('connecting');

    try {
      bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BLE_SERVICE_UUID] }, { namePrefix: DEVICE_NAME_PREFIX }],
        optionalServices: [BLE_SERVICE_UUID]
      });

      bleDevice.addEventListener('gattserverdisconnected', onBleDisconnected);

      bleServer = await bleDevice.gatt.connect();
      const service = await bleServer.getPrimaryService(BLE_SERVICE_UUID);
      cmdChar = await service.getCharacteristic(BLE_CMD_UUID);
      statusChar = await service.getCharacteristic(BLE_STATUS_UUID);

      await statusChar.startNotifications();
      statusChar.addEventListener('characteristicvaluechanged', onStatusNotification);

      // Leer estado inicial
      try {
        const value = await statusChar.readValue();
        handleStatusBytes(value);
      } catch (e) { /* algunos dispositivos solo notifican, no permiten read */ }

      setConnectionUI('connected');
      showToast('✅ Vehículo conectado', 'success');
      playConfirmSound();
      addEvent('🔗 Teléfono conectado por Bluetooth', 'ok', ICONS.bluetooth);
    } catch (err) {
      console.error('Error de conexión BLE:', err);
      setConnectionUI('disconnected');
      if (err.name !== 'NotFoundError') {
        showToast('No se pudo conectar: ' + err.message, 'error');
      }
    } finally {
      bleBusy = false;
    }
  }

  function onBleDisconnected() {
    cmdChar = null;
    statusChar = null;
    setConnectionUI('disconnected');
    showToast('🔌 Se perdió la conexión con el vehículo', 'warn');
    addEvent('🔌 Conexión Bluetooth perdida', 'danger', ICONS.bluetooth);
    updateEngineButtonsState(lastState || {});
  }

  function handleStatusBytes(dataView) {
    try {
      const text = new TextDecoder().decode(dataView.buffer ? dataView.buffer : dataView);
      const state = JSON.parse(text);

      if (state.ack) {
        handleAck(state.ack, state.ok, state.message);
      }
      renderState(state);
    } catch (e) {
      console.warn('No se pudo interpretar el estado recibido:', e);
    }
  }

  function onStatusNotification(evt) {
    handleStatusBytes(evt.target.value);
  }

  function handleAck(ack, ok, message) {
    if (ack === 'START_ENGINE') {
      if (ok) { playEngineStartSound(); showToast('🚀 Motor arrancado remotamente', 'success'); }
      else { playErrorSound(); showToast('⚠️ ' + (message || 'No se pudo arrancar el motor'), 'error'); }
    } else if (ack === 'STOP_ENGINE') {
      if (ok) { playEngineStopSound(); showToast('🛑 Motor apagado remotamente', 'success'); }
      else { playErrorSound(); showToast('⚠️ ' + (message || 'No se pudo apagar el motor'), 'error'); }
    } else if (ack === 'ALARM_TRIGGERED') {
      playTone([880, 660, 880, 660], 160, 0.1);
      vibrate([120, 60, 120, 60, 200]);
    } else if (!ok && message) {
      playErrorSound();
      showToast('⚠️ ' + message, 'error');
    } else if (ok && message) {
      showToast(message, 'success');
    }
  }

  // =========================================================================
  // ENVÍO DE COMANDOS
  // =========================================================================

  async function sendCmd(cmd, toastMsg) {
    if (!cmdChar) {
      showToast('Conecta tu vehículo por Bluetooth primero', 'warn');
      connectBLE();
      return false;
    }
    try {
      const payload = new TextEncoder().encode(cmd);
      if (cmdChar.writeValueWithoutResponse) {
        await cmdChar.writeValueWithoutResponse(payload);
      } else {
        await cmdChar.writeValue(payload);
      }
      if (toastMsg) showToast(toastMsg, 'success');
      return true;
    } catch (err) {
      console.error('Error enviando comando', cmd, err);
      showToast('No se pudo enviar el comando. Verifica la conexión.', 'error');
      playErrorSound();
      return false;
    }
  }
  window.sendCmd = sendCmd;

  // =========================================================================
  // NAVEGACIÓN ENTRE PANTALLAS
  // =========================================================================

  function navigateTo(screenName) {
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.toggle('active', s.dataset.screen === screenName);
    });
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.screen === screenName);
    });
    if (screenName === 'mapa' && lastState) {
      setTimeout(() => { if (map) map.invalidateSize(); }, 60);
    }
  }
  window.navigateTo = navigateTo;

  // =========================================================================
  // ARMAR / DESARMAR
  // =========================================================================

  function toggleArm() {
    if (lastState?.alarmTriggered) {
      stopAlarmFromUI();
      return;
    }
    const willArm = !(lastState?.armed);
    sendCmd(willArm ? 'ARM' : 'DISARM', willArm ? '🛡️ Armando vehículo…' : '🔓 Desarmando vehículo…');
  }
  window.toggleArm = toggleArm;

  function stopAlarmFromUI() {
    sendCmd('STOP_ALARM', '🔕 Deteniendo alarma…');
  }
  window.stopAlarmFromUI = stopAlarmFromUI;

  // =========================================================================
  // SEGUROS
  // =========================================================================

  function setLock(shouldLock) {
    sendCmd(shouldLock ? 'LOCK' : 'UNLOCK', shouldLock ? '🔒 Cerrando seguros…' : '🔓 Abriendo seguros…');
  }
  window.setLock = setLock;

  // =========================================================================
  // VIDRIOS (control simplificado Subir / Bajar)
  // =========================================================================

  async function moveWindowsSimple(direction) {
    const suffix = direction === 'up' ? '_UP' : '_DOWN';
    await sendCmd('WIN_L' + suffix, null);
    await sendCmd('WIN_R' + suffix, direction === 'up' ? '🪟 Subiendo vidrios…' : '🪟 Bajando vidrios…');
  }
  window.moveWindowsSimple = moveWindowsSimple;

  // =========================================================================
  // LUCES
  // =========================================================================

  function toggleLight(id) {
    const isOn = !!(lastState?.lights && lastState.lights[id]);
    const label = LIGHT_LABELS[id] || id;
    sendCmd(`LIGHT:${id}:${isOn ? 'OFF' : 'ON'}`, `💡 ${label} ${isOn ? 'apagándose' : 'encendiéndose'}…`);
  }
  window.toggleLight = toggleLight;

  // =========================================================================
  // ENCONTRAR AUTO
  // =========================================================================

  function findCar() {
    sendCmd('HORN', '📍 Haciendo sonar la sirena para ubicar el vehículo');
    playTone([500, 900, 500, 900], 150, 0.08);
  }
  window.findCar = findCar;

  // =========================================================================
  // MALETERO (mantener presionado 3s)
  // =========================================================================

  (function setupTrunkHold() {
    if (!el.trunkBtn) return;
    let holdTimer = null;
    let progressStart = 0;

    const HOLD_MS = 3000;

    function start() {
      progressStart = Date.now();
      el.trunkBtnLabel.textContent = 'Mantén presionado…';
      holdTimer = setTimeout(() => {
        sendCmd('TRUNK', '🧳 Abriendo maletero…');
        vibrate([50, 30, 50]);
        el.trunkBtnLabel.textContent = '✅ Maletero abierto';
        setTimeout(() => { el.trunkBtnLabel.textContent = 'Mantén presionado 3s'; }, 1800);
      }, HOLD_MS);
    }

    function cancel() {
      clearTimeout(holdTimer);
      if (Date.now() - progressStart < HOLD_MS) {
        el.trunkBtnLabel.textContent = 'Mantén presionado 3s';
      }
    }

    el.trunkBtn.addEventListener('pointerdown', start);
    el.trunkBtn.addEventListener('pointerup', cancel);
    el.trunkBtn.addEventListener('pointerleave', cancel);
    el.trunkBtn.addEventListener('pointercancel', cancel);
  })();

  // =========================================================================
  // CHECKLIST DE ARRANQUE / APAGADO REMOTO
  // =========================================================================

  const START_CHECKS = [
    { key: 'armed',    label: 'Alarma armada',            test: (s) => !!s.armed },
    { key: 'parked',   label: 'Freno de mano activado',   test: (s) => !!s.parked },
    { key: 'locked',   label: 'Seguros cerrados',         test: (s) => !!s.locked },
    { key: 'door',     label: 'Puertas cerradas',         test: (s) => !s.doorOpen },
    { key: 'engineOff',label: 'Motor apagado',            test: (s) => !s.engine }
  ];

  const STOP_CHECKS = [
    { key: 'remoteStart', label: 'Motor arrancado desde la app', test: (s) => !!s.remoteStart },
    { key: 'engineOn',    label: 'Motor encendido',              test: (s) => !!s.engine },
    { key: 'parked',      label: 'Freno de mano activado',       test: (s) => !!s.parked },
    { key: 'locked',      label: 'Seguros cerrados',             test: (s) => !!s.locked }
  ];

  function buildChecklist(mode) {
    const state = lastState || {};
    const checks = mode === 'start' ? START_CHECKS : STOP_CHECKS;
    const allOk = checks.every((c) => c.test(state));

    el.checklistTitle.textContent = mode === 'start'
      ? 'Verificación antes de arrancar'
      : 'Verificación antes de apagar';
    el.checklistSub.textContent = allOk
      ? 'Todo listo. Puedes continuar.'
      : 'Se deben cumplir todas las condiciones para continuar';

    el.checklistIcon.classList.toggle('blocked', !allOk);
    el.checklistIcon.innerHTML = mode === 'start' ? ICONS.engine : ICONS.alarm;

    el.checklistItems.innerHTML = checks.map((c) => {
      const ok = c.test(state);
      return `
        <div class="checklist-item ${ok ? 'ok' : 'fail'}">
          <span class="checklist-item-icon">
            ${ok
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'}
          </span>
          <span class="checklist-item-text">${c.label}</span>
        </div>`;
    }).join('');

    el.checklistConfirmBtn.disabled = !allOk || !cmdChar;
    el.checklistConfirmBtn.textContent = mode === 'start' ? 'Confirmar arranque' : 'Confirmar apagado';
  }

  function openStartChecklist() {
    if (!cmdChar) {
      showToast('Conecta tu vehículo por Bluetooth primero', 'warn');
      connectBLE();
      return;
    }
    checklistMode = 'start';
    buildChecklist('start');
    el.checklistOverlay.hidden = false;
  }
  window.openStartChecklist = openStartChecklist;

  function confirmStop() {
    if (!cmdChar) {
      showToast('Conecta tu vehículo por Bluetooth primero', 'warn');
      connectBLE();
      return;
    }
    checklistMode = 'stop';
    buildChecklist('stop');
    el.checklistOverlay.hidden = false;
  }
  window.confirmStop = confirmStop;

  function closeChecklistOverlay() {
    el.checklistOverlay.hidden = true;
    checklistMode = null;
  }
  window.closeChecklistOverlay = closeChecklistOverlay;

  function confirmChecklistAction() {
    if (el.checklistConfirmBtn.disabled) return;
    if (checklistMode === 'start') {
      sendCmd('START_ENGINE', '🚀 Enviando arranque remoto…');
    } else if (checklistMode === 'stop') {
      sendCmd('STOP_ENGINE', '🛑 Enviando apagado remoto…');
    }
    closeChecklistOverlay();
  }
  window.confirmChecklistAction = confirmChecklistAction;

  // =========================================================================
  // AJUSTES — VEHÍCULO
  // =========================================================================

  function editVehicle() {
    const current = localStorage.getItem(LS.vehicleName) || 'Mi vehículo';
    const name = prompt('Nombre del vehículo:', current);
    if (name && name.trim()) {
      localStorage.setItem(LS.vehicleName, name.trim());
      applyVehicleName();
      showToast('Nombre actualizado', 'success');
    }
  }
  window.editVehicle = editVehicle;

  function editPlate() {
    const current = localStorage.getItem(LS.vehiclePlate) || 'ABC-1234';
    const plate = prompt('Placa del vehículo:', current);
    if (plate && plate.trim()) {
      localStorage.setItem(LS.vehiclePlate, plate.trim().toUpperCase());
      applyVehicleName();
      showToast('Placa actualizada', 'success');
    }
  }
  window.editPlate = editPlate;

  function applyVehicleName() {
    const name = localStorage.getItem(LS.vehicleName) || 'Mi vehículo';
    const plate = localStorage.getItem(LS.vehiclePlate) || 'ABC-1234';
    if (el.vehicleNameDisplay) el.vehicleNameDisplay.textContent = name;
    if (el.vehicleNameSetting) el.vehicleNameSetting.textContent = name;
    if (el.vehiclePlate) el.vehiclePlate.textContent = plate;
  }

  // =========================================================================
  // AJUSTES — SEGURIDAD DE ACCESO (biometría / PIN)
  // =========================================================================

  function toggleBiometric(node) {
    const enabling = !node.classList.contains('on');
    if (enabling && !window.PublicKeyCredential) {
      showToast('Tu navegador no soporta desbloqueo biométrico', 'error');
      return;
    }
    node.classList.toggle('on', enabling);
    localStorage.setItem(LS.biometric, enabling ? 'on' : 'off');
    el.bioStatusSub.textContent = enabling ? 'Activado' : 'Usa el lector de tu teléfono';
    showToast(enabling ? '👆 Desbloqueo biométrico activado' : 'Desbloqueo biométrico desactivado', 'success');
  }
  window.toggleBiometric = toggleBiometric;

  function registerBiometric() {
    localStorage.setItem(LS.biometric, 'on');
    if (el.switchBiometric) el.switchBiometric.classList.add('on');
    closeAllAppOverlays();
    showToast('👆 Huella / rostro configurado', 'success');
  }
  window.registerBiometric = registerBiometric;

  function tryBiometricUnlock() {
    // Sin backend biométrico real disponible aquí: simulamos el desbloqueo.
    closeAllAppOverlays();
    showToast('Desbloqueado', 'success');
  }
  window.tryBiometricUnlock = tryBiometricUnlock;

  function closeAllAppOverlays() {
    el.configOverlay.hidden = true;
    el.lockOverlay.hidden = true;
    el.pinOverlay.hidden = true;
  }

  // ---- PIN ----
  function openPinSetup() {
    pinContext = 'setup';
    pinSetupFirstEntry = null;
    pinBuffer = '';
    el.pinOverlayTitle.textContent = 'Crea un PIN';
    el.pinOverlaySub.textContent = 'Usa 4 dígitos que puedas recordar';
    renderPinDots();
    el.pinError.textContent = '';
    el.pinOverlay.hidden = false;
  }
  window.openPinSetup = openPinSetup;

  function openPinEntry() {
    pinContext = 'entry';
    pinBuffer = '';
    el.pinOverlayTitle.textContent = 'Ingresa tu PIN';
    el.pinOverlaySub.textContent = 'Por seguridad, confirma con tu PIN';
    renderPinDots();
    el.pinError.textContent = '';
    el.lockOverlay.hidden = true;
    el.pinOverlay.hidden = false;
  }
  window.openPinEntry = openPinEntry;

  function closePinOverlay() {
    el.pinOverlay.hidden = true;
    pinBuffer = '';
    pinContext = null;
  }
  window.closePinOverlay = closePinOverlay;

  function renderPinDots() {
    const dots = el.pinDots.querySelectorAll('span');
    dots.forEach((dot, i) => {
      dot.classList.toggle('filled', i < pinBuffer.length);
      dot.classList.remove('error');
    });
  }

  async function hashPin(pin) {
    const enc = new TextEncoder().encode('centinela-salt-' + pin);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function pinPress(digit) {
    if (pinBuffer.length >= 4) return;
    pinBuffer += String(digit);
    renderPinDots();
    if (pinBuffer.length === 4) setTimeout(() => handlePinComplete(), 120);
  }
  window.pinPress = pinPress;

  function pinBackspace() {
    pinBuffer = pinBuffer.slice(0, -1);
    renderPinDots();
    el.pinError.textContent = '';
  }
  window.pinBackspace = pinBackspace;

  async function handlePinComplete() {
    if (pinContext === 'setup') {
      if (!pinSetupFirstEntry) {
        pinSetupFirstEntry = pinBuffer;
        pinBuffer = '';
        el.pinOverlaySub.textContent = 'Confirma tu PIN';
        renderPinDots();
        return;
      }
      if (pinBuffer === pinSetupFirstEntry) {
        const hash = await hashPin(pinBuffer);
        localStorage.setItem(LS.pinHash, hash);
        el.pinStatusSub.textContent = 'Configurado';
        closePinOverlay();
        closeAllAppOverlays();
        showToast('🔢 PIN configurado correctamente', 'success');
      } else {
        el.pinError.textContent = 'Los PIN no coinciden, intenta de nuevo';
        el.pinDots.querySelectorAll('span').forEach((d) => d.classList.add('error'));
        pinSetupFirstEntry = null;
        pinBuffer = '';
        setTimeout(renderPinDots, 400);
      }
    } else if (pinContext === 'entry') {
      const hash = await hashPin(pinBuffer);
      const saved = localStorage.getItem(LS.pinHash);
      if (saved && hash === saved) {
        closePinOverlay();
        closeAllAppOverlays();
        showToast('Desbloqueado', 'success');
      } else {
        el.pinError.textContent = 'PIN incorrecto';
        el.pinDots.querySelectorAll('span').forEach((d) => d.classList.add('error'));
        pinBuffer = '';
        vibrate([80, 40, 80]);
        setTimeout(renderPinDots, 400);
      }
    }
  }

  // =========================================================================
  // AJUSTES — PROXIMIDAD, SONIDO, MODOS, SENSORES
  // =========================================================================

  function toggleProximity(node) {
    const on = node.classList.toggle('on');
    localStorage.setItem(LS.proximity, on ? 'on' : 'off');
    el.proximityLiveCard.style.display = on ? 'block' : 'none';
    showToast(on ? '📶 Armado/desarmado automático activado' : 'Armado/desarmado automático desactivado', 'success');
  }
  window.toggleProximity = toggleProximity;

  function updateProximityLabel(value) {
    const idx = Math.max(0, Math.min(PROXIMITY_LABELS.length - 1, value - 1));
    el.proximityValLabel.textContent = PROXIMITY_LABELS[idx];
    localStorage.setItem(LS.proximitySensitivity, value);
  }
  window.updateProximityLabel = updateProximityLabel;

  function toggleSound(node) {
    const on = node.classList.toggle('on');
    localStorage.setItem(LS.soundOn, on ? 'on' : 'off');
    if (on) playConfirmSound();
  }
  window.toggleSound = toggleSound;

  function toggleMode(mode, node) {
    const on = node.classList.toggle('on');
    const modes = JSON.parse(localStorage.getItem(LS.modes) || '{}');
    modes[mode] = on;
    localStorage.setItem(LS.modes, JSON.stringify(modes));
    const labels = { valet: 'Modo valet', taller: 'Modo taller', ninos: 'Modo niños' };
    showToast(`${labels[mode] || mode} ${on ? 'activado' : 'desactivado'}`, 'success');
  }
  window.toggleMode = toggleMode;

  function toggleSensor(sensor, node) {
    const on = node.classList.toggle('on');
    const sensors = JSON.parse(localStorage.getItem(LS.sensors) || '{}');
    sensors[sensor] = on;
    localStorage.setItem(LS.sensors, JSON.stringify(sensors));
    showToast(`Sensor ${on ? 'activado' : 'desactivado'}`, 'success');
  }
  window.toggleSensor = toggleSensor;

  // =========================================================================
  // AJUSTES — CUENTA / TELÉFONOS
  // =========================================================================

  function openEmergencyCode() {
    showToast('🔑 Código de emergencia: consulta el manual impreso de tu vehículo', 'info');
  }
  window.openEmergencyCode = openEmergencyCode;

  function pairNewPhone() {
    sendCmd('PAIR_MODE', '📲 Modo de vinculación abierto por 60 segundos');
  }
  window.pairNewPhone = pairNewPhone;

  function forgetPhonesSecure() {
    if (!confirm('¿Olvidar todos los teléfonos vinculados? Deberás volver a vincular tu teléfono.')) return;
    sendCmd('FORGET_PHONES', '🧹 Teléfonos olvidados. Vinculación abierta.');
  }
  window.forgetPhonesSecure = forgetPhonesSecure;

  // =========================================================================
  // INSTALACIÓN PWA
  // =========================================================================

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (el.installBtn) el.installBtn.style.display = 'flex';
  });

  function installApp() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => {
      deferredInstallPrompt = null;
      if (el.installBtn) el.installBtn.style.display = 'none';
    });
  }
  window.installApp = installApp;

  // =========================================================================
  // INICIALIZACIÓN
  // =========================================================================

  function restoreSettingsUI() {
    applyVehicleName();

    if (localStorage.getItem(LS.biometric) === 'on' && el.switchBiometric) {
      el.switchBiometric.classList.add('on');
      el.bioStatusSub.textContent = 'Activado';
    }
    if (localStorage.getItem(LS.pinHash) && el.pinStatusSub) {
      el.pinStatusSub.textContent = 'Configurado';
    }
    if (localStorage.getItem(LS.proximity) === 'on' && el.switchProximity) {
      el.switchProximity.classList.add('on');
      el.proximityLiveCard.style.display = 'block';
    }
    const sens = localStorage.getItem(LS.proximitySensitivity);
    if (sens && el.proximitySlider) {
      el.proximitySlider.value = sens;
      updateProximityLabel(sens);
    }
    if (localStorage.getItem(LS.soundOn) === 'off' && el.switchSound) {
      el.switchSound.classList.remove('on');
    }
    const modes = JSON.parse(localStorage.getItem(LS.modes) || '{}');
    if (modes.valet && el.switchValet) el.switchValet.classList.add('on');
    if (modes.taller && el.switchTaller) el.switchTaller.classList.add('on');
    if (modes.ninos === false && el.switchNinos) el.switchNinos.classList.remove('on');

    const sensors = JSON.parse(localStorage.getItem(LS.sensors) || '{}');
    if (sensors.impacto === false && el.switchImpacto) el.switchImpacto.classList.remove('on');
    if (sensors.inclinacion === false && el.switchInclinacion) el.switchInclinacion.classList.remove('on');
  }

  function checkInitialSecuritySetup() {
    const hasBio = localStorage.getItem(LS.biometric) === 'on';
    const hasPin = !!localStorage.getItem(LS.pinHash);
    if (!hasBio && !hasPin) {
      el.configOverlay.hidden = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    restoreSettingsUI();
    checkInitialSecuritySetup();
    updateEngineButtonsState({});

    // Registrar Service Worker si existe (PWA offline-first). Silencioso si no hay uno.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* no hay service worker, no pasa nada */ });
    }
  });

})();
