#include "sensores.h"
#include "logger.h"

static bool puertaDriver = false;
static bool puertaPass = false;
static bool puertaTrasera = false;
static bool impacto = false;

void Sensores_Iniciar() {
    pinMode(PIN_PUERTA_DRIVER, INPUT_PULLUP);
    pinMode(PIN_PUERTA_PASS, INPUT_PULLUP);
    pinMode(PIN_PUERTA_TRASERA, INPUT_PULLUP);
    pinMode(PIN_SENSOR_IMPACTO, INPUT_PULLUP);
    pinMode(PIN_VOLTAJE, INPUT);

    puertaDriver = false;
    puertaPass = false;
    puertaTrasera = false;
    impacto = false;

    Logger_Imprimir("SENSORES", "Inicializado");
}

void Sensores_Actualizar() {
    static unsigned long lastDebounce = 0;

    if (millis() - lastDebounce < SENSOR_DEBOUNCE) {
        return;
    }
    lastDebounce = millis();

    puertaDriver = digitalRead(PIN_PUERTA_DRIVER) == LOW;
    puertaPass = digitalRead(PIN_PUERTA_PASS) == LOW;
    puertaTrasera = digitalRead(PIN_PUERTA_TRASERA) == LOW;
    impacto = digitalRead(PIN_SENSOR_IMPACTO) == LOW;
}

bool Sensores_PuertaAbierta() {
    return puertaDriver || puertaPass || puertaTrasera;
}

bool Sensores_Impacto() {
    return impacto;
}

float Sensores_ObtenerVoltaje() {
    int lectura = analogRead(PIN_VOLTAJE);
    float voltaje = (lectura * 3.3 / ADC_MAX_VALUE) * VOLTAGE_DIVIDER;
    return voltaje;
}
