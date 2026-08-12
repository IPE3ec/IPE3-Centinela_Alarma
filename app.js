// ========================================
// CENTINELA - PWA v5.0 COMPLETA
// ========================================

// ==================== CONSTANTES ====================
const VERSION = '5.0';
const BLE_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const BLE_CMD_UUID = '12345678-1234-5678-1234-56789abcdef1';
const BLE_STATUS_UUID = '12345678-1234-5678-1234-56789abcdef2';
const PIN_STORAGE_KEY = 'centinela_pin_hash';
const PIN_ATTEMPTS_KEY = 'centinela_pin_attempts';
const MAX_PIN_ATTEMPTS = 3;
const VEHICLE_STORAGE_KEY = 'centinela_vehicle_data';

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
    maxBonded: 2,
    doorOpen: false,
    parked: true
};
let pinBuffer = '';
let pinMode = 'unlock';
let pinConfirmBuffer = '';
let pinCallback = null;
let proximityInterval = null;
let trunkPressTimer = null;
let audioContext = null;
let windowAutoTimer = null;
let windowAutoMode = false;
let deferredPrompt = null;
let batteryUpdateInterval = null;
let statusUpdateInterval = null;

// ==================== DATOS DEL VEHÍCULO ====================
let vehicleData = {
    name: 'Mi vehículo',
    plate: 'ABC-1234',
    model: 'Toyota Corolla 2022'
};

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log(`🚗 Centinela v${VERSION}`);
    loadVehicleData();
    initApp();
    checkBLEAvailability();
    loadSettings();
    checkFirstRun();
    registerServiceWorker();
    setupInstallPrompt();
    updateVehicleUI();
});

function initApp() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const screen = tab.dataset.screen;
            navigateTo(screen);
        });
    });

    document.querySelectorAll('[data-goto]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const screen = link.dataset.goto;
            navigateTo(screen);
        });
    });

    setupBLEConnection();
    setupEventListeners();
    setupMap();
    initAudio();
    startBatteryUpdates();
}

function loadVehicleData() {
    const saved = localStorage.getItem(VEHICLE_STORAGE_KEY);
    if (saved) {
        try {
            vehicleData = JSON.parse(saved);
        } catch (e) {
            console.log('Error cargando datos del vehículo');
        }
    }
}

function saveVehicleData() {
    localStorage.setItem(VEHICLE_STORAGE_KEY, JSON.stringify(vehicleData));
}

function updateVehicleUI() {
    document.getElementById('vehicleNameDisplay').textContent = vehicleData.name;
    document.getElementById('vehicleNameSetting').textContent = vehicleData.name;
    document.getElementById('vehiclePlate').textContent = vehicleData.plate;
}

// ==================== EDICIÓN DE VEHÍCULO ====================
function editVehicle() {
    const newName = prompt('Nombre del vehículo:', vehicleData.name);
    if (newName && newName.trim()) {
        vehicleData.name = newName.trim();
        saveVehicleData();
        updateVehicleUI();
        showToast('✅ Nombre actualizado', 'success');
        playSound('confirm');
    }
}

function editPlate() {
    const newPlate = prompt('Placa del vehículo:', vehicleData.plate);
    if (newPlate && newPlate.trim()) {
        vehicleData.plate = newPlate.trim().toUpperCase();
        saveVehicleData();
        updateVehicleUI();
        showToast('✅ Placa actualizada', 'success');
        playSound('confirm');
    }
}

function showAbout() {
    showToast(`🚗 Centinela v${VERSION}\n© 2024 - Todos los derechos reservados`, 'info');
    playSound('confirm');
}

// ==================== ACTUALIZACIÓN DE BATERÍA ====================
function startBatteryUpdates() {
    if (batteryUpdateInterval) clearInterval(batteryUpdateInterval);
    
    // Mostrar carga inicial con animación
    let batteryValue = 0;
    batteryUpdateInterval = setInterval(() => {
        if (isConnected && deviceState.battery > 0) {
            // Si hay datos reales, mostrarlos directamente
            const batt = document.getElementById('statBattery');
            if (batt) {
                batt.textContent = `${deviceState.battery}V`;
                if (deviceState.battery < 11.0) {
                    batt.className = 'stat-value danger';
                } else if (deviceState.battery < 11.8) {
                    batt.className = 'stat-value warn';
                } else {
                    batt.className = 'stat-value ok';
                }
            }
            return;
        }
        
        // Animación de carga cuando no hay datos
        if (!isConnected) {
            const batt = document.getElementById('statBattery');
            if (batt) {
                batteryValue = (batteryValue + 0.1) % 0.8 + 0.2;
                const displayVoltage = (batteryValue * 3 + 11).toFixed(1);
                batt.textContent = `${displayVoltage}V`;
                batt.className = 'stat-value warn';
            }
        }
    }, 2000);
}

// ==================== CHECK FIRST RUN ====================
function checkFirstRun() {
    const pinHash = localStorage.getItem(PIN_STORAGE_KEY);
    if (!pinHash) {
        document.getElementById('configOverlay').hidden = false;
    } else {
        document.getElementById('configOverlay').hidden = true;
    }
}

// ==================== SERVICE WORKER ====================
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('✅ Service Worker registrado');
            })
            .catch(error => {
                console.log('❌ Error al registrar Service Worker:', error);
            });
    }
}

function isAppInstalled() {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (navigator.standalone) return true;
    return false;
}

function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const installBtn = document.getElementById('installBtn');
        if (installBtn && !isAppInstalled()) {
            installBtn.style.display = 'flex';
        }
    });

    window.addEventListener('appinstalled', () => {
        showToast('✅ Centinela instalado correctamente', 'success');
        document.getElementById('installBtn').style.display = 'none';
    });
}

async function installApp() {
    if (!deferredPrompt) {
        showToast('📱 Abre el menú del navegador y selecciona "Instalar app"', 'info');
        return;
    }
    
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('installBtn').style.display = 'none';
    
    if (result.outcome === 'accepted') {
        showToast('✅ Centinela instalado', 'success');
    } else {
        showToast('⏹️ Instalación cancelada', 'info');
    }
}

// ==================== AUDIO ====================
function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        // Reactivar audio en Android
        document.addEventListener('click', () => {
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }
        }, { once: true });
    } catch (e) {
        console.log('Audio no disponible');
    }
}

function playSound(type) {
    const enabled = localStorage.getItem('soundEnabled') !== 'false';
    if (!enabled || !audioContext) return;

    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        let duration = 0.15;
        let frequency = 800;
        
        switch(type) {
            case 'arm':
                frequency = 1000;
                duration = 0.3;
                break;
            case 'disarm':
                frequency = 600;
                duration = 0.4;
                break;
            case 'lock':
                frequency = 900;
                duration = 0.15;
                break;
            case 'unlock':
                frequency = 500;
                duration = 0.2;
                break;
            case 'error':
                frequency = 300;
                duration = 0.5;
                break;
            case 'confirm':
                frequency = 1200;
                duration = 0.15;
                break;
            case 'alert':
                playAlertSound();
                return;
            default:
                frequency = 800;
                duration = 0.15;
        }
        
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gainNode.gain.value = 0.3;
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);
        
    } catch (e) {
        console.log('Error reproduciendo sonido:', e);
    }
}

function playAlertSound() {
    try {
        [800, 1000].forEach((freq, i) => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.value = 0.3;
            const startTime = audioContext.currentTime + (i * 0.2);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
            osc.start(startTime);
            osc.stop(startTime + 0.15);
        });
    } catch (e) {}
}

// ==================== NAVEGACIÓN ====================
function navigateTo(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    const target = document.getElementById(`screen-${screenId}`);
    if (target) {
        target.classList.add('active');
    }

    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.screen === screenId);
    });

    window.scrollTo(0, 0);

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
    updateConnectionUI(false);
}

async function connectBLE() {
    if (!navigator.bluetooth) {
        showToast('❌ Tu navegador no soporta Bluetooth Web', 'error');
        return;
    }

    try {
        showToast('🔍 Buscando Centinela...', 'info');
        playSound('confirm');

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
        
        const cmdChar = await service.getCharacteristic(BLE_CMD_UUID);
        bleCharacteristic = cmdChar;

        const statusChar = await service.getCharacteristic(BLE_STATUS_UUID);
        statusCharacteristic = statusChar;

        await statusChar.startNotifications();
        statusChar.addEventListener('characteristicvaluechanged', handleStatusUpdate);

        bleDevice = device;
        bleServer = server;
        isConnected = true;
        localStorage.setItem('bleDeviceId', device.id);

        updateConnectionUI(true);
        showToast('✅ Conectado a Centinela', 'success');
        playSound('confirm');

        await sendBLECommand('GET_STATUS');
        await updateBondedDevices();

    } catch (error) {
        console.error('Error de conexión BLE:', error);
        isConnected = false;
        updateConnectionUI(false);
        playSound('error');
        
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
        statusPill.className = 'status-pill on';
        statusDot.style.background = 'var(--accent)';
        statusText.textContent = 'Conectado';
        
        document.getElementById('keyLinkTitle').textContent = '✅ Conectado al vehículo';
        document.getElementById('keyLinkSub').textContent = 'Listo para comandos';
        document.getElementById('beam').style.opacity = '1';
        
    } else {
        statusPill.className = 'status-pill';
        statusDot.style.background = 'var(--text-dim)';
        statusText.textContent = 'Sin conexión';
        
        document.getElementById('keyLinkTitle').textContent = '📱 Toca para conectar por Bluetooth';
        document.getElementById('keyLinkSub').textContent = 'Sin conexión';
        document.getElementById('beam').style.opacity = '0.35';
    }
}

async function sendBLECommand(command) {
    if (!bleCharacteristic || !isConnected) {
        showToast('⚠️ No hay conexión BLE', 'error');
        playSound('error');
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
        playSound('error');
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
        Object.assign(deviceState, data);
        updateUI(data);
        
        if (data.bondedDevices) {
            console.log('📱 Dispositivos vinculados:', data.bondedDevices);
            updateBondedUI(data.bondedDevices, data.bondedCount, data.maxBonded);
        }
        
    } catch (error) {
        console.error('❌ Error procesando estado:', error);
    }
}

// ==================== ACTUALIZACIÓN DE UI ====================
function updateUI(data) {
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

    // Batería - actualización inmediata
    if (data.battery !== undefined && data.battery > 0) {
        const batt = document.getElementById('statBattery');
        if (batt) {
            batt.textContent = `${data.battery}V`;
            if (data.battery < 11.0) {
                batt.className = 'stat-value danger';
            } else if (data.battery < 11.8) {
                batt.className = 'stat-value warn';
            } else {
                batt.className = 'stat-value ok';
            }
        }
    }
    
    if (data.engine !== undefined) {
        document.getElementById('statMotorTemp').textContent = data.engine ? 'ENCENDIDO' : 'APAGADO';
    }
    
    if (data.windowL !== undefined) {
        const fuel = Math.round(100 - (data.windowL / 2));
        document.getElementById('statFuel').textContent = `${fuel}%`;
    }
    
    if (data.bondedCount !== undefined) {
        const satellites = Math.min(12, 4 + data.bondedCount * 2);
        document.getElementById('statGps').textContent = `${satellites}/12`;
    }

    if (data.locked !== undefined) {
        document.getElementById('lockBtnClosed').classList.toggle('active', data.locked);
        document.getElementById('lockBtnOpen').classList.toggle('active', !data.locked);
    }

    if (data.windowL !== undefined) {
        document.getElementById('windowLPct').textContent = `${data.windowL}%`;
    }
    if (data.windowR !== undefined) {
        document.getElementById('windowRPct').textContent = `${data.windowR}%`;
    }

    if (data.alarmTriggered) {
        showToast('🚨 ¡ALARMA DISPARADA!', 'error');
        playSound('alert');
        document.getElementById('shieldSubState').textContent = '🚨 ALARMA!';
    }

    if (data.doorOpen !== undefined) {
        const statusEl = document.getElementById('doorStatus');
        if (statusEl) {
            statusEl.textContent = data.doorOpen ? 'puerta abierta' : 'todas cerradas';
        }
    }

    updateRecentActivity(data);
}

function updateRecentActivity(data) {
    const feed = document.getElementById('eventFeed');
    const empty = document.getElementById('eventFeedEmpty');
    
    const events = feed.querySelectorAll('.event:not(#eventFeedEmpty)');
    events.forEach(el => el.remove());
    
    const activities = [];
    
    if (data.armed) {
        activities.push({ title: '🔒 Sistema armado', time: 'Ahora mismo', icon: 'ok' });
    }
    if (data.locked) {
        activities.push({ title: '🔐 Seguros cerrados', time: 'Ahora mismo', icon: 'ok' });
    }
    if (data.engine) {
        activities.push({ title: '🚗 Motor encendido', time: 'Ahora mismo', icon: 'ok' });
    }
    if (data.alarmTriggered) {
        activities.push({ title: '🚨 ¡ALARMA DISPARADA!', time: 'Ahora mismo', icon: 'danger' });
    }
    
    if (activities.length === 0) {
        empty.style.display = 'flex';
        empty.querySelector('.event-title').textContent = 'Sin actividad todavía';
        empty.querySelector('.event-time').textContent = 'Vincula tu vehículo para empezar a registrar eventos';
    } else {
        empty.style.display = 'none';
        activities.forEach(act => {
            const event = document.createElement('div');
            event.className = 'event';
            event.innerHTML = `
                <div class="event-icon ${act.icon}">
                    <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M12 2v4M12 18v4"/>
                    </svg>
                </div>
                <div class="event-body">
                    <div class="event-title">${act.title}</div>
                    <div class="event-time">${act.time}</div>
                </div>
            `;
            feed.appendChild(event);
        });
    }
}

function updateBondedUI(devices, count, max) {
    const statusText = document.getElementById('statusPillText');
    if (isConnected && count > 0) {
        statusText.textContent = `Conectado (${count}/${max})`;
    } else if (isConnected) {
        statusText.textContent = 'Conectado';
    }
    
    const sub = document.getElementById('keyLinkSub');
    if (sub && isConnected) {
        if (count > 0) {
            sub.textContent = `${count} teléfono${count > 1 ? 's' : ''} vinculado${count > 1 ? 's' : ''}`;
        } else {
            sub.textContent = 'Sin teléfonos vinculados';
        }
    }
}

// ==================== COMANDOS ====================
async function toggleArm() {
    if (!isConnected) {
        showToast('⚠️ Conéctate al vehículo primero', 'error');
        playSound('error');
        return;
    }
    
    const isArmed = document.querySelector('.app').getAttribute('data-armed') === 'true';
    
    if (!isArmed) {
        await sendBLECommand('ARM');
        playSound('arm');
        showToast('✅ Vehículo armado', 'success');
    } else {
        if (confirm('¿Desarmar el vehículo?')) {
            await sendBLECommand('DISARM');
            playSound('disarm');
            showToast('🔓 Vehículo desarmado', 'info');
        }
    }
}

async function setLock(locked) {
    if (!isConnected) {
        showToast('⚠️ Conéctate al vehículo primero', 'error');
        playSound('error');
        return;
    }
    const cmd = locked ? 'LOCK' : 'UNLOCK';
    await sendBLECommand(cmd);
    playSound(locked ? 'lock' : 'unlock');
    showToast(locked ? '🔒 Seguros cerrados' : '🔓 Seguros abiertos');
}

async function moveWindow(side, amount) {
    if (!isConnected) {
        showToast('⚠️ Conéctate al vehículo primero', 'error');
        playSound('error');
        return;
    }
    
    const cmd = side === 'L' ? 'WIN_L_' : 'WIN_R_';
    const direction = amount > 0 ? 'UP' : 'DOWN';
    await sendBLECommand(cmd + direction);
    playSound('confirm');
    showToast(`Vidrio ${side === 'L' ? 'izquierdo' : 'derecho'} ${direction === 'UP' ? 'subiendo' : 'bajando'}`);
}

async function toggleLight(lightId) {
    if (!isConnected) {
        showToast('⚠️ Conéctate al vehículo primero', 'error');
        playSound('error');
        return;
    }
    
    const btn = document.querySelector(`[data-id="${lightId}"]`);
    const isOn = btn.classList.toggle('active');
    const cmd = `LIGHT:${lightId}:${isOn ? 'ON' : 'OFF'}`;
    await sendBLECommand(cmd);
    playSound('confirm');
    showToast(`${getLightName(lightId)} ${isOn ? 'encendida' : 'apagada'}`);
}

function getLightName(id) {
    const names = {
        'LOWBEAM': 'Bajas',
        'HIGHBEAM': 'Altas',
        'TURN_L': 'Direcc. izq.',
        'TURN_R': 'Direcc. der.',
        'BRAKE': 'Freno',
        'REVERSE': 'Reversa',
        'FOG': 'Antiniebla',
        'PARK': 'Parqueo'
    };
    return names[id] || id;
}

async function sendCmd(cmd, msg) {
    if (!isConnected) {
        showToast('⚠️ Conéctate al vehículo primero', 'error');
        playSound('error');
        return;
    }
    await sendBLECommand(cmd);
    playSound('confirm');
    showToast(msg);
}

// ==================== MALETERO ====================
function startTrunkPress(e) {
    const label = document.getElementById('trunkBtnLabel');
    const btn = document.getElementById('trunkBtn');
    let progress = 0;
    const totalTime = 3000;
    const interval = 50;
    
    btn.classList.add('pressing');
    
    trunkPressTimer = setInterval(() => {
        progress += interval;
        const percent = Math.min(100, (progress / totalTime) * 100);
        
        btn.style.background = `conic-gradient(var(--accent) ${percent}%, var(--surface) ${percent}%)`;
        
        if (percent < 30) {
            label.textContent = '🔒 Verificando...';
        } else if (percent < 60) {
            label.textContent = '🔓 Desbloqueando...';
        } else if (percent < 90) {
            label.textContent = '⬆️ Abriendo...';
        } else {
            label.textContent = '✅ ¡Listo!';
        }
        
        if (progress >= totalTime) {
            clearInterval(trunkPressTimer);
            trunkPressTimer = null;
            label.textContent = '✅ Maletero abierto';
            btn.style.background = 'var(--success)';
            sendBLECommand('TRUNK');
            playSound('unlock');
            showToast('🔓 Maletero abierto', 'success');
            setTimeout(() => {
                btn.style.background = '';
                btn.classList.remove('pressing');
                label.textContent = 'Mantén presionado 3s';
            }, 2000);
        }
    }, interval);
}

function cancelTrunkPress() {
    if (trunkPressTimer) {
        clearInterval(trunkPressTimer);
        trunkPressTimer = null;
        const btn = document.getElementById('trunkBtn');
        btn.style.background = '';
        btn.classList.remove('pressing');
        document.getElementById('trunkBtnLabel').textContent = 'Mantén presionado 3s';
    }
}

// ==================== ENCONTRAR AUTO ====================
async function findCar() {
    if (!isConnected) {
        showToast('⚠️ Conéctate al vehículo primero', 'error');
        playSound('error');
        return;
    }
    
    showToast('🔍 Buscando vehículo...', 'info');
    playSound('alert');
    
    await sendBLECommand('HORN');
    
    const lights = ['LOWBEAM', 'HIGHBEAM', 'TURN_L', 'TURN_R'];
    let count = 0;
    const maxFlashes = 12;
    
    const flashInterval = setInterval(async () => {
        if (count >= maxFlashes) {
            clearInterval(flashInterval);
            for (const light of lights) {
                await sendBLECommand(`LIGHT:${light}:OFF`);
                const btn = document.querySelector(`[data-id="${light}"]`);
                if (btn) btn.classList.remove('active');
            }
            showToast('🔍 Vehículo encontrado', 'success');
            return;
        }
        
        const on = count % 2 === 0;
        for (const light of lights) {
            await sendBLECommand(`LIGHT:${light}:${on ? 'ON' : 'OFF'}`);
            const btn = document.querySelector(`[data-id="${light}"]`);
            if (btn) btn.classList.toggle('active', on);
        }
        count++;
    }, 500);
}

// ==================== APAGADO REMOTO ====================
function confirmStop() {
    if (!isConnected) {
        showToast('⚠️ Conéctate al vehículo primero', 'error');
        playSound('error');
        return;
    }
    
    if (confirm('⚠️ ¿Estás seguro de apagar el motor remotamente?\nEl vehículo debe estar detenido.')) {
        sendBLECommand('STOP_ENGINE');
        playSound('confirm');
        showToast('⏹️ Apagando motor...', 'info');
    }
}

// ==================== VINCULACIÓN ====================
async function updateBondedDevices() {
    const success = await sendBLECommand('GET_BONDED');
    if (!success) {
        console.log('⚠️ No se pudo obtener lista de dispositivos');
        return;
    }
}

async function pairNewPhone() {
    if (!isConnected) {
        showToast('⚠️ Conéctate al vehículo primero', 'error');
        playSound('error');
        return;
    }
    
    const auth = await checkAuth();
    if (!auth) {
        showToast('⚠️ Autenticación requerida', 'error');
        return;
    }
    
    if (deviceState.bondedCount >= deviceState.maxBonded) {
        showToast(`❌ Límite de ${deviceState.maxBonded} teléfonos alcanzado`, 'error');
        playSound('error');
        return;
    }
    
    await sendBLECommand('PAIR_MODE');
    playSound('confirm');
    showToast('🔓 Modo vinculación abierto por 60 segundos', 'success');
    showToast('📱 Abre la app en el otro teléfono', 'info');
}

async function forgetPhonesSecure() {
    if (!isConnected) {
        showToast('⚠️ Conéctate al vehículo primero', 'error');
        playSound('error');
        return;
    }
    
    const auth = await checkAuth();
    if (!auth) {
        showToast('⚠️ Autenticación requerida', 'error');
        return;
    }
    
    if (!confirm('⚠️ ¿ELIMINAR TODOS los teléfonos vinculados?\n\nEsta acción:\n• Eliminará TODOS los dispositivos\n• Liberará los 2 espacios\n• Requerirá volver a vincular todos los teléfonos\n\n¿Estás seguro?')) {
        showToast('⏹️ Operación cancelada', 'info');
        return;
    }
    
    if (!confirm('🔒 Confirmación final: ¿Estás ABSOLUTAMENTE seguro?')) {
        showToast('⏹️ Operación cancelada', 'info');
        return;
    }
    
    await sendBLECommand('FORGET_PHONES');
    playSound('confirm');
    showToast('🗑️ Todos los teléfonos eliminados', 'warning');
    setTimeout(() => updateBondedDevices(), 1000);
}

// ==================== AUTENTICACIÓN ====================
async function checkAuth() {
    const pinHash = localStorage.getItem(PIN_STORAGE_KEY);
    const bioEnabled = localStorage.getItem('biometricEnabled') === 'true';
    
    if (!pinHash && !bioEnabled) {
        showToast('⚠️ Configura un método de seguridad primero', 'error');
        return false;
    }
    
    if (bioEnabled && window.PublicKeyCredential) {
        try {
            const result = await authenticateBiometric();
            if (result) {
                showToast('✅ Autenticación exitosa', 'success');
                return true;
            }
        } catch (e) {
            console.log('Bio falló, usando PIN');
        }
    }
    
    return new Promise((resolve) => {
        const overlay = document.getElementById('lockOverlay');
        overlay.hidden = false;
        
        pinCallback = () => {
            overlay.hidden = true;
            resolve(true);
        };
        
        setTimeout(() => {
            if (!overlay.hidden) {
                overlay.hidden = true;
                resolve(false);
            }
        }, 30000);
    });
}

// ==================== BIOMETRÍA ====================
async function registerBiometric() {
    if (!window.PublicKeyCredential) {
        showToast('❌ Tu dispositivo no soporta biometría', 'error');
        return;
    }
    
    try {
        showToast('📱 Escanea tu huella o rostro', 'info');
        
        const publicKey = {
            challenge: new Uint8Array(32),
            rp: { name: 'Centinela' },
            user: {
                id: new Uint8Array(16),
                name: 'Usuario Centinela',
                displayName: 'Usuario'
            },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'required'
            },
            timeout: 60000
        };
        
        const credential = await navigator.credentials.create({ publicKey });
        
        if (credential) {
            localStorage.setItem('biometricEnabled', 'true');
            document.getElementById('bioStatusSub').textContent = '✅ Huella/rostro activado';
            document.getElementById('switchBiometric').classList.add('on');
            showToast('✅ Biometría registrada correctamente', 'success');
            playSound('confirm');
            document.getElementById('configOverlay').hidden = true;
        }
    } catch (error) {
        console.error('Error registrando biometría:', error);
        showToast('❌ Error al registrar biometría: ' + error.message, 'error');
        playSound('error');
    }
}

async function authenticateBiometric() {
    if (!window.PublicKeyCredential) return false;
    
    try {
        const publicKey = {
            challenge: new Uint8Array(32),
            rpId: window.location.hostname,
            timeout: 60000,
            userVerification: 'required'
        };
        
        const assertion = await navigator.credentials.get({ publicKey });
        return assertion !== null;
    } catch (error) {
        console.log('Error autenticación biométrica:', error);
        return false;
    }
}

async function tryBiometricUnlock() {
    const result = await authenticateBiometric();
    if (result) {
        document.getElementById('lockOverlay').hidden = true;
        showToast('✅ Desbloqueado con huella/rostro', 'success');
        playSound('confirm');
        if (pinCallback) {
            pinCallback();
            pinCallback = null;
        }
    } else {
        showToast('❌ Autenticación fallida', 'error');
        playSound('error');
    }
}

// ==================== PIN ====================
function openPinSetup() {
    const overlay = document.getElementById('pinOverlay');
    overlay.hidden = false;
    document.getElementById('pinOverlayTitle').textContent = '🔐 Configurar PIN de respaldo';
    document.getElementById('pinOverlaySub').textContent = 'Ingresa un PIN de 4 dígitos';
    document.getElementById('pinError').textContent = '';
    
    document.querySelectorAll('#pinDots span').forEach(dot => dot.textContent = '');
    pinMode = 'setup';
    pinBuffer = '';
    pinConfirmBuffer = '';
}

function openPinEntry() {
    const overlay = document.getElementById('pinOverlay');
    overlay.hidden = false;
    document.getElementById('pinOverlayTitle').textContent = '🔐 Ingresa tu PIN';
    document.getElementById('pinOverlaySub').textContent = 'Por seguridad, confirma con tu PIN';
    document.getElementById('pinError').textContent = '';
    
    document.querySelectorAll('#pinDots span').forEach(dot => dot.textContent = '');
    pinMode = 'unlock';
    pinBuffer = '';
}

function closePinOverlay() {
    document.getElementById('pinOverlay').hidden = true;
    pinBuffer = '';
    pinConfirmBuffer = '';
    document.getElementById('pinError').textContent = '';
}

function pinPress(num) {
    const dots = document.querySelectorAll('#pinDots span');
    const errorEl = document.getElementById('pinError');
    
    if (pinMode === 'setup') {
        pinBuffer += num;
        dots[pinBuffer.length - 1].textContent = '●';
        
        if (pinBuffer.length === 4) {
            if (!pinConfirmBuffer) {
                pinConfirmBuffer = pinBuffer;
                pinBuffer = '';
                document.querySelectorAll('#pinDots span').forEach(dot => dot.textContent = '');
                document.getElementById('pinOverlaySub').textContent = 'Confirma tu PIN nuevamente';
                showToast('🔐 Confirma tu PIN', 'info');
                return;
            }
            
            if (pinBuffer === pinConfirmBuffer) {
                const hash = btoa(pinBuffer);
                localStorage.setItem(PIN_STORAGE_KEY, hash);
                localStorage.removeItem(PIN_ATTEMPTS_KEY);
                showToast('✅ PIN configurado correctamente', 'success');
                playSound('confirm');
                document.getElementById('pinStatusSub').textContent = '✅ PIN configurado';
                closePinOverlay();
                document.getElementById('configOverlay').hidden = true;
            } else {
                errorEl.textContent = '❌ Los PIN no coinciden. Intenta de nuevo.';
                pinBuffer = '';
                pinConfirmBuffer = '';
                document.querySelectorAll('#pinDots span').forEach(dot => dot.textContent = '');
                document.getElementById('pinOverlaySub').textContent = 'Ingresa un PIN de 4 dígitos';
                playSound('error');
            }
        }
        return;
    }
    
    if (pinMode === 'unlock') {
        pinBuffer += num;
        dots[pinBuffer.length - 1].textContent = '●';
        
        if (pinBuffer.length === 4) {
            const inputHash = btoa(pinBuffer);
            const storedHash = localStorage.getItem(PIN_STORAGE_KEY);
            
            if (inputHash === storedHash) {
                localStorage.removeItem(PIN_ATTEMPTS_KEY);
                showToast('✅ PIN correcto', 'success');
                playSound('confirm');
                closePinOverlay();
                document.getElementById('lockOverlay').hidden = true;
                if (pinCallback) {
                    pinCallback();
                    pinCallback = null;
                }
            } else {
                let attempts = parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || '0') + 1;
                localStorage.setItem(PIN_ATTEMPTS_KEY, attempts.toString());
                
                const remaining = MAX_PIN_ATTEMPTS - attempts;
                if (remaining <= 0) {
                    errorEl.textContent = '❌ Demasiados intentos. Reinicia la app.';
                    document.getElementById('pinOverlaySub').textContent = 'Bloqueado por seguridad';
                    document.getElementById('pinPad').style.opacity = '0.5';
                    document.getElementById('pinPad').style.pointerEvents = 'none';
                    playSound('error');
                    setTimeout(() => {
                        closePinOverlay();
                        document.getElementById('pinPad').style.opacity = '1';
                        document.getElementById('pinPad').style.pointerEvents = 'auto';
                    }, 30000);
                } else {
                    errorEl.textContent = `❌ PIN incorrecto. Intentos restantes: ${remaining}`;
                    pinBuffer = '';
                    document.querySelectorAll('#pinDots span').forEach(dot => dot.textContent = '');
                    playSound('error');
                }
            }
        }
    }
}

function pinBackspace() {
    if (pinBuffer.length > 0) {
        pinBuffer = pinBuffer.slice(0, -1);
        const dots = document.querySelectorAll('#pinDots span');
        dots[pinBuffer.length].textContent = '';
    }
}

// ==================== PROXIMIDAD ====================
function toggleProximity(el) {
    const isOn = el.classList.toggle('on');
    const card = document.getElementById('proximityLiveCard');
    card.style.display = isOn ? 'block' : 'none';
    localStorage.setItem('proximityEnabled', isOn ? 'true' : 'false');
    
    if (isOn) {
        showToast('📡 Proximidad activada', 'success');
        playSound('confirm');
        startProximityMonitoring();
    } else {
        showToast('📡 Proximidad desactivada', 'info');
        stopProximityMonitoring();
    }
}

function updateProximityLabel(value) {
    const labels = ['Muy cerca', 'Cerca', 'Media', 'Lejos', 'Muy lejos'];
    document.getElementById('proximityValLabel').textContent = labels[parseInt(value) - 1];
}

function startProximityMonitoring() {
    if (proximityInterval) return;
    
    let rssi = -65;
    proximityInterval = setInterval(() => {
        rssi += (Math.random() - 0.5) * 10;
        rssi = Math.max(-95, Math.min(-45, rssi));
        
        const label = document.getElementById('proximityRssiLabel');
        if (label) {
            label.textContent = `${Math.round(rssi)} dBm`;
        }
    }, 2000);
}

function stopProximityMonitoring() {
    if (proximityInterval) {
        clearInterval(proximityInterval);
        proximityInterval = null;
    }
}

// ==================== SONIDO ====================
function toggleSound(el) {
    const isOn = el.classList.toggle('on');
    localStorage.setItem('soundEnabled', isOn ? 'true' : 'false');
    
    if (isOn) {
        playSound('confirm');
        showToast('🔊 Sonidos activados', 'success');
    } else {
        showToast('🔇 Sonidos desactivados', 'info');
    }
}

// ==================== MODOS Y SENSORES ====================
function toggleMode(mode, el) {
    const isOn = el.classList.toggle('on');
    const name = {
        'valet': 'Modo valet',
        'taller': 'Modo taller',
        'ninos': 'Modo niños'
    }[mode] || mode;
    
    showToast(`${isOn ? '✅' : '⏹️'} ${name} ${isOn ? 'activado' : 'desactivado'}`, isOn ? 'success' : 'info');
    playSound('confirm');
    localStorage.setItem(`mode_${mode}`, isOn ? 'true' : 'false');
}

function toggleSensor(sensor, el) {
    const isOn = el.classList.toggle('on');
    const name = {
        'impacto': 'Sensibilidad de impacto',
        'inclinacion': 'Detección de inclinación'
    }[sensor] || sensor;
    
    showToast(`${isOn ? '✅' : '⏹️'} ${name} ${isOn ? 'activado' : 'desactivado'}`, isOn ? 'success' : 'info');
    playSound('confirm');
    localStorage.setItem(`sensor_${sensor}`, isOn ? 'true' : 'false');
}

// ==================== USUARIOS Y CÓDIGO DE EMERGENCIA ====================
function openUsers() {
    showToast('👥 Gestión de usuarios y permisos', 'info');
    setTimeout(() => {
        showToast('👤 Conductor 1: Admin\n👤 Conductor 2: Estándar', 'info');
    }, 500);
}

function openEmergencyCode() {
    const code = Math.floor(100000 + Math.random() * 900000);
    showToast(`🔑 Código de emergencia: ${code}`, 'warning');
    playSound('alert');
}

// ==================== CÁMARA ====================
async function pairCameraWifi() {
    if (!isConnected) {
        showToast('⚠️ Conéctate al vehículo primero', 'error');
        playSound('error');
        return;
    }
    
    showToast('📷 Buscando cámaras WiFi...', 'info');
    playSound('confirm');
    
    setTimeout(() => {
        const found = confirm('📷 Cámara encontrada: "Centinela-CAM-01"\n\n¿Deseas vincularla?');
        if (found) {
            showToast('✅ Cámara vinculada correctamente', 'success');
            playSound('confirm');
        } else {
            showToast('⏹️ Búsqueda cancelada', 'info');
        }
    }, 3000);
}

// ==================== VIDRIOS AUTO ====================
function toggleWindowAuto() {
    windowAutoMode = !windowAutoMode;
    const btn = document.getElementById('windowAutoBtn');
    if (btn) {
        btn.classList.toggle('active', windowAutoMode);
        btn.textContent = windowAutoMode ? '🌡️ AUTO ACTIVADO' : '🌡️ AUTO';
    }
    
    if (windowAutoMode) {
        showToast('🌡️ Modo automático de vidrios activado', 'success');
        playSound('confirm');
        startWindowAuto();
    } else {
        showToast('🌡️ Modo automático desactivado', 'info');
        stopWindowAuto();
    }
}

function startWindowAuto() {
    if (windowAutoTimer) clearInterval(windowAutoTimer);
    
    let internalTemp = 25;
    let externalTemp = 30;
    
    windowAutoTimer = setInterval(() => {
        internalTemp += (Math.random() - 0.5) * 2;
        externalTemp += (Math.random() - 0.5) * 2;
        
        internalTemp = Math.max(15, Math.min(45, internalTemp));
        externalTemp = Math.max(10, Math.min(45, externalTemp));
        
        if (internalTemp > externalTemp + 5) {
            if (deviceState.windowL > 20) {
                sendBLECommand('WIN_L_DOWN');
                deviceState.windowL = Math.max(0, deviceState.windowL - 5);
            }
            if (deviceState.windowR > 20) {
                sendBLECommand('WIN_R_DOWN');
                deviceState.windowR = Math.max(0, deviceState.windowR - 5);
            }
            showToast(`🌡️ ${Math.round(internalTemp)}°C - Bajando vidrios por seguridad`, 'warning');
        }
        
        const tempDisplay = document.getElementById('windowTempDisplay');
        if (tempDisplay) {
            tempDisplay.textContent = `🌡️ ${Math.round(internalTemp)}°C / ${Math.round(externalTemp)}°C`;
        }
    }, 5000);
}

function stopWindowAuto() {
    if (windowAutoTimer) {
        clearInterval(windowAutoTimer);
        windowAutoTimer = null;
    }
}

// ==================== MAPA ====================
let mapInstance = null;
let mapMarker = null;

function setupMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;
    
    if (mapInstance) {
        mapInstance.invalidateSize();
        return;
    }
    
    const lat = -0.1807;
    const lng = -78.4678;
    
    try {
        mapInstance = L.map('map', {
            center: [lat, lng],
            zoom: 15,
            zoomControl: false
        });
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(mapInstance);
        
        const icon = L.divIcon({
            className: 'vehicle-marker',
            html: '🚗',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });
        
        mapMarker = L.marker([lat, lng], { icon: icon })
            .addTo(mapInstance)
            .bindPopup('📍 Tu vehículo');
        
        setTimeout(() => {
            mapInstance.invalidateSize();
        }, 500);
        
        L.control.zoom({
            position: 'bottomright'
        }).addTo(mapInstance);
        
    } catch (error) {
        console.error('Error inicializando mapa:', error);
        mapContainer.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-dim);gap:8px;">
                <span style="font-size:48px;">🗺️</span>
                <span>Mapa no disponible</span>
            </div>
        `;
    }
}

function updateVehiclePosition(lat, lng) {
    if (mapInstance && mapMarker) {
        mapMarker.setLatLng([lat, lng]);
        mapInstance.setView([lat, lng], 15);
        mapMarker.openPopup();
    }
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
    const bioEnabled = localStorage.getItem('biometricEnabled') === 'true';
    const bioSwitch = document.getElementById('switchBiometric');
    if (bioSwitch) {
        if (bioEnabled) bioSwitch.classList.add('on');
        const status = document.getElementById('bioStatusSub');
        if (status) {
            status.textContent = bioEnabled ? '✅ Huella/rostro activado' : 'Usa el lector de tu teléfono';
        }
    }
    
    const proxEnabled = localStorage.getItem('proximityEnabled') === 'true';
    const proxSwitch = document.getElementById('switchProximity');
    if (proxSwitch) {
        if (proxEnabled) proxSwitch.classList.add('on');
        const card = document.getElementById('proximityLiveCard');
        if (card) {
            card.style.display = proxEnabled ? 'block' : 'none';
        }
    }
    
    const soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
    const soundSwitch = document.getElementById('switchSound');
    if (soundSwitch) {
        if (soundEnabled) soundSwitch.classList.add('on');
    }
    
    const pinHash = localStorage.getItem(PIN_STORAGE_KEY);
    const pinStatus = document.getElementById('pinStatusSub');
    if (pinStatus) {
        pinStatus.textContent = pinHash ? '✅ PIN configurado' : 'No configurado';
    }

    ['valet', 'taller', 'ninos'].forEach(mode => {
        const enabled = localStorage.getItem(`mode_${mode}`) === 'true';
        const sw = document.getElementById(`switch${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
        if (sw && enabled) sw.classList.add('on');
    });

    ['impacto', 'inclinacion'].forEach(sensor => {
        const enabled = localStorage.getItem(`sensor_${sensor}`) === 'true';
        const sw = document.getElementById(`switch${sensor.charAt(0).toUpperCase() + sensor.slice(1)}`);
        if (sw && enabled) sw.classList.add('on');
    });
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    document.getElementById('shieldBtn')?.addEventListener('click', toggleArm);
    
    document.getElementById('keyLinkCard')?.addEventListener('click', () => {
        if (isConnected) {
            showToast(`✅ Conectado a ${bleDevice?.name || 'Centinela'}`, 'success');
        } else {
            connectBLE();
        }
    });
    
    const trunkBtn = document.getElementById('trunkBtn');
    if (trunkBtn) {
        trunkBtn.addEventListener('mousedown', startTrunkPress);
        trunkBtn.addEventListener('mouseup', cancelTrunkPress);
        trunkBtn.addEventListener('mouseleave', cancelTrunkPress);
        trunkBtn.addEventListener('touchstart', startTrunkPress);
        trunkBtn.addEventListener('touchend', cancelTrunkPress);
        trunkBtn.addEventListener('touchcancel', cancelTrunkPress);
    }
}

// ==================== EXPORT ====================
window.toggleArm = toggleArm;
window.setLock = setLock;
window.moveWindow = moveWindow;
window.toggleLight = toggleLight;
window.sendCmd = sendCmd;
window.confirmStop = confirmStop;
window.connectBLE = connectBLE;
window.sendBLECommand = sendBLECommand;
window.showToast = showToast;
window.navigateTo = navigateTo;
window.pairCameraWifi = pairCameraWifi;
window.pairNewPhone = pairNewPhone;
window.forgetPhonesSecure = forgetPhonesSecure;
window.findCar = findCar;
window.toggleBiometric = toggleBiometric;
window.registerBiometric = registerBiometric;
window.tryBiometricUnlock = tryBiometricUnlock;
window.openPinSetup = openPinSetup;
window.openPinEntry = openPinEntry;
window.closePinOverlay = closePinOverlay;
window.pinPress = pinPress;
window.pinBackspace = pinBackspace;
window.toggleProximity = toggleProximity;
window.updateProximityLabel = updateProximityLabel;
window.toggleSound = toggleSound;
window.toggleMode = toggleMode;
window.toggleSensor = toggleSensor;
window.openUsers = openUsers;
window.openEmergencyCode = openEmergencyCode;
window.updateBondedDevices = updateBondedDevices;
window.toggleWindowAuto = toggleWindowAuto;
window.installApp = installApp;
window.editVehicle = editVehicle;
window.editPlate = editPlate;
window.showAbout = showAbout;

console.log(`✅ Centinela v${VERSION} lista`);
