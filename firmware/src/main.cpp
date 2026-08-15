#include <Arduino.h>
#include "pinout.h"
#include "config.h"
#include "estados.h"
#include "comandos.h"

// ==========================================
// CENTINELA v5.0 - MAIN
// ==========================================

// Variables globales
EstadoSistema estadoActual = OFF;

// Declaración de funciones de módulos
void Sistema_Iniciar();
void Sistema_Actualizar();
void Bluetooth_Iniciar();
void Bluetooth_Actualizar();
void Sensores_Actualizar();
void MaquinaEstados_Actualizar();

void setup() {
    Serial.begin(SERIAL_BAUD);
    Serial.println("\n========================================");
    Serial.println("CENTINELA v5.0 - Iniciando...");
    Serial.println("========================================\n");
    
    Sistema_Iniciar();
    Bluetooth_Iniciar();
    
    Serial.println("✅ Sistema inicializado correctamente\n");
}

void loop() {
    Bluetooth_Actualizar();
    Sensores_Actualizar();
    MaquinaEstados_Actualizar();
    Sistema_Actualizar();
    
    delay(10);
}

// ==========================================
// IMPLEMENTACIONES TEMPORALES (placeholder)
// ==========================================

void Sistema_Iniciar() {
    pinMode(PIN_LED_STATUS, OUTPUT);
    pinMode(PIN_SIRENA, OUTPUT);
    digitalWrite(PIN_LED_STATUS, LOW);
    digitalWrite(PIN_SIRENA, LOW);
    Serial.println("📡 Sistema inicializado");
}

void Sistema_Actualizar() {
    // Heartbeat LED
    static unsigned long lastBlink = 0;
    if (millis() - lastBlink > 1000) {
        digitalWrite(PIN_LED_STATUS, !digitalRead(PIN_LED_STATUS));
        lastBlink = millis();
    }
}

void Bluetooth_Iniciar() {
    Serial.println("📱 Bluetooth: inicializado (placeholder)");
}

void Bluetooth_Actualizar() {
    // Se implementará en bluetooth/bt_centinela.cpp
}

void Sensores_Actualizar() {
    // Se implementará en seguridad/sensores.cpp
}

void MaquinaEstados_Actualizar() {
    // Se implementará en core/maquina_estados.cpp
}