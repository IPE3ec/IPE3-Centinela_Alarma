#include "energia.h"
#include "sensores.h"
#include "logger.h"

static float voltajeActual = 0.0;
static bool critico = false;

void Energia_Iniciar() {
    voltajeActual = 0.0;
    critico = false;
    Logger_Imprimir("ENERGIA", "Inicializado");
}

void Energia_Actualizar() {
    voltajeActual = Sensores_ObtenerVoltaje();
    critico = voltajeActual < VOLTAGE_CRITICAL;

    if (critico) {
        Logger_ImprimirValorFloat("ENERGIA", "Voltaje critico", voltajeActual);
    }
}

float Energia_ObtenerVoltaje() {
    return voltajeActual;
}

bool Energia_EsCritico() {
    return critico;
}
