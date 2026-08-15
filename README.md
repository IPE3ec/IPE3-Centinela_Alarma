# Centinela v5.0 — Sistema de Seguridad Vehicular

Centinela es un sistema de alarma y control remoto para vehículos basado en **ESP32** con conectividad **Bluetooth Low Energy** y una interfaz web tipo app instalable (PWA).

## Características

- Armado/desarmado remoto desde el celular
- Control de luces (bajas, altas, direccionales)
- Cierre/apertura de seguros
- Arranque remoto (ACC, IGN, arranque)
- Detección de impacto y sabotaje
- Monitoreo de voltaje de batería
- Historial de eventos y ubicación GPS (frontend)
- App web instalable (PWA)

## Hardware

| Componente | Pin ESP32 | Descripción |
|------------|-----------|-------------|
| Sirena | GPIO 25 | Alarma sonora |
| LED estado | GPIO 2 | Indicador visual |
| Rele arranque | GPIO 26 | Arranque motor |
| Rele ACC | GPIO 27 | Accesorios |
| Rele IGN | GPIO 14 | Ignición |
| Puerta conductor | GPIO 34 | Sensor apertura |
| Puerta pasajero | GPIO 35 | Sensor apertura |
| Puerta trasera | GPIO 32 | Sensor apertura |
| Impacto | GPIO 33 | Sensor golpes |
| Voltaje | GPIO 36 | ADC batería |

## Estructura del proyecto

```
IPE3-Centinela_Alarma/
├── frontend/
│   ├── index.html
│   ├── css/
│   ├── js/
│   └── assets/
└── firmware/
    ├── platformio.ini
    ├── include/
    │   ├── config.h
    │   ├── pinout.h
    │   ├── estados.h
    │   ├── comandos.h
    │   └── *.h
    └── src/
        ├── main.cpp
        ├── core/
        ├── actuadores/
        ├── seguridad/
        └── bluetooth/
```

## Firmware (PlatformIO)

1. Instalar [PlatformIO](https://platformio.org/) (VS Code extension o CLI).
2. Abrir la carpeta `firmware/` como proyecto PlatformIO.
3. Conectar el ESP32 por USB.
4. Compilar y subir:

```bash
pio run --target upload
```

5. Abrir monitor serie:

```bash
pio device monitor
```

## Frontend

Abrir `frontend/index.html` en un navegador compatible con Web Bluetooth (Chrome/Edge). La app permite:

- Conectar al ESP32 por BLE
- Ver estado del sistema y eventos
- Enviar comandos (armar, desarmar, luces, arranque)

## Comandos BLE

| Comando | Descripción |
|---------|-------------|
| `STATUS` | Estado actual del sistema |
| `ARM` | Armar alarma |
| `DISARM` | Desarmar alarma |
| `LOCK` | Cerrar seguros |
| `UNLOCK` | Abrir seguros |
| `START` | Arrancar vehículo |
| `STOP` | Apagar motor |
| `HORN` | Activar sirena |
| `GETMAC` | Obtener MAC |
| `FORGET_ALL` | Olvidar dispositivos |

## Estado del desarrollo

- Firmware: módulos integrados, máquina de estados básica
- Frontend: interfaz funcional, navegación y overlays
