// ========================================
// CENTINELA - PWA COMPLETA v2.0
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
    maxBonded: 2,
    doorOpen: false,
    parked: false
};
let proximityInterval = null;
let countdownInterval = null;
let trunkPressTimer = null;
let windowAutoTimer = null;

// ==================== PIN MANAGEMENT ====================
const PIN_STORAGE_KEY = 'centinela_pin_hash';
const PIN_ATTEMPTS_KEY = 'centinela_pin_attempts';
const MAX_PIN_ATTEMPTS = 3;
let pinBuffer = '';
let pinMode = 'unlock'; // 'unlock' | 'setup' | 'confirm'
let pinConfirmBuffer = '';
let pinCallback = null;

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚗 Centinela PWA v2.0 iniciada');
    initApp();
    checkBLEAvailability();
    loadSettings();
    checkFirstRun();
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
}

function checkFirstRun() {
    const pinHash = localStorage.getItem(PIN_STORAGE_KEY);
    if (!pinHash) {
        document.getElementById('configOverlay').hidden = false;
    } else {
        document.getElementById('configOverlay').hidden = true;
    }
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

        await sendBLECommand('GET_STATUS');
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
        statusDot.style.backgroundColor = '#00C853';
        statusText.textContent = 'Conectado';
        
        document.getElementById('keyLinkTitle').textContent = '✅ Conectado al vehículo';
        document.getElementById('keyLinkSub').textContent = 'Listo para comandos';
        document.getElementById('beam').style.opacity = '1';
        document.getElementById('lightFaultBanner').style.display = 'none';
        
    } else {
        statusPill.classList.remove('connected');
        statusPill.classList.add('disconnected');
        statusDot.style.backgroundColor = '#FF1744';
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
        Object.assign(deviceState, data);
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

    // Estadísticas - CORREGIDO
    if (data.battery !== undefined) {
        document.getElementById('statBattery').textContent = `${data.battery}V`;
    }
    
    // Motor - CORREGIDO: usa engine del estado
    if (data.engine !== undefined) {
        document.getElementById('statMotorTemp').textContent = data.engine ? 'ENCENDIDO' : 'APAGADO';
    }
    
    // Combustible - CORREGIDO: simula combustible basado en vidrios
    if (data.windowL !== undefined) {
        const fuel = Math.round(100 - (data.windowL / 2));
        document.getElementById('statFuel').textContent = `${fuel}%`;
    }
    
    // GPS - CORREGIDO: muestra cantidad de satélites simulados
    if (data.bondedCount !== undefined) {
        const satellites = Math.min(12, 4 + data.bondedCount * 2);
        document.getElementById('statGps').textContent = `${satellites}/12`;
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

    // Puerta
    if (data.doorOpen !== undefined) {
        document.querySelector('.shield-sub b:last-child').textContent = 
            data.doorOpen ? 'puerta abierta' : 'todas cerradas';
    }

    // Actualizar actividad reciente
    updateRecentActivity(data);
}

function updateRecentActivity(data) {
    const feed = document.getElementById('eventFeed');
    const empty = document.getElementById('eventFeedEmpty');
    
    // Limpiar eventos anteriores (excepto el vacío)
    const events = feed.querySelectorAll('.event:not(#eventFeedEmpty)');
    events.forEach(el => el.remove());
    
    // Crear eventos basados en el estado
    const activities = [];
    
    if (data.armed) {
        activities.push({
            title: '🔒 Sistema armado',
            time: 'Hace unos segundos',
            icon: 'ok'
        });
    }
    
    if (data.locked) {
        activities.push({
            title: '🔐 Seguros cerrados',
            time: 'Hace unos segundos',
            icon: 'ok'
        });
    }
    
    if (data.engine) {
        activities.push({
            title: '🚗 Motor encendido',
            time: 'Hace unos segundos',
            icon: 'ok'
        });
    }
    
    if (data.alarmTriggered) {
        activities.push({
            title: '🚨 ¡ALARMA DISPARADA!',
            time: 'Hace unos segundos',
            icon: 'error'
        });
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
    }
}

async function updateBondedDevices() {
    await sendBLECommand('GET_BONDED');
}

// ==================== COMANDOS PRINCIPALES ====================

// ARM/DISARM con cuenta regresiva
async function toggleArm() {
    const isArmed = document.querySelector('.app').getAttribute('data-armed') === 'true';
    
    if (!isArmed) {
        // ARMADO con cuenta regresiva
        showCountdown('Revisando sistema...', [
            'Freno de mano OK ✅',
            'Motor apagado OK ✅',
            'Puertas cerradas OK ✅',
            'Encendiendo motor en...'
        ], () => {
            sendBLECommand('ARM');
            showToast('🔒 Vehículo armado', 'success');
        });
    } else {
        // DESARMADO
        if (confirm('¿Desarmar el vehículo?')) {
            sendBLECommand('DISARM');
            showToast('🔓 Vehículo desarmado', 'info');
        }
    }
}

function showCountdown(title, steps, callback) {
    const overlay = document.getElementById('countdownOverlay');
    if (!overlay) {
        // Crear overlay si no existe
        const newOverlay = document.createElement('div');
        newOverlay.id = 'countdownOverlay';
        newOverlay.className = 'overlay';
        newOverlay.innerHTML = `
            <div class="modal-card" style="text-align:center;">
                <div class="lock-title" id="countdownTitle">${title}</div>
                <div id="countdownSteps" style="margin: 16px 0; text-align:left; font-size:14px; color:var(--text-secondary);"></div>
                <div style="font-size:48px; font-weight:700; color:var(--primary);" id="countdownNumber">3</div>
                <div style="font-size:12px; color:var(--text-dim); margin-top:8px;">Preparando sistema...</div>
            </div>
        `;
        document.body.appendChild(newOverlay);
    }
    
    const overlayEl = document.getElementById('countdownOverlay');
    const stepsEl = document.getElementById('countdownSteps');
    const numberEl = document.getElementById('countdownNumber');
    const titleEl = document.getElementById('countdownTitle');
    
    overlayEl.hidden = false;
    titleEl.textContent = title;
    
    // Mostrar pasos
    let stepIndex = 0;
    stepsEl.innerHTML = '';
    steps.forEach(step => {
        const div = document.createElement('div');
        div.textContent = step;
        div.id = `step-${stepIndex}`;
        div.style.color = 'var(--text-dim)';
        stepsEl.appendChild(div);
        stepIndex++;
    });
    
    // Marcar pasos completados
    let currentStep = 0;
    let count = 3;
    numberEl.textContent = count;
    
    if (countdownInterval) clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
        // Marcar paso actual como completado
        if (currentStep < steps.length - 1) {
            const stepEl = document.getElementById(`step-${currentStep}`);
            if (stepEl) {
                stepEl.style.color = 'var(--success)';
                stepEl.textContent = '✅ ' + stepEl.textContent;
            }
            currentStep++;
        }
        
        count--;
        if (count > 0) {
            numberEl.textContent = count;
        } else {
            numberEl.textContent = '🚀';
            clearInterval(countdownInterval);
            countdownInterval = null;
            
            setTimeout(() => {
                overlayEl.hidden = true;
                if (callback) callback();
            }, 800);
        }
    }, 1000);
}

// Seguros
async function setLock(locked) {
    if (!isConnected) {
        showToast('⚠️ No hay conexión BLE', 'error');
        return;
    }
    const cmd = locked ? 'LOCK' : 'UNLOCK';
    await sendBLECommand(cmd);
    showToast(locked ? '🔒 Seguros cerrados' : '🔓 Seguros abiertos');
}

// ==================== VIDRIOS CON AUTO Y TEMPERATURA ====================
let windowAutoMode = false;
let lastWindowPosition = 0;

async function moveWindow(side, amount) {
    if (!isConnected) {
        showToast('⚠️ No hay conexión BLE', 'error');
        return;
    }
    
    // Si es apertura/cierre total
    if (amount === 100 || amount === -100) {
        const cmd = side === 'L' ? 'WIN_L_' : 'WIN_R_';
        const direction = amount > 0 ? 'UP' : 'DOWN';
        await sendBLECommand(cmd + direction);
        showToast(`Vidrio ${side === 'L' ? 'izquierdo' : 'derecho'} ${direction === 'UP' ? 'cerrado' : 'abierto'} completamente`);
        return;
    }
    
    // Movimiento normal
    const cmd = side === 'L' ? 'WIN_L_' : 'WIN_R_';
    const direction = amount > 0 ? 'UP' : 'DOWN';
    await sendBLECommand(cmd + direction);
    showToast(`Vidrio ${side === 'L' ? 'izquierdo' : 'derecho'} ${direction === 'UP' ? 'subiendo' : 'bajando'}`);
}

// Modo automático de vidrios con temperatura
function toggleWindowAuto() {
    windowAutoMode = !windowAutoMode;
    const btn = document.getElementById('windowAutoBtn');
    if (btn) {
        btn.classList.toggle('active', windowAutoMode);
        btn.textContent = windowAutoMode ? '🌡️ AUTO ACTIVADO' : '🌡️ AUTO';
    }
    
    if (windowAutoMode) {
        showToast('🌡️ Modo automático de vidrios activado', 'success');
        startWindowAuto();
    } else {
        showToast('🌡️ Modo automático desactivado', 'info');
        stopWindowAuto();
    }
}

function startWindowAuto() {
    if (windowAutoTimer) clearInterval(windowAutoTimer);
    
    // Simular temperatura interna y externa
    let internalTemp = 25;
    let externalTemp = 30;
    
    windowAutoTimer = setInterval(() => {
        // Simular cambios de temperatura
        internalTemp += (Math.random() - 0.5) * 2;
        externalTemp += (Math.random() - 0.5) * 2;
        
        internalTemp = Math.max(15, Math.min(45, internalTemp));
        externalTemp = Math.max(10, Math.min(45, externalTemp));
        
        // Lógica de seguridad: si temperatura interna > externa + 5°, bajar vidrios
        if (internalTemp > externalTemp + 5) {
            // Bajar vidrios un poco (seguridad)
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
        
        // Actualizar UI de temperatura
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

// ==================== LUCES ====================
async function toggleLight(lightId) {
    if (!isConnected) {
        showToast('⚠️ No hay conexión BLE', 'error');
        return;
    }
    
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

// ==================== OTRAS ACCIONES ====================

// Maletero con animación mejorada
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
        
        // Animación de progreso
        const degrees = (percent / 100) * 360;
        btn.style.background = `conic-gradient(var(--primary) ${percent}%, var(--bg-card) ${percent}%)`;
        
        if (percent < 30) {
            label.textContent = '🔒 Verificando seguridad...';
        } else if (percent < 60) {
            label.textContent = '🔓 Desbloqueando...';
        } else if (percent < 90) {
            label.textContent = '⬆️ Abriendo maletero...';
        } else {
            label.textContent = '✅ ¡Listo!';
        }
        
        if (progress >= totalTime) {
            clearInterval(trunkPressTimer);
            trunkPressTimer = null;
            label.textContent = '✅ Maletero abierto';
            btn.style.background = 'var(--success)';
            sendBLECommand('TRUNK');
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

// Encontrar auto - Luces + Sirena 15 segundos
async function findCar() {
    if (!isConnected) {
        showToast('⚠️ No hay conexión BLE', 'error');
        return;
    }
    
    showToast('🔍 Buscando vehículo...', 'info');
    
    // Activar sirena
    await sendBLECommand('HORN');
    
    // Parpadear luces
    const lights = ['LOWBEAM', 'HIGHBEAM', 'TURN_L', 'TURN_R'];
    let count = 0;
    const maxFlashes = 6; // 3 segundos (6 flashes)
    
    const flashInterval = setInterval(async () => {
        if (count >= maxFlashes) {
            clearInterval(flashInterval);
            // Apagar todas las luces
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

// Comandos generales
async function sendCmd(cmd, msg) {
    if (!isConnected) {
        showToast('⚠️ No hay conexión BLE', 'error');
        return;
    }
    await sendBLECommand(cmd);
    showToast(msg);
}

// Apagado remoto con verificación
function confirmStop() {
    if (!isConnected) {
        showToast('⚠️ No hay conexión BLE', 'error');
        return;
    }
    
    showCountdown('Verificando condiciones...', [
        'Vehículo detenido ✅',
        'Freno de mano activado ✅',
        'Motor en ralentí ✅',
        'Apagando motor en...'
    ], () => {
        sendBLECommand('STOP_ENGINE');
        showToast('⏹️ Motor apagado', 'success');
    });
}

// ==================== AJUSTES ====================

// Biometría
function toggleBiometric(el) {
    const isOn = el.classList.toggle('on');
    const status = document.getElementById('bioStatusSub');
    status.textContent = isOn ? '✅ Huella/rostro activado' : 'Usa el lector de tu teléfono';
    localStorage.setItem('biometricEnabled', isOn ? 'true' : 'false');
    
    if (isOn) {
        showToast('🔐 Biometría activada', 'success');
        registerBiometric();
    }
}

async function registerBiometric() {
    try {
        showToast('📱 Escanea tu huella o rostro', 'info');
        // Simular éxito
        setTimeout(() => {
            showToast('✅ Biometría registrada', 'success');
        }, 2000);
    } catch (error) {
        console.error('Error registrando biometría:', error);
        showToast('❌ Error al registrar biometría', 'error');
    }
}

async function tryBiometricUnlock() {
    try {
        showToast('📱 Escanea tu huella o rostro', 'info');
        setTimeout(() => {
            document.getElementById('lockOverlay').hidden = true;
            showToast('✅ Desbloqueado', 'success');
        }, 1500);
    } catch (error) {
        showToast('❌ Error de autenticación', 'error');
    }
}

// PIN
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
    const pinHash = localStorage.getItem(PIN_STORAGE_KEY);
    const dots = document.querySelectorAll('#pinDots span');
    const errorEl = document.getElementById('pinError');
    
    if (pinMode === 'setup') {
        pinBuffer += num;
        dots[pinBuffer.length - 1].textContent = '●';
        
        if (pinBuffer.length === 4) {
            // Confirmar PIN
            if (!pinConfirmBuffer) {
                pinConfirmBuffer = pinBuffer;
                pinBuffer = '';
                document.querySelectorAll('#pinDots span').forEach(dot => dot.textContent = '');
                document.getElementById('pinOverlaySub').textContent = 'Confirma tu PIN nuevamente';
                showToast('🔐 Confirma tu PIN', 'info');
                return;
            }
            
            if (pinBuffer === pinConfirmBuffer) {
                // Guardar PIN
                const hash = btoa(pinBuffer);
                localStorage.setItem(PIN_STORAGE_KEY, hash);
                localStorage.removeItem(PIN_ATTEMPTS_KEY);
                showToast('✅ PIN configurado correctamente', 'success');
                document.getElementById('pinStatusSub').textContent = '✅ PIN configurado';
                closePinOverlay();
                document.getElementById('configOverlay').hidden = true;
            } else {
                errorEl.textContent = '❌ Los PIN no coinciden. Intenta de nuevo.';
                pinBuffer = '';
                pinConfirmBuffer = '';
                document.querySelectorAll('#pinDots span').forEach(dot => dot.textContent = '');
                document.getElementById('pinOverlaySub').textContent = 'Ingresa un PIN de 4 dígitos';
            }
        }
        return;
    }
    
    // Modo unlock
    if (pinMode === 'unlock') {
        pinBuffer += num;
        dots[pinBuffer.length - 1].textContent = '●';
        
        if (pinBuffer.length === 4) {
            const inputHash = btoa(pinBuffer);
            const storedHash = localStorage.getItem(PIN_STORAGE_KEY);
            
            if (inputHash === storedHash) {
                // PIN correcto
                localStorage.removeItem(PIN_ATTEMPTS_KEY);
                showToast('✅ PIN correcto', 'success');
                closePinOverlay();
                
                // Cerrar overlays
                document.getElementById('lockOverlay').hidden = true;
                document.getElementById('configOverlay').hidden = true;
                
                // Si había callback, ejecutarlo
                if (pinCallback) {
                    pinCallback();
                    pinCallback = null;
                }
            } else {
                // PIN incorrecto
                let attempts = parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || '0') + 1;
                localStorage.setItem(PIN_ATTEMPTS_KEY, attempts.toString());
                
                const remaining = MAX_PIN_ATTEMPTS - attempts;
                if (remaining <= 0) {
                    errorEl.textContent = '❌ Demasiados intentos. Reinicia la app.';
                    document.getElementById('pinOverlaySub').textContent = 'Bloqueado por seguridad';
                    document.getElementById('pinPad').style.opacity = '0.5';
                    document.getElementById('pinPad').style.pointerEvents = 'none';
                    setTimeout(() => {
                        closePinOverlay();
                        document.getElementById('pinPad').style.opacity = '1';
                        document.getElementById('pinPad').style.pointerEvents = 'auto';
                    }, 30000);
                } else {
                    errorEl.textContent = `❌ PIN incorrecto. Intentos restantes: ${remaining}`;
                    pinBuffer = '';
                    document.querySelectorAll('#pinDots span').forEach(dot => dot.textContent = '');
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

// Proximidad
function toggleProximity(el) {
    const isOn = el.classList.toggle('on');
    const card = document.getElementById('proximityLiveCard');
    card.style.display = isOn ? 'block' : 'none';
    localStorage.setItem('proximityEnabled', isOn ? 'true' : 'false');
    
    if (isOn) {
        showToast('📡 Proximidad activada', 'success');
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
        
        // Auto arm/desarm basado en proximidad
        if (rssi > -55 && !deviceState.armed) {
            // Cerca - armar automáticamente
            sendBLECommand('ARM');
            showToast('🔒 Armado automático por proximidad', 'success');
        } else if (rssi < -75 && deviceState.armed) {
            // Lejos - desarmar
            sendBLECommand('DISARM');
            showToast('🔓 Desarmado automático por proximidad', 'info');
        }
    }, 2000);
}

function stopProximityMonitoring() {
    if (proximityInterval) {
        clearInterval(proximityInterval);
        proximityInterval = null;
    }
}

// Sonido
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

// ==================== VINCULACIÓN DE TELÉFONOS ====================

async function pairNewPhone() {
    if (!isConnected) {
        showToast('⚠️ Conéctate al vehículo primero', 'error');
        return;
    }
    
    // Verificar autenticación
    if (!await checkAuth()) return;
    
    await sendBLECommand('PAIR_MODE');
    showToast('🔓 Modo vinculación abierto por 60 segundos', 'success');
    showToast('📱 Abre la app en el otro teléfono y busca Centinela', 'info');
}

async function forgetPhonesSecure() {
    if (!isConnected) {
        showToast('⚠️ Conéctate al vehículo primero', 'error');
        return;
    }
    
    if (!await checkAuth()) return;
    
    if (confirm('⚠️ ¿Eliminar TODOS los teléfonos vinculados?\n\nEsto liberará los 2 espacios disponibles.')) {
        await sendBLECommand('FORGET_PHONES');
        showToast('🗑️ Todos los teléfonos olvidados', 'warning');
    }
}

async function checkAuth() {
    const pinHash = localStorage.getItem(PIN_STORAGE_KEY);
    const bioEnabled = localStorage.getItem('biometricEnabled') === 'true';
    
    if (!pinHash && !bioEnabled) {
        showToast('⚠️ Configura un método de seguridad primero', 'error');
        return false;
    }
    
    return new Promise((resolve) => {
        // Mostrar overlay de autenticación
        const overlay = document.getElementById('lockOverlay');
        overlay.hidden = false;
        
        pinCallback = () => {
            overlay.hidden = true;
            resolve(true);
        };
        
        // Timeout por si no se autentica
        setTimeout(() => {
            if (!overlay.hidden) {
                overlay.hidden = true;
                resolve(false);
            }
        }, 30000);
    });
}

// ==================== CÁMARA ====================

async function pairCameraWifi() {
    if (!isConnected) {
        showToast('⚠️ Conéctate al vehículo primero', 'error');
        return;
    }
    
    showToast('📷 Buscando cámaras WiFi...', 'info');
    
    // Simular búsqueda de cámara
    setTimeout(() => {
        const found = confirm('📷 Cámara encontrada: "Centinela-CAM-01"\n\n¿Deseas vincularla?');
        if (found) {
            showToast('✅ Cámara vinculada correctamente', 'success');
        } else {
            showToast('⏹️ Búsqueda cancelada', 'info');
        }
    }, 3000);
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
                <span style="font-size:12px;">Conéctate al vehículo para ver ubicación</span>
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
    
    // Maletero
    const trunkBtn = document.getElementById('trunkBtn');
    if (trunkBtn) {
        trunkBtn.addEventListener('mousedown', startTrunkPress);
        trunkBtn.addEventListener('mouseup', cancelTrunkPress);
        trunkBtn.addEventListener('mouseleave', cancelTrunkPress);
        trunkBtn.addEventListener('touchstart', startTrunkPress);
        trunkBtn.addEventListener('touchend', cancelTrunkPress);
        trunkBtn.addEventListener('touchcancel', cancelTrunkPress);
    }
    
    // Encontrar auto
    document.querySelector('.ctrl-btn:nth-child(2)')?.addEventListener('click', findCar);
}

// ==================== EXPORT ====================
window.toggleArm = toggleArm;
window.setLock = setLock;
window.moveWindow = moveWindow;
window.toggleLight = toggleLight;
window.sendCmd = sendCmd;
window.confirmStop = confirmStop;
window.pairPhoneSecure = connectBLE;
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
window.connectBLE = connectBLE;
window.sendBLECommand = sendBLECommand;
window.showToast = showToast;
window.navigateTo = navigateTo;
window.pairCameraWifi = pairCameraWifi;
window.pairNewPhone = pairNewPhone;
window.forgetPhonesSecure = forgetPhonesSecure;
window.toggleWindowAuto = toggleWindowAuto;
window.findCar = findCar;

console.log('✅ Centinela PWA v2.0 lista');

// Inicializar
setTimeout(() => {
    if (localStorage.getItem(PIN_STORAGE_KEY)) {
        document.getElementById('configOverlay').hidden = true;
    }
}, 500);
