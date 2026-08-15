#include "sabotaje.h"
#include "sensores.h"
#include "logger.h"

static bool sabotajeDetectado = false;

void Sabotaje_Iniciar() {
    sabotajeDetectado = false;
    Logger_Imprimir("SABOTAJE", "Inicializado");
}

void Sabotaje_Actualizar() {
    if (Sensores_Impacto()) {
        sabotajeDetectado = true;
        Logger_Imprimir("SABOTAJE", "Impacto detectado");
    }
}

bool Sabotaje_Detectado() {
    return sabotajeDetectado;
}
