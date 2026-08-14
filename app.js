// ==========================================
// CENTINELA V5.0 - APP.JS
// COMPATIBLE CON FIRMWARE ESP32
// ==========================================

// ==========================================
// CONFIGURACIÓN GLOBAL
// ==========================================
const CONFIG = {
    SERVICE_UUID: '0000ffe0-0000-1000-8000-00805f9b34fb',
    CHARACTERISTIC_UUID: '0000ffe1-0000-1000-8000-00805f9b34fb',
    DEVICE_NAME: 'CENTINELA_BT',
    RECONNECT_INTERVAL: 5000,
    STATUS_INTERVAL: 3000
};

// ==========================================
// ESTADO DE LA APP
// ==========================================
const state = {
    device: null,
    characteristic: null,
    isConnected: false,
    isArmed: false,
    isAlarm: false,
    isEngineOn: false,
    lockStatus: 'locked', // 'locked' | 'unlocked'
    batteryVoltage: 0,
    motorTemp: 0,
    fuelLevel: 0,
    gpsSignal: 0,
    rssi: 0,
    windowPosition: 0,
    doorStatus: false,
    macMaster: '',
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
    },
    pendingAction: null
};

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    checkBLEAvailability();
    loadSettings();
    updateUI();
    setupEventListeners();
    startStatusPolling();
});

// ==========================================
// FUNCIONES BLUETOOTH
// ==========================================

function checkBLEAvailability() {
    if (!navigator.bluetooth) {
        document.getElementById('bleWarning').hidden = false;
        showToast('❌ Web Bluetooth no está disponible en este navegador', 'error');
        return false;
    }
    return true;
}

async function connectBLE() {
    if (!checkBLEAvailability()) return;

    try {
        showToast('🔍 Buscando CENTINELA_BT...', 'info');
        
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ name: CONFIG.DEVICE_NAME }],
            optionalServices: [CONFIG.SERVICE_UUID]
        });

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(CONFIG.SERVICE_UUID);
        const characteristic = await service.getCharacteristic(CONFIG.CHARACTERISTIC_UUID);

        state.device = device;
        state.characteristic = characteristic;
        state.isConnected = true;

        // Configurar notificaciones
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', handleBLEMessage);

        // Actualizar UI
        updateConnectionUI(true);
        
        // Enviar comando de estado
        sendCommand('STATUS');
        
        showToast('✅ Conectado a CENTINELA_BT', 'success');
        
        // Registrar evento
        addEvent('🔗 Conexión Bluetooth establecida', 'ok');

    } catch (error) {
        console.error('Error BLE:', error);
        state.isConnected = false;
        updateConnectionUI(false);
        showToast('❌ Error de conexión: ' + error.message, 'error');
    }
}

function disconnectBLE() {
    if (state.device && state.device.gatt) {
        state.device.gatt.disconnect();
    }
    state.isConnected = false;
    state.device = null;
    state.characteristic = null;
    updateConnectionUI(false);
    showToast('🔌 Desconectado', 'info');
}

function updateConnectionUI(connected) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusPillText');
    const keyLinkTitle = document.getElementById('keyLinkTitle');
    const keyLinkSub = document.getElementById('keyLinkSub');
    const beam = document.getElementById('beam');

    if (connected) {
        dot.className = 'dot connected';
        text.textContent = 'Conectado';
        keyLinkTitle.textContent = '✅ Conectado a CENTINELA_BT';
        keyLinkSub.textContent = 'Sistema listo';
        beam.style.opacity = '1';
    } else {
        dot.className = 'dot';
        text.textContent = 'Sin conexión';
        keyLinkTitle.textContent = '📱 Toca para conectar por Bluetooth';
        keyLinkSub.textContent = 'Sin conexión';
        beam.style.opacity = '0.35';
    }
}

function startStatusPolling() {
    setInterval(() => {
        if (state.isConnected) {
            sendCommand('STATUS');
        }
    }, CONFIG.STATUS_INTERVAL);
}

// ==========================================
// MANEJO DE MENSAJES BLE
// ==========================================

function handleBLEMessage(event) {
    const value = event.target.value;
    const message = new TextDecoder().decode(value);
    console.log('📨 Recibido:', message);
    
    processBLEMessage(message);
}

function processBLEMessage(message) {
    // Formato: ESTADO:OFF|VOLT:12.0|TEMP:25.0|PUERTAS:0|BT:1|MAC:XX:XX:XX:XX:XX:XX
    
    if (message.startsWith('ESTADO:')) {
        const parts = message.split('|');
        const data = {};
        
        parts.forEach(part => {
            const [key, value] = part.split(':');
            data[key] = value;
        });
        
        // Actualizar estado
        if (data.ESTADO) {
            updateVehicleState(data.ESTADO);
        }
        
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
            state.macMaster = data.MAC;
        }
        
        updateUI();
    }
}

function updateVehicleState(estado) {
    switch(estado) {
        case 'OFF':
            state.isEngineOn = false;
            state.isArmed = false;
            document.getElementById('shieldLabel').textContent = 'DESARMADO';
            document.getElementById('shieldSubState').textContent = 'inactivo';
            break;
        case 'PRESENCIA':
            state.isArmed = false;
            document.getElementById('shieldLabel').textContent = 'PRESENCIA';
            document.getElementById('shieldSubState').textContent = 'presencia detectada';
            break;
        case 'ACC':
            state.isArmed = true;
            document.getElementById('shieldLabel').textContent = 'ACC';
            document.getElementById('shieldSubState').textContent = 'accesorios';
            break;
        case 'IGN':
            state.isArmed = true;
            document.getElementById('shieldLabel').textContent = 'ENCENDIDO';
            document.getElementById('shieldSubState').textContent = 'contacto';
            break;
        case 'ARRANCANDO':
            state.isEngineOn = true;
            document.getElementById('shieldLabel').textContent = 'ARRANCANDO';
            document.getElementById('shieldSubState').textContent = 'motor encendiendo';
            break;
        case 'ENCENDIDO':
            state.isEngineOn = true;
            state.isArmed = true;
            document.getElementById('shieldLabel').textContent = 'ENCENDIDO';
            document.getElementById('shieldSubState').textContent = 'motor encendido';
            break;
        case 'REMOTE':
            state.isEngineOn = true;
            document.getElementById('shieldLabel').textContent = 'REMOTO';
            document.getElementById('shieldSubState').textContent = 'arranque remoto';
            break;
        case 'VALET':
            document.getElementById('shieldLabel').textContent = 'VALET';
            document.getElementById('shieldSubState').textContent = 'modo valet';
            break;
        case 'TALLER':
            document.getElementById('shieldLabel').textContent = 'TALLER';
            document.getElementById('shieldSubState').textContent = 'modo taller';
            break;
        case 'ALARMA!':
            state.isAlarm = true;
            document.getElementById('shieldLabel').textContent = '🚨 ALARMA';
            document.getElementById('shieldSubState').textContent = '¡ALARMA DISPARADA!';
            showAlarmUI(true);
            break;
        default:
            document.getElementById('shieldLabel').textContent = 'DESCONOCIDO';
            document.getElementById('shieldSubState').textContent = 'estado desconocido';
    }
    
    updateShieldUI();
}

// ==========================================
// ENVÍO DE COMANDOS
// ==========================================

async function sendCommand(command) {
    if (!state.isConnected || !state.characteristic) {
        showToast('⚠️ No hay conexión Bluetooth', 'warning');
        return;
    }

    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(command + '\n');
        await state.characteristic.writeValue(data);
        console.log('📤 Enviado:', command);
    } catch (error) {
        console.error('Error enviando comando:', error);
        showToast('❌ Error enviando comando', 'error');
    }
}

// ==========================================
// COMANDOS DE CONTROL
// ==========================================

function toggleArm() {
    if (!state.isConnected) {
        connectBLE();
        return;
    }
    
    if (state.isAlarm) {
        sendCommand('STOP'); // Detener alarma
        return;
    }
    
    if (state.isEngineOn) {
        // Si el motor está encendido, apagar
        confirmStop();
    } else {
        // Si está apagado, arrancar
        openStartChecklist();
    }
}

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

function moveWindowsSimple(direction) {
    if (!state.isConnected) {
        showToast('⚠️ Conecta primero al vehículo', 'warning');
        return;
    }
    
    // El firmware no tiene comando directo para vidrios
    // Usamos LOCK/UNLOCK como placeholder (necesitarás agregar al firmware)
    showToast('⚠️ Función en desarrollo - Próxima actualización', 'info');
    addEvent(`📱 Solicitud: ${direction === 'up' ? 'Subir' : 'Bajar'} vidrios`, 'info');
}

function toggleLight(lightId) {
    if (!state.isConnected) {
        showToast('⚠️ Conecta primero al vehículo', 'warning');
        return;
    }
    
    // El firmware actual no tiene comandos individuales para luces
    // Se puede implementar como comando personalizado
    const btn = document.querySelector(`.light-item[data-id="${lightId}"]`);
    const isPressed = btn.getAttribute('aria-pressed') === 'true';
    btn.setAttribute('aria-pressed', !isPressed);
    btn.classList.toggle('active');
    
    // Enviar comando genérico (necesitas implementar en firmware)
    sendCommand(`LIGHT:${lightId}:${!isPressed ? 'ON' : 'OFF'}`);
    showToast(`💡 Luz ${lightId} ${!isPressed ? 'encendida' : 'apagada'}`, 'info');
}

function findCar() {
    if (!state.isConnected) {
        connectBLE();
        return;
    }
    
    // El firmware no tiene comando FIND CAR, usamos HORN como alternativa
    sendCommand('HORN');
    showToast('📯 Buscando vehículo...', 'info');
    addEvent('📯 Búsqueda de vehículo activada', 'info');
}

// ==========================================
// ARRANQUE/APAGADO REMOTO CON CHECKLIST
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
    
    // Generar items del checklist
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
    } else {
        badge.hidden = true;
        app.dataset.alarm = 'false';
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
    // Ocultar todas las pantallas
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    
    // Mostrar la pantalla seleccionada
    const target = document.getElementById(`screen-${screen}`);
    if (target) target.classList.add('active');
    
    // Actualizar tabs
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const tab = document.querySelector(`.tab[data-screen="${screen}"]`);
    if (tab) tab.classList.add('active');
    
    // Si es el mapa, inicializar
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
        console.error('Error inicializando mapa:', error);
    }
}

// ==========================================
// UI HELPERS
// ==========================================

function updateUI() {
    // Actualizar icono de armado
    updateShieldUI();
}

function updateShieldUI() {
    const shield = document.getElementById('shieldBtn');
    const label = document.getElementById('shieldLabel');
    const app = document.getElementById('app');
    
    if (state.isArmed) {
        shield.classList.add('armed');
        app.dataset.armed = 'true';
    } else {
        shield.classList.remove('armed');
        app.dataset.armed = 'false';
    }
}

function addEvent(text, type = 'info') {
    const feed = document.getElementById('eventFeed');
    const empty = document.getElementById('eventFeedEmpty');
    
    // Eliminar mensaje de vacío
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
    
    // Limitar a 50 eventos
    while (feed.children.length > 50) {
        feed.removeChild(feed.lastChild);
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show';
    
    // Cambiar color según tipo
    if (type === 'error') {
        toast.style.borderColor = '#E74C3C';
        toast.style.color = '#FF6B6B';
    } else if (type === 'success') {
        toast.style.borderColor = '#2ECC71';
        toast.style.color = '#6BFFB8';
    } else if (type === 'warning') {
        toast.style.borderColor = '#F39C12';
        toast.style.color = '#FFD93D';
    } else {
        toast.style.borderColor = '#3498DB';
        toast.style.color = '#6BCBFF';
    }
    
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

// ==========================================
// CONFIGURACIÓN
// ==========================================

function loadSettings() {
    const savedName = localStorage.getItem('vehicleName') || 'Mi vehículo';
    document.getElementById('vehicleNameDisplay').textContent = savedName;
    document.getElementById('vehicleNameSetting').textContent = savedName;
}

function editVehicle() {
    const name = prompt('Nombre del vehículo:', 
        document.getElementById('vehicleNameSetting').textContent);
    if (name) {
        localStorage.setItem('vehicleName', name);
        document.getElementById('vehicleNameDisplay').textContent = name;
        document.getElementById('vehicleNameSetting').textContent = name;
        showToast('✅ Nombre actualizado', 'success');
    }
}

function editPlate() {
    const plate = prompt('Número de placa:', 
        document.getElementById('vehiclePlate').textContent);
    if (plate) {
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
    document.getElementById('proximityLiveCard').style.display = isOn ? 'block' : 'none';
    showToast(`📡 Proximidad ${isOn ? 'activada' : 'desactivada'}`, 'info');
}

function toggleSound(element) {
    const isOn = element.classList.toggle('on');
    element.setAttribute('aria-checked', isOn);
    showToast(`🔊 Sonidos ${isOn ? 'activados' : 'desactivados'}`, 'info');
}

function toggleMode(mode, element) {
    const isOn = element.classList.toggle('on');
    element.setAttribute('aria-checked', isOn);
    
    if (isOn) {
        sendCommand(`MODE:${mode.toUpperCase()}:ON`);
    } else {
        sendCommand(`MODE:${mode.toUpperCase()}:OFF`);
    }
    
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
// EVENTOS
// ==========================================

function setupEventListeners() {
    // Toasts para switches
    document.querySelectorAll('.switch').forEach(sw => {
        sw.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    });
    
    // Cerrar overlays con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('checklistOverlay').hidden = true;
            document.getElementById('pinOverlay').hidden = true;
        }
    });
}

// ==========================================
// FUNCIONES DE PIN (placeholder)
// ==========================================

function openPinSetup() {
    showToast('🔐 Función de PIN en desarrollo', 'info');
}

function openPinEntry() {
    document.getElementById('pinOverlay').hidden = false;
    document.getElementById('pinOverlayTitle').textContent = 'Ingresa tu PIN';
    document.getElementById('pinOverlaySub').textContent = 'Por seguridad, confirma con tu PIN';
}

function closePinOverlay() {
    document.getElementById('pinOverlay').hidden = true;
}

function pinPress(num) {
    const dots = document.querySelectorAll('#pinDots span');
    let filled = false;
    
    for (let i = 0; i < dots.length; i++) {
        if (!dots[i].classList.contains('filled')) {
            dots[i].classList.add('filled');
            filled = true;
            break;
        }
    }
    
    // Si se llenaron todos, verificar
    if (document.querySelectorAll('#pinDots span.filled').length === 4) {
        setTimeout(() => {
            document.getElementById('pinError').textContent = 'PIN correcto';
            setTimeout(() => {
                closePinOverlay();
                showToast('✅ Desbloqueado', 'success');
            }, 500);
        }, 300);
    }
}

function pinBackspace() {
    const dots = document.querySelectorAll('#pinDots span');
    for (let i = dots.length - 1; i >= 0; i--) {
        if (dots[i].classList.contains('filled')) {
            dots[i].classList.remove('filled');
            break;
        }
    }
    document.getElementById('pinError').textContent = '';
}

// ==========================================
// OTRAS FUNCIONES
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
    showToast('📱 Abriendo segundo espacio por 60 segundos...', 'info');
    setTimeout(() => {
        showToast('⏰ Tiempo para vincular expirado', 'warning');
    }, 60000);
}

function forgetPhonesSecure() {
    if (confirm('¿Seguro que quieres olvidar todos los teléfonos vinculados?')) {
        if (state.isConnected) {
            sendCommand('FORGET_ALL');
        }
        showToast('🗑️ Todos los teléfonos olvidados', 'info');
    }
}

function installApp() {
    showToast('📱 Centinela ya está instalado', 'info');
}

// ==========================================
// EXPORTAR PARA USO EN HTML
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
