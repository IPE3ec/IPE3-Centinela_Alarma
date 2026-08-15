// ==========================================
// app.js - CENTINELA V5.0 - CORREGIDO
// ==========================================

// ==========================================
// CONFIGURACIÓN
// ==========================================
const CONFIG = {
    SERVICE_UUID: '0000ffe0-0000-1000-8000-00805f9b34fb',
    CHARACTERISTIC_UUID: '0000ffe1-0000-1000-8000-00805f9b34fb',
    DEVICE_NAME: 'CENTINELA_BT',
    STATUS_INTERVAL: 3000,
};

// ==========================================
// ESTADO GLOBAL
// ==========================================
const state = {
    device: null,
    characteristic: null,
    isConnected: false,
    isConnecting: false,
    masterMac: '',
    isPaired: false,
    isArmed: false,
    isAlarm: false,
    isEngineOn: false,
    lockStatus: 'locked',
    windowPosition: 0,
    batteryVoltage: 0,
    motorTemp: 0,
    doorStatus: false,
    esp32Mac: '',
    statusInterval: null,
    debug: true,
    pendingAction: null,
    checklists: {
        start: [
            { id: '1', label: 'Freno de mano activado', checked: false },
            { id: '2', label: 'Palanca en punto muerto o P', checked: false },
            { id: '3', label: 'No hay obstáculos cerca', checked: false }
        ],
        stop: [
            { id: '1', label: 'Vehículo completamente detenido', checked: false },
            { id: '2', label: 'Freno de mano activado', checked: false },
            { id: '3', label: 'Confirmar apagado', checked: false }
        ]
    }
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    log('🚀 Inicializando Centinela v5.0');
    loadSavedSettings();
    
    if (!navigator.bluetooth) {
        document.getElementById('bleWarning').hidden = false;
        showToast('❌ Web Bluetooth no está disponible', 'error');
        log('❌ Web Bluetooth no disponible');
        return;
    }
    
    setupEventListeners();
    updateUI();
    startStatusPolling();
    log('✅ App inicializada correctamente');
});

function log(message) {
    if (state.debug) {
        console.log(`[Centinela] ${message}`);
    }
}

// ==========================================
// CARGA DE CONFIGURACIÓN
// ==========================================
function loadSavedSettings() {
    const savedName = localStorage.getItem('centinela_vehicle_name') || 'Mi vehículo';
    document.getElementById('vehicleNameDisplay').textContent = savedName;
    document.getElementById('vehicleNameSetting').textContent = savedName;
    
    state.masterMac = localStorage.getItem('centinela_master_mac') || '';
    state.isPaired = !!state.masterMac;
    
    const savedPlate = localStorage.getItem('centinela_plate') || 'ABC-1234';
    const plateEl = document.getElementById('vehiclePlate');
    if (plateEl) plateEl.textContent = savedPlate;
    
    const proximity = localStorage.getItem('centinela_proximity') === 'true';
    if (proximity) {
        const el = document.getElementById('switchProximity');
        if (el) {
            el.classList.add('on');
            el.setAttribute('aria-checked', 'true');
        }
        const proxCard = document.getElementById('proximityLiveCard');
        if (proxCard) proxCard.style.display = 'block';
    }
    
    const sound = localStorage.getItem('centinela_sound') !== 'false';
    if (!sound) {
        const el = document.getElementById('switchSound');
        if (el) {
            el.classList.remove('on');
            el.setAttribute('aria-checked', 'false');
        }
    }
    
    log(`📱 MAC cargada: ${state.masterMac || 'ninguna'}`);
    log(`🔗 Vinculado: ${state.isPaired ? 'Sí' : 'No'}`);
}

// ==========================================
// BLUETOOTH - CONEXIÓN (CORREGIDA)
// ==========================================
async function connectBLE() {
    if (state.isConnecting) {
        showToast('⏳ Ya estamos conectando...', 'info');
        return;
    }
    
    if (state.isConnected) {
        showToast('✅ Ya estás conectado', 'success');
        return;
    }

    if (!navigator.bluetooth) {
        showToast('❌ Web Bluetooth no está disponible', 'error');
        return;
    }

    state.isConnecting = true;

    let device;
    try {
        showToast('🔍 Buscando CENTINELA_BT...', 'info');
        log('🔍 Iniciando búsqueda de dispositivo...');
        device = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'CENTINELA_BT' }],
            optionalServices: [CONFIG.SERVICE_UUID]
        });
    } catch (nameError) {
        try {
            device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'CENTINELA' }],
                optionalServices: [CONFIG.SERVICE_UUID]
            });
        } catch (prefixError) {
            try {
                device = await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: [CONFIG.SERVICE_UUID]
                });
            } catch (allError) {
                state.isConnecting = false;
                updateConnectionUI(false);
                showToast('❌ No se encontró ningún dispositivo', 'error');
                log(`❌ Error de conexión: ${allError.message}`);
                return;
            }
        }
    }

    if (!device) {
        state.isConnecting = false;
        updateConnectionUI(false);
        showToast('❌ No se encontró ningún dispositivo', 'error');
        return;
    }

    updateConnectionUI(false, 'conectando');
    log(`📱 Dispositivo encontrado: ${device.name || 'Sin nombre'} (${device.id})`);

    if (device.name && !device.name.includes('CENTINELA')) {
        showToast(`⚠️ Dispositivo seleccionado: ${device.name}`, 'warning');
        log(`⚠️ Dispositivo seleccionado no es CENTINELA: ${device.name}`);
    }

    showToast('🔗 Conectando a ' + (device.name || 'dispositivo') + '...', 'info');
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(CONFIG.SERVICE_UUID);
    const characteristic = await service.getCharacteristic(CONFIG.CHARACTERISTIC_UUID);

    state.device = device;
    state.characteristic = characteristic;
    state.isConnected = true;
    state.isConnecting = false;

    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', handleBLEMessage);

    log('🔐 Verificando vinculación...');
    await sendCommand('GETMAC');
    await waitForMAC();

    if (state.esp32Mac && state.esp32Mac !== '') {
        const currentMac = state.device.id;
        if (state.esp32Mac !== currentMac) {
            showToast('❌ Este teléfono no está vinculado al vehículo', 'error');
            log(`❌ MAC no coincide: ESP32=${state.esp32Mac}, Teléfono=${currentMac}`);
            await disconnectBLE();
            state.isConnecting = false;
            return;
        }
        log('✅ MAC verificada correctamente');
        state.isPaired = true;
        state.masterMac = state.esp32Mac;
        localStorage.setItem('centinela_master_mac', state.masterMac);
        showToast('✅ Conectado y verificado', 'success');
    } else {
        log('🆕 Primera vinculación detectada');
        state.isFirstTime = true;
        state.isPaired = false;
        
        const currentMac = state.device.id;
        state.masterMac = currentMac;
        localStorage.setItem('centinela_master_mac', currentMac);
        
        await sendCommand('SETMAC:' + currentMac);
        
        showToast('✅ ¡Primera vinculación exitosa!', 'success');
        addEvent('🔗 Primera vinculación con el vehículo', 'ok');
        log(`📱 MAC guardada: ${currentMac}`);
    }

    updateConnectionUI(true);
    await sendCommand('STATUS');
    addEvent('🔗 Conexión Bluetooth establecida', 'ok');

    } catch (error) {
        log(`❌ Error de conexión: ${error.message}`);
        state.isConnected = false;
        state.isConnecting = false;
        updateConnectionUI(false);
        showToast(`❌ Error: ${error.message}`, 'error');
    }
}

// ==========================================
// BLE - ESPERA DE MAC
// ==========================================
function waitForMAC() {
    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 20;
        const interval = setInterval(() => {
            attempts++;
            if (state.esp32Mac !== undefined || attempts >= maxAttempts) {
                clearInterval(interval);
                resolve();
            }
        }, 100);
    });
}

// ==========================================
// BLE - DESCONEXIÓN
// ==========================================
async function disconnectBLE() {
    log('🔌 Desconectando...');
    
    if (state.device && state.device.gatt) {
        try {
            state.device.gatt.disconnect();
        } catch (e) {
            log(`Error al desconectar: ${e.message}`);
        }
    }
    
    state.isConnected = false;
    state.isConnecting = false;
    state.device = null;
    state.characteristic = null;
    
    if (state.statusInterval) {
        clearInterval(state.statusInterval);
        state.statusInterval = null;
    }
    
    updateConnectionUI(false);
    showToast('🔌 Desconectado', 'info');
    addEvent('🔌 Desconexión Bluetooth', 'info');
}

// ==========================================
// BLE - MANEJO DE MENSAJES
// ==========================================
function handleBLEMessage(event) {
    try {
        const value = event.target.value;
        const message = new TextDecoder().decode(value);
        log(`📨 Recibido: ${message}`);
        
        if (message.startsWith('MAC:')) {
            const mac = message.substring(4).trim();
            state.esp32Mac = mac;
            log(`🔑 MAC del ESP32: ${mac}`);
            if (!state.masterMac && mac) {
                state.masterMac = mac;
                localStorage.setItem('centinela_master_mac', mac);
            }
            return;
        }
        
        if (message.startsWith('SETMAC_OK')) {
            log('✅ MAC guardada en el ESP32');
            state.isPaired = true;
            showToast('🔐 Vehículo vinculado permanentemente', 'success');
            addEvent('🔐 Vehículo vinculado permanentemente', 'ok');
            return;
        }
        
        if (message.startsWith('FORGET_ALL_OK')) {
            log('🗑️ Todas las MACs borradas');
            state.masterMac = '';
            state.isPaired = false;
            localStorage.removeItem('centinela_master_mac');
            showToast('🗑️ Teléfonos olvidados', 'info');
            addEvent('🗑️ Todos los teléfonos olvidados', 'info');
            return;
        }
        
        if (message.startsWith('ESTADO:')) {
            processStatusMessage(message);
            return;
        }
        
        if (message.endsWith('_OK')) {
            log(`✅ Comando ejecutado: ${message}`);
            return;
        }
        
        if (message.startsWith('ERROR:')) {
            log(`❌ Error: ${message}`);
            showToast(`❌ ${message}`, 'error');
            return;
        }
        
        log(`📨 Mensaje sin procesar: ${message}`);
        
    } catch (error) {
        log(`❌ Error procesando mensaje: ${error.message}`);
    }
}

// ==========================================
// PROCESAR MENSAJE DE ESTADO
// ==========================================
function processStatusMessage(message) {
    try {
        const parts = message.split('|');
        const data = {};
        
        parts.forEach(part => {
            const [key, value] = part.split(':');
            data[key] = value;
        });
        
        log(`📊 Estado recibido: ${JSON.stringify(data)}`);
        
        if (data.ESTADO) updateVehicleState(data.ESTADO);
        if (data.VOLT) {
            state.batteryVoltage = parseFloat(data.VOLT);
            document.getElementById('statBattery').textContent = data.VOLT + 'V';
        }
        if (data.TEMP) {
            state.motorTemp = parseFloat(data.TEMP);
            document.getElementById('statMotorTemp').textContent = data.TEMP + '°C';
        }
        if (data.PUERTAS) {
            state.doorStatus = data.PUERTAS === '1';
            document.getElementById('doorStatus').textContent = 
                state.doorStatus ? 'abiertas' : 'cerradas';
        }
        if (data.MAC) {
            state.masterMac = data.MAC;
            localStorage.setItem('centinela_master_mac', data.MAC);
        }
        
        updateUI();
        
    } catch (error) {
        log(`❌ Error procesando estado: ${error.message}`);
    }
}

// ==========================================
// ACTUALIZAR ESTADO DEL VEHÍCULO
// ==========================================
function updateVehicleState(estado) {
    const shieldLabel = document.getElementById('shieldLabel');
    const shieldSubState = document.getElementById('shieldSubState');
    
    switch(estado) {
        case 'OFF':
            state.isEngineOn = false;
            state.isArmed = false;
            shieldLabel.textContent = 'DESARMADO';
            shieldSubState.textContent = 'inactivo';
            break;
        case 'PRESENCIA':
            state.isArmed = false;
            shieldLabel.textContent = 'PRESENCIA';
            shieldSubState.textContent = 'presencia detectada';
            break;
        case 'ACC':
            state.isArmed = true;
            shieldLabel.textContent = 'ACC';
            shieldSubState.textContent = 'accesorios';
            break;
        case 'IGN':
            state.isArmed = true;
            shieldLabel.textContent = 'ENCENDIDO';
            shieldSubState.textContent = 'contacto';
            break;
        case 'ARRANCANDO':
            state.isEngineOn = true;
            shieldLabel.textContent = 'ARRANCANDO';
            shieldSubState.textContent = 'motor encendiendo';
            break;
        case 'ENCENDIDO':
            state.isEngineOn = true;
            state.isArmed = true;
            shieldLabel.textContent = 'ENCENDIDO';
            shieldSubState.textContent = 'motor encendido';
            break;
        case 'ALARMA!':
            state.isAlarm = true;
            shieldLabel.textContent = '🚨 ALARMA';
            shieldSubState.textContent = '¡ALARMA DISPARADA!';
            showAlarmUI(true);
            break;
        default:
            shieldLabel.textContent = estado || 'DESCONOCIDO';
            shieldSubState.textContent = 'estado desconocido';
    }
    
    updateShieldUI();
}

// ==========================================
// ACTUALIZAR UI
// ==========================================
function updateUI() {
    updateShieldUI();
    updateLockUI(state.lockStatus === 'locked');
}

function updateShieldUI() {
    const shield = document.getElementById('shieldBtn');
    const app = document.getElementById('app');
    
    if (state.isArmed) {
        shield.classList.add('armed');
        app.dataset.armed = 'true';
    } else {
        shield.classList.remove('armed');
        app.dataset.armed = 'false';
    }
    
    if (state.isAlarm) {
        shield.classList.add('alarm');
    } else {
        shield.classList.remove('alarm');
    }
}

function updateLockUI(locked) {
    const btnLocked = document.getElementById('lockBtnClosed');
    const btnOpen = document.getElementById('lockBtnOpen');
    
    if (locked) {
        btnLocked.className = 'segmented-btn active';
        btnLocked.setAttribute('aria-pressed', 'true');
        btnOpen.className = 'segmented-btn';
        btnOpen.setAttribute('aria-pressed', 'false');
    } else {
        btnLocked.className = 'segmented-btn';
        btnLocked.setAttribute('aria-pressed', 'false');
        btnOpen.className = 'segmented-btn active';
        btnOpen.setAttribute('aria-pressed', 'true');
    }
}

function updateConnectionUI(connected, status = '') {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusPillText');
    const keyLinkTitle = document.getElementById('keyLinkTitle');
    const keyLinkSub = document.getElementById('keyLinkSub');
    const beam = document.getElementById('beam');

    if (connected) {
        dot.className = 'dot connected';
        text.textContent = 'Conectado';
        keyLinkTitle.textContent = '✅ Conectado a CENTINELA_BT';
        keyLinkSub.textContent = state.isPaired ? 'Vinculado' : 'Primera vinculación';
        if (beam) beam.style.opacity = '1';
    } else if (status === 'conectando') {
        dot.className = 'dot';
        dot.style.background = '#F39C12';
        text.textContent = 'Conectando...';
        keyLinkTitle.textContent = '⏳ Conectando...';
        keyLinkSub.textContent = 'Esperando respuesta';
        if (beam) beam.style.opacity = '0.6';
    } else {
        dot.className = 'dot';
        dot.style.background = '#5A6578';
        text.textContent = 'Sin conexión';
        keyLinkTitle.textContent = '📱 Toca para conectar por Bluetooth';
        keyLinkSub.textContent = state.isPaired ? 'Teléfono vinculado' : 'Primera vinculación';
        if (beam) beam.style.opacity = '0.35';
    }
}

// ==========================================
// ENVIAR COMANDOS
// ==========================================
async function sendCommand(command) {
    if (!state.isConnected || !state.characteristic) {
        if (!state.isConnecting) {
            showToast('⚠️ No hay conexión Bluetooth', 'warning');
        }
        return false;
    }

    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(command + '\n');
        await state.characteristic.writeValue(data);
        log(`📤 Enviado: ${command}`);
        return true;
    } catch (error) {
        log(`❌ Error enviando comando: ${error.message}`);
        showToast(`❌ Error: ${error.message}`, 'error');
        return false;
    }
}

// ==========================================
// POLLING DE ESTADO
// ==========================================
function startStatusPolling() {
    if (state.statusInterval) {
        clearInterval(state.statusInterval);
    }
    
    state.statusInterval = setInterval(async () => {
        if (state.isConnected) {
            await sendCommand('STATUS');
        }
    }, CONFIG.STATUS_INTERVAL);
}

// ==========================================
// BOTÓN PRINCIPAL
// ==========================================
function toggleArm() {
    if (!state.isConnected) {
        connectBLE();
        return;
    }
    
    if (state.isAlarm) {
        sendCommand('STOP');
        state.isAlarm = false;
        showAlarmUI(false);
        showToast('🔇 Alarma desactivada', 'success');
        addEvent('🔇 Alarma desactivada manualmente', 'ok');
        return;
    }
    
    if (state.isEngineOn) {
        confirmStop();
    } else {
        openStartChecklist();
    }
}

// ==========================================
// CONTROL DE SEGUROS
// ==========================================
function setLock(locked) {
    if (!state.isConnected) {
        showToast('⚠️ Conecta primero al vehículo', 'warning');
        return;
    }
    
    const command = locked ? 'LOCK' : 'UNLOCK';
    sendCommand(command);
    state.lockStatus = locked ? 'locked' : 'unlocked';
    updateLockUI(locked);
    addEvent(locked ? '🔒 Puertas bloqueadas' : '🔓 Puertas desbloqueadas', 'ok');
    showToast(locked ? '🔒 Puertas bloqueadas' : '🔓 Puertas desbloqueadas', 'success');
}

// ==========================================
// CONTROL DE VIDRIOS
// ==========================================
function moveWindowsSimple(direction) {
    if (!state.isConnected) {
        showToast('⚠️ Conecta primero al vehículo', 'warning');
        return;
    }
    
    const target = direction === 'up' ? 100 : 0;
    let current = state.windowPosition;
    const increment = direction === 'up' ? 10 : -10;
    
    const interval = setInterval(() => {
        current += increment;
        if (direction === 'up' && current >= target) {
            current = target;
            clearInterval(interval);
        } else if (direction === 'down' && current <= target) {
            current = target;
            clearInterval(interval);
        }
        
        state.windowPosition = current;
        document.getElementById('windowPct').textContent = current + '%';
        document.getElementById('windowFill').style.width = current + '%';
    }, 50);
    
    sendCommand(`WINDOW:${direction.toUpperCase()}`);
    showToast(`📱 ${direction === 'up' ? 'Subiendo' : 'Bajando'} vidrios...`, 'info');
    addEvent(`📱 ${direction === 'up' ? 'Subir' : 'Bajar'} vidrios`, 'info');
}

// ==========================================
// CONTROL DE LUCES
// ==========================================
function toggleLight(lightId) {
    if (!state.isConnected) {
        showToast('⚠️ Conecta primero al vehículo', 'warning');
        return;
    }
    
    const btn = document.querySelector(`.light-item[data-id="${lightId}"]`);
    const isPressed = btn.getAttribute('aria-pressed') === 'true';
    const newState = !isPressed;
    
    btn.setAttribute('aria-pressed', newState);
    btn.classList.toggle('active', newState);
    
    sendCommand(`LIGHT:${lightId}:${newState ? 'ON' : 'OFF'}`);
    showToast(`💡 Luz ${lightId} ${newState ? 'encendida' : 'apagada'}`, 'info');
}

// ==========================================
// ENCONTRAR AUTO
// ==========================================
function findCar() {
    if (!state.isConnected) {
        connectBLE();
        return;
    }
    
    sendCommand('HORN');
    showToast('📯 Buscando vehículo...', 'info');
    addEvent('📯 Búsqueda de vehículo activada', 'info');
}

// ==========================================
// SIRENA
// ==========================================
function sendCmd(cmd, msg) {
    if (!state.isConnected) {
        connectBLE();
        return;
    }
    
    sendCommand(cmd);
    showToast(msg, 'info');
    addEvent(msg, 'info');
}

// ==========================================
// CHECKLIST
// ==========================================
function openStartChecklist() {
    if (!state.isConnected) {
        connectBLE();
        return;
    }
    
    if (state.isEngineOn) {
        showToast('⚠️ El motor ya está encendido', 'warning');
        return;
    }
    
    state.pendingAction = 'start';
    showChecklist('start', 'Arranque remoto', 'Verifica las condiciones antes de arrancar');
}

function confirmStop() {
    if (!state.isConnected) {
        connectBLE();
        return;
    }
    
    if (!state.isEngineOn) {
        showToast('⚠️ El motor ya está apagado', 'warning');
        return;
    }
    
    state.pendingAction = 'stop';
    showChecklist('stop', 'Apagado remoto', 'Confirma que el vehículo está detenido');
}

function showChecklist(type, title, subtitle) {
    const overlay = document.getElementById('checklistOverlay');
    const itemsContainer = document.getElementById('checklistItems');
    const confirmBtn = document.getElementById('checklistConfirmBtn');
    
    document.getElementById('checklistTitle').textContent = title;
    document.getElementById('checklistSub').textContent = subtitle;
    
    const checklist = state.checklists[type];
    itemsContainer.innerHTML = '';
    
    checklist.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'checklist-item';
        div.innerHTML = `
            <input type="checkbox" id="check_${type}_${index}" onchange="updateChecklistStatus()">
            <label for="check_${type}_${index}">${item.label}</label>
        `;
        itemsContainer.appendChild(div);
    });
    
    confirmBtn.disabled = true;
    overlay.hidden = false;
}

function updateChecklistStatus() {
    const checkboxes = document.querySelectorAll('#checklistItems input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    document.getElementById('checklistConfirmBtn').disabled = !allChecked;
}

function confirmChecklistAction() {
    const action = state.pendingAction;
    const overlay = document.getElementById('checklistOverlay');
    
    if (action === 'start') {
        sendCommand('START');
        showToast('🚗 Arrancando motor...', 'info');
        addEvent('🚗 Arranque remoto iniciado', 'ok');
    } else if (action === 'stop') {
        sendCommand('STOP');
        showToast('🛑 Apagando motor...', 'info');
        addEvent('🛑 Apagado remoto ejecutado', 'ok');
    }
    
    overlay.hidden = true;
    state.pendingAction = null;
}

function closeChecklistOverlay() {
    document.getElementById('checklistOverlay').hidden = true;
    state.pendingAction = null;
}

// ==========================================
// ALARMA
// ==========================================
function showAlarmUI(active) {
    const badge = document.getElementById('alarmBadge');
    const app = document.getElementById('app');
    
    if (active) {
        badge.hidden = false;
        app.dataset.alarm = 'true';
        document.getElementById('shieldLabel').textContent = '🚨 ALARMA';
        document.getElementById('shieldSubState').textContent = '¡ALARMA DISPARADA!';
        showToast('🚨 ¡ALARMA DISPARADA!', 'error');
        addEvent('🚨 ¡ALARMA DISPARADA!', 'error');
        document.getElementById('shieldBtn').classList.add('alarm');
    } else {
        badge.hidden = true;
        app.dataset.alarm = 'false';
        document.getElementById('shieldBtn').classList.remove('alarm');
        state.isAlarm = false;
    }
}

function stopAlarmFromUI() {
    if (state.isConnected) {
        sendCommand('STOP');
        state.isAlarm = false;
        showAlarmUI(false);
        showToast('🔇 Alarma desactivada', 'success');
        addEvent('🔇 Alarma desactivada manualmente', 'ok');
    } else {
        showToast('⚠️ Conecta al vehículo para desactivar la alarma', 'warning');
    }
}

// ==========================================
// NAVEGACIÓN
// ==========================================
function navigateTo(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    
    const target = document.getElementById(`screen-${screen}`);
    if (target) target.classList.add('active');
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const tab = document.querySelector(`.tab[data-screen="${screen}"]`);
    if (tab) tab.classList.add('active');
    
    if (screen === 'mapa') {
        initMap();
    }
}

// ==========================================
// MAPA
// ==========================================
let mapInstance = null;
let marker = null;

function initMap() {
    if (mapInstance) return;
    
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;
    
    try {
        mapInstance = L.map('map').setView([-34.6037, -58.3816], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(mapInstance);
        
        marker = L.marker([-34.6037, -58.3816]).addTo(mapInstance);
        mapContainer.classList.remove('loading');
    } catch (error) {
        log(`❌ Error inicializando mapa: ${error.message}`);
    }
}

// ==========================================
// TOAST
// ==========================================
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show';
    
    const colors = {
        error: '#E74C3C',
        success: '#2ECC71',
        warning: '#F39C12',
        info: '#3498DB'
    };
    toast.style.borderColor = colors[type] || colors.info;
    toast.style.color = '#E8EDF5';
    
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

// ==========================================
// EVENTOS
// ==========================================
function addEvent(text, type = 'info') {
    const feed = document.getElementById('eventFeed');
    const empty = document.getElementById('eventFeedEmpty');
    
    if (empty) empty.remove();
    
    const eventDiv = document.createElement('div');
    eventDiv.className = 'event';
    
    const iconClass = type === 'error' ? 'danger' : type === 'ok' ? 'ok' : 'info';
    
    eventDiv.innerHTML = `
        <div class="event-icon ${iconClass}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v4M12 18v4"/>
            </svg>
        </div>
        <div class="event-body">
            <div class="event-title">${text}</div>
            <div class="event-time">${new Date().toLocaleTimeString()}</div>
        </div>
    `;
    
    feed.prepend(eventDiv);
    
    while (feed.children.length > 50) {
        feed.removeChild(feed.lastChild);
    }
}

// ==========================================
// CONFIGURACIÓN
// ==========================================
function setupEventListeners() {
    document.querySelectorAll('.switch').forEach(sw => {
        sw.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('checklistOverlay').hidden = true;
            document.getElementById('pinOverlay').hidden = true;
        }
    });
}

function editVehicle() {
    const name = prompt('Nombre del vehículo:', 
        document.getElementById('vehicleNameSetting').textContent);
    if (name) {
        localStorage.setItem('centinela_vehicle_name', name);
        document.getElementById('vehicleNameDisplay').textContent = name;
        document.getElementById('vehicleNameSetting').textContent = name;
        showToast('✅ Nombre actualizado', 'success');
    }
}

function editPlate() {
    const plate = prompt('Número de placa:', 
        document.getElementById('vehiclePlate').textContent);
    if (plate) {
        localStorage.setItem('centinela_plate', plate);
        document.getElementById('vehiclePlate').textContent = plate;
        showToast('✅ Placa actualizada', 'success');
    }
}

function toggleBiometric(element) {
    const isOn = element.classList.toggle('on');
    element.setAttribute('aria-checked', isOn);
    document.getElementById('bioStatusSub').textContent = 
        isOn ? 'Activado' : 'Desactivado';
    showToast(`🔐 Biometría ${isOn ? 'activada' : 'desactivada'}`, 'info');
}

function toggleProximity(element) {
    const isOn = element.classList.toggle('on');
    element.setAttribute('aria-checked', isOn);
    localStorage.setItem('centinela_proximity', isOn);
    document.getElementById('proximityLiveCard').style.display = isOn ? 'block' : 'none';
    showToast(`📡 Proximidad ${isOn ? 'activada' : 'desactivada'}`, 'info');
}

function toggleSound(element) {
    const isOn = element.classList.toggle('on');
    element.setAttribute('aria-checked', isOn);
    localStorage.setItem('centinela_sound', isOn);
    showToast(`🔊 Sonidos ${isOn ? 'activados' : 'desactivados'}`, 'info');
}

function toggleMode(mode, element) {
    const isOn = element.classList.toggle('on');
    element.setAttribute('aria-checked', isOn);
    
    const command = `MODE:${mode.toUpperCase()}:${isOn ? 'ON' : 'OFF'}`;
    sendCommand(command);
    
    showToast(`🔄 Modo ${mode} ${isOn ? 'activado' : 'desactivado'}`, 'info');
}

function toggleSensor(sensor, element) {
    const isOn = element.classList.toggle('on');
    element.setAttribute('aria-checked', isOn);
    showToast(`📡 Sensor ${sensor} ${isOn ? 'activado' : 'desactivado'}`, 'info');
}

function updateProximityLabel(value) {
    const labels = ['Muy cerca', 'Cerca', 'Media', 'Lejos', 'Muy lejos'];
    document.getElementById('proximityValLabel').textContent = labels[value - 1] || 'Media';
}

// ==========================================
// PIN
// ==========================================
let pinBuffer = '';

function openPinSetup() {
    showToast('🔐 Función de PIN en desarrollo', 'info');
}

function openPinEntry() {
    pinBuffer = '';
    document.getElementById('pinDots').querySelectorAll('span').forEach(d => d.classList.remove('filled'));
    document.getElementById('pinError').textContent = '';
    document.getElementById('pinOverlay').hidden = false;
}

function closePinOverlay() {
    document.getElementById('pinOverlay').hidden = true;
    pinBuffer = '';
}

function pinPress(num) {
    pinBuffer += num.toString();
    const dots = document.querySelectorAll('#pinDots span');
    
    for (let i = 0; i < dots.length; i++) {
        if (i < pinBuffer.length) {
            dots[i].classList.add('filled');
        } else {
            dots[i].classList.remove('filled');
        }
    }
    
    if (pinBuffer.length === 4) {
        if (pinBuffer === '1984') {
            document.getElementById('pinError').textContent = '✅ PIN correcto';
            setTimeout(() => {
                closePinOverlay();
                showToast('✅ Desbloqueado', 'success');
            }, 500);
        } else {
            document.getElementById('pinError').textContent = '❌ PIN incorrecto';
            setTimeout(() => {
                pinBuffer = '';
                document.querySelectorAll('#pinDots span').forEach(d => d.classList.remove('filled'));
                document.getElementById('pinError').textContent = '';
            }, 1000);
        }
    }
}

function pinBackspace() {
    pinBuffer = pinBuffer.slice(0, -1);
    const dots = document.querySelectorAll('#pinDots span');
    dots.forEach((dot, i) => {
        if (i < pinBuffer.length) {
            dot.classList.add('filled');
        } else {
            dot.classList.remove('filled');
        }
    });
    document.getElementById('pinError').textContent = '';
}

// ==========================================
// EMERGENCIA Y OTROS
// ==========================================
function registerBiometric() {
    showToast('🔐 Configurando biometría...', 'info');
    setTimeout(() => {
        document.getElementById('configOverlay').hidden = true;
        showToast('✅ Biometría configurada', 'success');
    }, 1500);
}

function tryBiometricUnlock() {
    showToast('🔐 Verificando huella/rostro...', 'info');
    setTimeout(() => {
        document.getElementById('lockOverlay').hidden = true;
        showToast('✅ Desbloqueado', 'success');
    }, 1500);
}

function openEmergencyCode() {
    showToast('🔑 Código de emergencia: 1984', 'info');
}

function pairNewPhone() {
    if (!state.isConnected) {
        showToast('⚠️ Conecta primero al vehículo', 'warning');
        return;
    }
    showToast('📱 Abriendo segundo espacio por 60 segundos...', 'info');
    sendCommand('PAIR_NEW');
    setTimeout(() => {
        showToast('⏰ Tiempo para vincular expirado', 'warning');
    }, 60000);
}

function forgetPhonesSecure() {
    if (confirm('⚠️ ¿Seguro que quieres olvidar TODOS los teléfonos vinculados?')) {
        if (state.isConnected) {
            sendCommand('FORGET_ALL');
        } else {
            showToast('⚠️ Conecta al vehículo para ejecutar', 'warning');
            return;
        }
        localStorage.removeItem('centinela_master_mac');
        state.masterMac = '';
        state.isPaired = false;
        showToast('🗑️ Todos los teléfonos olvidados', 'info');
    }
}

function installApp() {
    showToast('📱 Centinela ya está instalado', 'info');
}

// ==========================================
// EXPORTAR FUNCIONES GLOBALES
// ==========================================
window.connectBLE = connectBLE;
window.disconnectBLE = disconnectBLE;
window.toggleArm = toggleArm;
window.setLock = setLock;
window.toggleLight = toggleLight;
window.findCar = findCar;
window.navigateTo = navigateTo;
window.showToast = showToast;
window.addEvent = addEvent;
window.openStartChecklist = openStartChecklist;
window.confirmStop = confirmStop;
window.confirmChecklistAction = confirmChecklistAction;
window.closeChecklistOverlay = closeChecklistOverlay;
window.updateChecklistStatus = updateChecklistStatus;
window.stopAlarmFromUI = stopAlarmFromUI;
window.moveWindowsSimple = moveWindowsSimple;
window.sendCmd = sendCmd;
window.editVehicle = editVehicle;
window.editPlate = editPlate;
window.toggleBiometric = toggleBiometric;
window.toggleProximity = toggleProximity;
window.toggleSound = toggleSound;
window.toggleMode = toggleMode;
window.toggleSensor = toggleSensor;
window.updateProximityLabel = updateProximityLabel;
window.openPinSetup = openPinSetup;
window.openPinEntry = openPinEntry;
window.closePinOverlay = closePinOverlay;
window.pinPress = pinPress;
window.pinBackspace = pinBackspace;
window.registerBiometric = registerBiometric;
window.tryBiometricUnlock = tryBiometricUnlock;
window.openEmergencyCode = openEmergencyCode;
window.pairNewPhone = pairNewPhone;
window.forgetPhonesSecure = forgetPhonesSecure;
window.installApp = installApp;
window.sendCommand = sendCommand;
window.log = log;
window.initMap = initMap;

log('✅ app.js cargado correctamente');
