#include "maquina_estados.h"

void MaquinaEstados_Iniciar() {
    estadoActual = OFF;
}

void MaquinaEstados_Actualizar() {
    static EstadoSistema estadoAnterior = OFF;

    if (estadoActual != estadoAnterior) {
        estadoAnterior = estadoActual;
        Sistema_SetEstado(estadoActual);
    }
}
