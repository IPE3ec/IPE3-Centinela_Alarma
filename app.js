// ========================================
// CENTINELA - PWA COMPLETA v1.0
// ========================================

// ==================== CONSTANTES ====================
const BLE_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const BLE_CMD_UUID = '12345678-1234-5678-1234-56789abcdef1';
const BLE_STATUS_UUID = '12345678-1234-5678-1234-56789abcdef2';

// ==================== ESTADO GLOBAL ====================
let bleDevice = null;
let bleServer = null;
let bleCharacteristic = null;
let statusCharacteristic = null;
let isConnected = false;
let deviceState = {
    armed: false,
    locked: false,
    engine: false,
    battery: 0,
    windowL: 35,
    windowR: 35,
    lights: {},
    alarmTriggered: false,
    bondedDevices: [],
    bondedCount: 0,
    maxBonded: 2
};
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚗 Centinela PWA iniciada');
    initApp();
    checkBLEAvailability();
    loadSettings();
});

function initApp() {
    // Navegación entre pantallas
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const screen = tab.dataset.screen;
            navigateTo(screen);
        });
    });

    // Enlaces de navegación
    document.querySelectorAll('[data-goto]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const screen = link.dataset.goto;
            navigateTo(screen);
        });
    });

    // Configuración inicial
    setupBLEConnection();
    setupEventListeners();
    setupMap();
}

// ==================== NAVEGACIÓN ====================
function navigateTo(screenId) {
    // Ocultar todas las pantallas
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    // Mostrar la pantalla seleccionada
    const target = document.getElementById(`screen-${screenId}`);
    if (target) {
        target.classList.add('active');
    }

    // Actualizar tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.screen === screenId);
    });

    // Scroll al inicio
    window.scrollTo(0, 0);

    // Inicializar mapa si es necesario
    if (screenId === 'mapa') {
        setTimeout(() => setupMap(), 300);
    }
}

// ==================== BLE ====================
function checkBLEAvailability() {
    if (!navigator.bluetooth) {
        showToast('❌ Tu navegador no soporta Bluetooth Web', 'error');
        return false;
    }
    return true;
}

async function setupBLEConnection() {
    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusPillText');
    const statusDot = document.getElementById('statusDot');

    // Verificar si ya hay un dispositivo guardado
    const savedDevice = localStorage.getItem('bleDeviceId');
    if (savedDevice) {
        try {
            // Intentar reconectar
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [BLE_SERVICE_UUID] }],
                optionalServices: [BLE_SERVICE_UUID]
            });
            // No podemos reconectar automáticamente, el usuario debe seleccionar
        } catch (error) {
            console.log('No se pudo reconectar automáticamente');
        }
    }

    // Actualizar UI de conexión
    updateConnectionUI(false);
}

async function connectBLE() {
    if (!navigator.bluetooth) {
        showToast('❌ Tu navegador no soporta Bluetooth Web', 'error');
        return;
    }

    try {
        showToast('🔍 Buscando Centinela...', 'info');

        const device = await navigator.bluetooth.requestDevice({
            filters: [
                { name: 'Centinela-ESP32' },
                { services: [BLE_SERVICE_UUID] }
            ],
            optionalServices: [BLE_SERVICE_UUID]
        });

        showToast('🔗 Conectando...', 'info');

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(BLE_SERVICE_UUID);
        
        // Característica de comandos
        const cmdChar = await service.getCharacteristic(BLE_CMD_UUID);
        bleCharacteristic = cmdChar;

        // Característica de estado (notificaciones)
        const statusChar = await service.getCharacteristic(BLE_STATUS_UUID);
        statusCharacteristic = statusChar;

        // Suscribirse a notificaciones
        await statusChar.startNotifications();
        statusChar.addEventListener('characteristicvaluechanged', handleStatusUpdate);

        // Guardar dispositivo
        bleDevice = device;
        bleServer = server;
        isConnected = true;
        localStorage.setItem('bleDeviceId', device.id);

        updateConnectionUI(true);
        showToast('✅ Conectado a Centinela', 'success');

        // Solicitar estado actual
        await sendBLECommand('GET_STATUS');

        // Actualizar estado de vinculación
        await updateBondedDevices();

    } catch (error) {
        console.error('Error de conexión BLE:', error);
        isConnected = false;
        updateConnectionUI(false);
        
        if (error.message.includes('cancelled')) {
            showToast('⏹️ Conexión cancelada', 'info');
        } else {
            showToast('❌ Error al conectar: ' + error.message, 'error');
        }
    }
}

function updateConnectionUI(connected) {
    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusPillText');
    const statusDot = document.getElementById('statusDot');

    if (connected) {
        statusPill.classList.add('connected');
        statusPill.classList.remove('disconnected');
        statusDot.style.backgroundColor = 'var(--success)';
        statusText.textContent = 'Conectado';
        
        // Actualizar key link
        document.getElementById('keyLinkTitle').textContent = '✅ Conectado al vehículo';
        document.getElementById('keyLinkSub').textContent = 'Listo para comandos';
        document.getElementById('beam').style.opacity = '1';
        
        // Ocultar banner de fallo
        document.getElementById('lightFaultBanner').style.display = 'none';
        
    } else {
        statusPill.classList.remove('connected');
        statusPill.classList.add('disconnected');
        statusDot.style.backgroundColor = 'var(--danger)';
        statusText.textContent = 'Sin conexión';
        
        document.getElementById('keyLinkTitle').textContent = '📱 Toca para conectar por Bluetooth';
        document.getElementById('keyLinkSub').textContent = 'Sin conexión';
        document.getElementById('beam').style.opacity = '0.35';
    }
}

async function sendBLECommand(command) {
    if (!bleCharacteristic || !isConnected) {
        showToast('⚠️ No hay conexión BLE', 'error');
        return false;
    }

    try {
        const encoder = new TextEncoder();
        await bleCharacteristic.writeValue(encoder.encode(command));
        console.log('📤 Comando enviado:', command);
        return true;
    } catch (error) {
        console.error('❌ Error enviando comando:', error);
        showToast('❌ Error al enviar comando', 'error');
        return false;
    }
}

function handleStatusUpdate(event) {
    try {
        const value = event.target.value;
        const decoder = new TextDecoder();
        const jsonString = decoder.decode(value);
        const data = JSON.parse(jsonString);
        
        console.log('📥 Estado recibido:', data);
        
        // Actualizar estado
        Object.assign(deviceState, data);
        
        // Actualizar UI
        updateUI(data);
        
    } catch (error) {
        console.error('Error procesando estado:', error);
    }
}

// ==================== ACTUALIZACIÓN DE UI ====================
function updateUI(data) {
    // Escudo central
    const shieldBtn = document.getElementById('shieldBtn');
    const shieldLabel = document.getElementById('shieldLabel');
    const shieldSubState = document.getElementById('shieldSubState');
    
    if (data.armed) {
        shieldBtn.setAttribute('aria-pressed', 'true');
        shieldLabel.textContent = 'ARMADO';
        shieldSubState.textContent = 'activo';
        document.querySelector('.app').setAttribute('data-armed', 'true');
    } else {
        shieldBtn.setAttribute('aria-pressed', 'false');
        shieldLabel.textContent = 'DESARMADO';
        shieldSubState.textContent = 'inactivo';
        document.querySelector('.app').setAttribute('data-armed', 'false');
    }

    // Estadísticas
    if (data.battery) {
        document.getElementById('statBattery').textContent = `${data.battery}V`;
    }
    
    if (data.engine !== undefined) {
        document.getElementById('statMotorTemp').textContent = data.engine ? 'ENCENDIDO' : 'APAGADO';
    }
    
    if (data.windowL !== undefined && data.windowR !== undefined) {
        // No hay combustible real, mostramos estado de vidrios
        document.getElementById('statFuel').textContent = `${data.windowL}%`;
    }
    
    if (data.bondedCount !== undefined) {
        document.getElementById('statGps').textContent = `${data.bondedCount}/${data.maxBonded || 2}`;
    }

    // Seguros
    if (data.locked !== undefined) {
        document.getElementById('lockBtnClosed').classList.toggle('active', data.locked);
        document.getElementById('lockBtnOpen').classList.toggle('active', !data.locked);
    }

    // Alarma
    if (data.alarmTriggered) {
        showToast('🚨 ¡ALARMA DISPARADA!', 'error');
        document.getElementById('shieldSubState').textContent = '🚨 ALARMA!';
    }

    // Teléfonos vinculados
    if (data.bondedDevices) {
        updateBondedUI(data.bondedDevices, data.bondedCount, data.maxBonded);
    }
}

function updateBondedUI(devices, count, max) {
    const statusText = document.getElementById('statusPillText');
    if (count > 0) {
        statusText.textContent = `Conectado (${count}/${max})`;
    }
}

async function updateBondedDevices() {
    await sendBLECommand('GET_BONDED');
}

// ==================== COMANDOS ====================

// ARM/DISARM
async function toggleArm() {
    const isArmed = document.querySelector('.app').getAttribute('data-armed') === 'true';
    const cmd = isArmed ? 'DISARM' : 'ARM';
    await sendBLECommand(cmd);
}

// Seguros
async function setLock(locked) {
    const cmd = locked ? 'LOCK' : 'UNLOCK';
    await sendBLECommand(cmd);
}

// Vidrios
async function moveWindow(side, amount) {
    const cmd = side === 'L' ? 'WIN_L_' : 'WIN_R_';
    const direction = amount > 0 ? 'UP' : 'DOWN';
    await sendBLECommand(cmd + direction);
    showToast(`Vidrio ${side === 'L' ? 'izquierdo' : 'derecho'} ${direction === 'UP' ? 'subiendo' : 'bajando'}`);
}

// Luces
async function toggleLight(lightId) {
    const btn = document.querySelector(`[data-id="${lightId}"]`);
    const isOn = btn.classList.toggle('active');
    const cmd = `LIGHT:${lightId}:${isOn ? 'ON' : 'OFF'}`;
    await sendBLECommand(cmd);
    showToast(`${getLightName(lightId)} ${isOn ? 'encendida' : 'apagada'}`);
}

function getLightName(id) {
    const names = {
        'LOWBEAM': 'Bajas',
        'HIGHBEAM': 'Altas',
        'TURN_L': 'Direccional izquierda',
        'TURN_R': 'Direccional derecha',
        'BRAKE': 'Freno',
        'REVERSE': 'Reversa',
        'FOG': 'Antiniebla',
        'PARK': 'Parqueo'
    };
    return names[id] || id;
}

// Comandos generales
async function sendCmd(cmd, msg) {
    await sendBLECommand(cmd);
    showToast(msg);
}

// Maletero (presión larga)
let trunkPressTimer = null;
document.addEventListener('DOMContentLoaded', () => {
    const trunkBtn = document.getElementById('trunkBtn');
    if (trunkBtn) {
        trunkBtn.addEventListener('mousedown', startTrunkPress);
        trunkBtn.addEventListener('mouseup', cancelTrunkPress);
        trunkBtn.addEventListener('mouseleave', cancelTrunkPress);
        trunkBtn.addEventListener('touchstart', startTrunkPress);
        trunkBtn.addEventListener('touchend', cancelTrunkPress);
        trunkBtn.addEventListener('touchcancel', cancelTrunkPress);
    }
});

function startTrunkPress(e) {
    const label = document.getElementById('trunkBtnLabel');
    let progress = 0;
    const interval = 300; // ms
    const totalTime = 3000; // 3 segundos
    
    trunkPressTimer = setInterval(() => {
        progress += interval;
        const percent = Math.min(100, (progress / totalTime) * 100);
        label.textContent = `Manteniendo... ${Math.round(percent)}%`;
        
        if (progress >= totalTime) {
            clearInterval(trunkPressTimer);
            trunkPressTimer = null;
            label.textContent = '✅ Maletero abierto';
            sendBLECommand('TRUNK');
            showToast('🔓 Maletero abierto');
            setTimeout(() => {
                label.textContent = 'Mantén presionado 3s';
            }, 2000);
        }
    }, interval);
}

function cancelTrunkPress() {
    if (trunkPressTimer) {
        clearInterval(trunkPressTimer);
        trunkPressTimer = null;
        document.getElementById('trunkBtnLabel').textContent = 'Mantén presionado 3s';
    }
}

// Apagado remoto
function confirmStop() {
    if (confirm('⚠️ ¿Estás seguro de apagar el motor remotamente?\nEl vehículo debe estar detenido.')) {
        sendBLECommand('STOP_ENGINE');
        showToast('⏹️ Apagando motor...');
    }
}

// Vincular
async function pairPhoneSecure() {
    if (isConnected) {
        // Si estamos conectados, mostrar opciones
        const action = confirm('¿Qué deseas hacer?\n\nOK = Vincular nuevo teléfono\nCancelar = Olvidar todos los teléfonos');
        
        if (action) {
            // Vincular nuevo
            await sendBLECommand('PAIR_MODE');
            showToast('🔓 Modo vinculación abierto por 60 segundos');
        } else {
            // Olvidar todos
            if (confirm('⚠️ ¿Eliminar TODOS los teléfonos vinculados?')) {
                await sendBLECommand('FORGET_PHONES');
                showToast('🗑️ Teléfonos olvidados');
            }
        }
    } else {
        // No conectado - intentar conectar
        await connectBLE();
    }
}

// ==================== MAPA ====================
let mapInstance = null;
let mapMarker = null;

function setupMap() {
    const mapContainer = document.querySelector('.map-geo');
    if (!mapContainer) return;
    
    // Verificar si ya está inicializado
    if (mapInstance) {
        mapInstance.invalidateSize();
        return;
    }
    
    // Posición de ejemplo (Quito, Ecuador)
    const lat = -0.1807;
    const lng = -78.4678;
    
    try {
        // Crear mapa con Leaflet
        mapInstance = L.map('map', {
            center: [lat, lng],
            zoom: 15,
            zoomControl: false
        });
        
        // Tile layer de OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(mapInstance);
        
        // Marcador del vehículo
        const icon = L.divIcon({
            className: 'vehicle-marker',
            html: '🚗',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });
        
        mapMarker = L.marker([lat, lng], { icon: icon })
            .addTo(mapInstance)
            .bindPopup('📍 Tu vehículo');
        
        // Actualizar tamaño
        setTimeout(() => {
            mapInstance.invalidateSize();
        }, 500);
        
        // Control de zoom
        L.control.zoom({
            position: 'bottomright'
        }).addTo(mapInstance);
        
    } catch (error) {
        console.error('Error inicializando mapa:', error);
        // Fallback: mensaje simple
        mapContainer.innerHTML = `
            <div style="
                display:flex;
                flex-direction:column;
                align-items:center;
                justify-content:center;
                height:100%;
                color:var(--text-dim);
                gap:8px;
            ">
                <span style="font-size:48px;">🗺️</span>
                <span>Mapa no disponible</span>
                <span style="font-size:12px;">Conéctate al vehículo para ver ubicación</span>
            </div>
        `;
    }
}

// Actualizar posición del vehículo
function updateVehiclePosition(lat, lng) {
    if (mapInstance && mapMarker) {
        mapMarker.setLatLng([lat, lng]);
        mapInstance.setView([lat, lng], 15);
        mapMarker.openPopup();
    }
}

// ==================== AJUSTES ====================

// Biometría
function toggleBiometric(el) {
    const isOn = el.classList.toggle('on');
    const status = document.getElementById('bioStatusSub');
    status.textContent = isOn ? '✅ Huella/rostro activado' : 'Usa el lector de tu teléfono';
    localStorage.setItem('biometricEnabled', isOn ? 'true' : 'false');
    
    // Simular autenticación
    if (isOn) {
        showToast('🔐 Biometría activada');
        // En producción, esto usaría WebAuthn
        if (window.PublicKeyCredential) {
            // Intentar registrar huella/rostro
            registerBiometric();
        }
    }
}

async function registerBiometric() {
    try {
        // Esto es un ejemplo simplificado
        // En producción usarías WebAuthn
        showToast('📱 Escanea tu huella o rostro');
        // Simular éxito
        setTimeout(() => {
            showToast('✅ Biometría registrada', 'success');
        }, 2000);
    } catch (error) {
        console.error('Error registrando biometría:', error);
        showToast('❌ Error al registrar biometría', 'error');
    }
}

// PIN
function openPinSetup() {
    const overlay = document.getElementById('pinOverlay');
    overlay.hidden = false;
    document.getElementById('pinOverlayTitle').textContent = '🔐 Configurar PIN de respaldo';
    document.getElementById('pinOverlaySub').textContent = 'Ingresa un PIN de 4 dígitos';
    document.getElementById('pinError').textContent = '';
    
    // Limpiar dots
    document.querySelectorAll('#pinDots span').forEach(dot => dot.textContent = '');
    
    // Cambiar modo
    window._pinMode = 'setup';
    window._pinBuffer = '';
}

function openPinEntry() {
    const overlay = document.getElementById('pinOverlay');
    overlay.hidden = false;
    document.getElementById('pinOverlayTitle').textContent = '🔐 Ingresa tu PIN';
    document.getElementById('pinOverlaySub').textContent = 'Por seguridad, confirma con tu PIN';
    document.getElementById('pinError').textContent = '';
    
    document.querySelectorAll('#pinDots span').forEach(dot => dot.textContent = '');
    window._pinMode = 'unlock';
    window._pinBuffer = '';
}

// Proximidad
function toggleProximity(el) {
    const isOn = el.classList.toggle('on');
    const card = document.getElementById('proximityLiveCard');
    card.style.display = isOn ? 'block' : 'none';
    localStorage.setItem('proximityEnabled', isOn ? 'true' : 'false');
    
    if (isOn) {
        showToast('📡 Proximidad activada');
        startProximityMonitoring();
    } else {
        showToast('📡 Proximidad desactivada');
        stopProximityMonitoring();
    }
}

let proximityInterval = null;

function startProximityMonitoring() {
    if (proximityInterval) return;
    
    // Simular señal RSSI
    let rssi = -65;
    proximityInterval = setInterval(() => {
        // Variar aleatoriamente
        rssi += (Math.random() - 0.5) * 10;
        rssi = Math.max(-95, Math.min(-45, rssi));
        
        const label = document.getElementById('proximityRssiLabel');
        if (label) {
            label.textContent = `${Math.round(rssi)} dBm`;
        }
        
        // Actualizar barra de sensibilidad
        const slider = document.getElementById('proximitySlider');
        if (slider) {
            const value = parseInt(slider.value);
            // Simular distancia basada en RSSI
            const distance = Math.max(1, Math.min(5, 6 - (rssi + 45) / 10));
            slider.value = Math.round(distance);
            document.getElementById('proximityValLabel').textContent = getProximityLabel(Math.round(distance));
        }
    }, 2000);
}

function stopProximityMonitoring() {
    if (proximityInterval) {
        clearInterval(proximityInterval);
        proximityInterval = null;
    }
}

function getProximityLabel(value) {
    const labels = ['Muy cerca', 'Cerca', 'Media', 'Lejos', 'Muy lejos'];
    return labels[Math.min(4, Math.max(0, value - 1))];
}

// Sonido
function toggleSound(el) {
    const isOn = el.classList.toggle('on');
    localStorage.setItem('soundEnabled', isOn ? 'true' : 'false');
    
    if (isOn) {
        playSound('confirm');
        showToast('🔊 Sonidos activados');
    } else {
        showToast('🔇 Sonidos desactivados');
    }
}

function playSound(type) {
    const enabled = localStorage.getItem('soundEnabled') !== 'false';
    if (!enabled) return;
    
    try {
        const audio = new Audio();
        if (type === 'confirm') {
            audio.src = 'data:audio/wav;base64,UklGRnoAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoAAACBhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqF';
        } else {
            audio.src = 'data:audio/wav;base64,UklGRoYAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ4AAACBhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqFhYqF';
        }
        audio.volume = 0.3;
        audio.play().catch(() => {});
    } catch (e) {}
}

// ==================== TOAST ====================
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = 'toast';
    
    if (type === 'error') {
        toast.classList.add('error');
    } else if (type === 'success') {
        toast.classList.add('success');
    } else if (type === 'warning') {
        toast.classList.add('warning');
    }
    
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// ==================== SETTINGS ====================
function loadSettings() {
    // Biometría
    const bioEnabled = localStorage.getItem('biometricEnabled') === 'true';
    const bioSwitch = document.getElementById('switchBiometric');
    if (bioSwitch) {
        if (bioEnabled) bioSwitch.classList.add('on');
        const status = document.getElementById('bioStatusSub');
        if (status) {
            status.textContent = bioEnabled ? '✅ Huella/rostro activado' : 'Usa el lector de tu teléfono';
        }
    }
    
    // Proximidad
    const proxEnabled = localStorage.getItem('proximityEnabled') === 'true';
    const proxSwitch = document.getElementById('switchProximity');
    if (proxSwitch) {
        if (proxEnabled) proxSwitch.classList.add('on');
        const card = document.getElementById('proximityLiveCard');
        if (card) {
            card.style.display = proxEnabled ? 'block' : 'none';
        }
    }
    
    // Sonido
    const soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
    const soundSwitch = document.getElementById('switchSound');
    if (soundSwitch) {
        if (soundEnabled) soundSwitch.classList.add('on');
    }
    
    // PIN status
    const pinHash = localStorage.getItem('pinHash');
    const pinStatus = document.getElementById('pinStatusSub');
    if (pinStatus) {
        pinStatus.textContent = pinHash ? '✅ PIN configurado' : 'No configurado';
    }
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Botón central (escudo)
    document.getElementById('shieldBtn')?.addEventListener('click', toggleArm);
    
    // Botón de conexión
    document.getElementById('keyLinkCard')?.addEventListener('click', () => {
        if (isConnected) {
            // Mostrar información de conexión
            showToast(`✅ Conectado a ${bleDevice?.name || 'Centinela'}`, 'success');
        } else {
            connectBLE();
        }
    });
}

// ==================== EXPORT ====================
// Exponer funciones globalmente
window.toggleArm = toggleArm;
window.setLock = setLock;
window.moveWindow = moveWindow;
window.toggleLight = toggleLight;
window.sendCmd = sendCmd;
window.confirmStop = confirmStop;
window.pairPhoneSecure = pairPhoneSecure;
window.toggleBiometric = toggleBiometric;
window.openPinSetup = openPinSetup;
window.openPinEntry = openPinEntry;
window.toggleProximity = toggleProximity;
window.toggleSound = toggleSound;
window.connectBLE = connectBLE;
window.sendBLECommand = sendBLECommand;
window.showToast = showToast;
window.navigateTo = navigateTo;

console.log('✅ Centinela PWA lista');
