#ifndef ESTADOS_H
#define ESTADOS_H

// ==========================================
// CENTINELA v5.0 - ESTADOS DEL SISTEMA
// ==========================================

enum EstadoSistema {
    OFF,
    PRESENCIA,
    ACC,
    IGN,
    ARRANCANDO,
    ENCENDIDO,
    ALARMA
};

extern EstadoSistema estadoActual;

#endif