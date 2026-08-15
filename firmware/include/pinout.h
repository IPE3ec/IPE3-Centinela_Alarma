#ifndef PINOUT_H
#define PINOUT_H

// ==========================================
// CENTINELA v5.0 - DEFINICIÓN DE PINES
// ==========================================

// ACTUADORES
#define PIN_SIRENA          25
#define PIN_LED_STATUS      2
#define PIN_RELE_ARRANQUE   26
#define PIN_RELE_ACC        27
#define PIN_RELE_IGN        14

// SENSORES
#define PIN_PUERTA_DRIVER   34
#define PIN_PUERTA_PASS     35
#define PIN_PUERTA_TRASERA  32
#define PIN_SENSOR_IMPACTO  33
#define PIN_VOLTAJE         36  // ADC

// COMUNICACIÓN
#define PIN_BLE_TX          1
#define PIN_BLE_RX          3

// CONFIGURACIÓN ADC
#define ADC_RESOLUTION      12
#define ADC_MAX_VALUE       4095
#define VOLTAGE_DIVIDER     11.0

#endif