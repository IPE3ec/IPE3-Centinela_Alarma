#include "sistema.h"

static EstadoSistema estadoSistema = OFF;
static Temporizador temporizadorEstado;

void Sistema_Iniciar() {
    estadoSistema = OFF;
    temporizadorEstado = Temporizador_Crear(STATUS_INTERVAL);
    LEDS_Iniciar();
    Sirena_Iniciar();
    Rele_Iniciar();
}

void Sistema_Actualizar() {
    LEDS_Actualizar();
    Sirena_Actualizar();
    Rele_Actualizar();
}

EstadoSistema Sistema_ObtenerEstado() {
    return estadoSistema;
}

void Sistema_SetEstado(EstadoSistema nuevoEstado) {
    estadoSistema = nuevoEstado;
}
