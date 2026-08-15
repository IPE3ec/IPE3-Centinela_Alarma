#include "temporizadores.h"

Temporizador Temporizador_Crear(unsigned long intervalo) {
    Temporizador t;
    t.intervalo = intervalo;
    t.ultimaActivacion = 0;
    t.activo = false;
    return t;
}

void Temporizador_Iniciar(Temporizador* t) {
    t->ultimaActivacion = millis();
    t->activo = true;
}

void Temporizador_Reiniciar(Temporizador* t) {
    t->ultimaActivacion = millis();
}

bool Temporizador_Verificar(Temporizador* t) {
    if (!t->activo) return false;
    if (millis() - t->ultimaActivacion >= t->intervalo) {
        t->ultimaActivacion = millis();
        return true;
    }
    return false;
}

void Temporizador_Detener(Temporizador* t) {
    t->activo = false;
}
