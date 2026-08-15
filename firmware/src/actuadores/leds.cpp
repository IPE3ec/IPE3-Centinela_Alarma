#include "leds.h"

void LEDS_Iniciar() {
    pinMode(PIN_LED_STATUS, OUTPUT);
    digitalWrite(PIN_LED_STATUS, LOW);
}

void LEDS_Actualizar() {
    static unsigned long lastBlink = 0;
    static bool estado = false;

    if (millis() - lastBlink > 1000) {
        estado = !estado;
        digitalWrite(PIN_LED_STATUS, estado ? HIGH : LOW);
        lastBlink = millis();
    }
}

void LEDS_Encender() {
    digitalWrite(PIN_LED_STATUS, HIGH);
}

void LEDS_Apagar() {
    digitalWrite(PIN_LED_STATUS, LOW);
}
