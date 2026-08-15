#ifndef CONFIG_H
#define CONFIG_H

// ==========================================
// CENTINELA v5.0 - CONFIGURACIÓN GENERAL
// ==========================================

// BLUETOOTH
#define BLE_DEVICE_NAME     "CENTINELA_BT"
#define BLE_SERVICE_UUID    "0000ffe0-0000-1000-8000-00805f9b34fb"
#define BLE_CHAR_UUID       "0000ffe1-0000-1000-8000-00805f9b34fb"
#define MAX_PAIRED_DEVICES  2

// TIMING
#define STATUS_INTERVAL     3000  // ms
#define ALARM_TIMEOUT       300000  // 5 min
#define SENSOR_DEBOUNCE     50  // ms

// VOLTAJES
#define VOLTAGE_MIN         11.5  // V
#define VOLTAGE_CRITICAL    10.5  // V
#define VOLTAGE_MAX         14.8  // V

// DEBUG
#define DEBUG_MODE          true
#define SERIAL_BAUD         115200

#endif